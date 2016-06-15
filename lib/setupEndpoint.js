'use strict';

var BodyParser = require('body-parser');
var Crypto = require('crypto');
var FS = require('graceful-fs');
var Path = require('path');
var Stats = require('./stats');
var Type = require('type-is');
var Utils = require('./utils');
var Worker = require('./worker');
var Winston = require('winston');
var removeRoute = require('express-remove-route');

var WorkerInstances = [];

// Adds an extension to the filename based on the content-type request header
function addExt(filename, req) {
  switch (Type(req, ['json', 'xml'])) {
    case 'json':
      return filename + '.json';
    case 'xml':
      return filename + '.xml';
    default:
      return filename + '.txt';
  }
}

// Write metadata to file
function writeMetadata(filename, path, req, callback) {
  var metadataFile = Utils.getMetadataFilename(filename);
  
  var metadata = {
    method: req.method,
    url: req.url,
    headers: req.headers
  };
  var metadataPath = Path.join(path, metadataFile);
  FS.writeFile(metadataPath, JSON.stringify(metadata), function(err) {
    callback(err);
  });
}

function findWorker (endpoint){
  var result = false;
  for(var w in WorkerInstances){
    // Winston.info(WorkerInstances[w]);
    var options = WorkerInstances[w].getOptions();
    if(options.name===endpoint.name){
      Winston.info('Existing Worker Found');
      Winston.debug(JSON.stringify(options));
      return WorkerInstances[w];
    }
  }

  return result;
}

exports.destroyWorkers = function(callback) {
  for(var w in WorkerInstances){
    WorkerInstances[w] = null
    delete WorkerInstances[w]
  }
  WorkerInstances = []
  Worker.prototype = null
  Winston.info('Workers destroyed')

  callback()
}

// Set up an endpoint based on the config
exports.setUpEndpoint = function(app, endpoint, apiOpts) {
  Winston.info('Start setting up endpoint')
  var updateTx;
  if (endpoint.updateTx && endpoint.updateTx === true) {
    updateTx = true;
  } else {
    updateTx = false;
  }
  var forwardMetadata = endpoint.forwardMetadata === true;

  // update if worker already exists with same name
  var worker = findWorker(endpoint)
  if(worker){
    worker.updateWorker(endpoint, function(err){
      Stats.increment('errors');
      Winston.error(err);
    });
  } else {
    worker = new Worker({
      name: endpoint.name,
      url: endpoint.url,
      paused: endpoint.paused,
      parallel: endpoint.parallel,
      updateTx: updateTx,
      forwardMetadata: forwardMetadata,
      apiOpts: apiOpts
    });
    WorkerInstances.push(worker);
  }

  // Clear the worker's queue and repopulate it
  if(removeRoute.findRoute(app,'/workers/' + worker.name + '/repopulate')){
    removeRoute(app, '/workers/' + worker.name + '/repopulate');
  }
  app.post('/workers/' + worker.name + '/repopulate', function(req, res) {
    worker.repopulate();
    res.status(200).send('Worker repopulated');
  });

  // Register an endpoint for pausing/resuming the worker
  if(removeRoute.findRoute(app, '/workers/' + worker.name)){
    removeRoute(app, '/workers/' + worker.name);
  }
  app.put('/workers/' + worker.name, BodyParser.json(), function(req, res) {
    if (typeof req.body.paused !== 'boolean') {
      return res.status(400).send('Missing or invalid property: paused');
    }
    if (req.body.paused) {
      worker.pause();
      res.status(200).send('Worker paused');
    } else {
      worker.resume();
      res.status(200).send('Worker resumed');
    }
  });
  Winston.info('Worker for endpoint %s available at /workers/%s', endpoint.path, worker.name);
  
  function handleError(err, path) {
    Stats.increment('errors');
    Winston.error('Handling request for %s failed', path, err);
  }
  
  function writeBodyAndRespond(req, res, filename, next) {
    var filePath = Path.join(worker.queuePath, filename);
    var stream = req.pipe(FS.createWriteStream(filePath));
    stream.on('error', function(err) {
      handleError(err, endpoint.path);
      return next(err);
    });
    stream.on('finish', function() {
      Winston.info('File saved to ./%s', Path.relative(process.cwd(), filePath));
      worker.addToQueue(filename, function(err) {
        if (err) {
          Stats.increment('errors');
          Winston.error(err, {path: filename});
        }
      });

      var mediatorResponse = {
        'x-mediator-urn': apiOpts.urn,
        status: 'Processing',
        response: {
          status: 202,
          body: 'Request added to queue\n',
          timestamp: new Date().toISOString()
        }
      };
      res.status(202).type('application/json+openhim').send(mediatorResponse);
      next();
    });
  }

  // Register an endpoint for handling requests
  if(removeRoute.findRoute(app, endpoint.path)){
    removeRoute(app, endpoint.path);
  }
  app.all(endpoint.path, function(req, res, next) {
    Winston.info('Handling request for %s', endpoint.path);

    var filename;
    if (req.headers['x-openhim-transactionid']) {
      // set file name to transaction ID
      filename = req.headers['x-openhim-transactionid'];
    } else {
      // Generate an invalid transaction ID
      filename = Crypto.randomBytes(12).toString('hex').replace(/./, 'x');
    }
    filename = addExt(filename, req);
    
    if (forwardMetadata) {
      writeMetadata(filename, worker.queuePath, req, function(err) {
        if (err) {
          return handleError(err, endpoint.path);
        } else {
          return writeBodyAndRespond(req, res, filename, next);
        }
      });
    } else {
      return writeBodyAndRespond(req, res, filename, next);
    }
  });
}