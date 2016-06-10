#!/usr/bin/env node
'use strict';

var BodyParser = require('body-parser');
var Confit = require('confit');
var Crypto = require('crypto');
var Express = require('express');
var FS = require('graceful-fs');
var MUtils = require('openhim-mediator-utils');
var OnFinished = require('on-finished');
var Path = require('path');
var Stats = require('./stats');
var Type = require('type-is');
var Utils = require('./utils');
var Worker = require('./worker');
var Winston = require('winston');
var removeRoute = require('express-remove-route');

var app = Express();

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

// Set up an endpoint based on the config
function setUpEndpoint(endpoint, apiOpts) {
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

app.get('/heartbeat', function(req, res) {
  res.send({
    uptime: process.uptime()
  });
});

app.use(function(req, res, next) {
  var start = process.hrtime();
  Stats.increment('requests');
  OnFinished(res, function(err, res) {
    Stats.increment('response_codes.' + res.statusCode);
    Stats.timing('response_time', Utils.millisecondsSince(start));
  });
  next();
});

function handleGeneralError(err) {
  Stats.increment('errors');
  Winston.error(err);
  process.exit(1);
}

function updateEndpointConfig(currentConfig, apiOpts, newConfig, callback){
  if(currentConfig && apiOpts){
    if(newConfig){
      currentConfig.set('endpoints', Utils.parseJSONIntoArray(newConfig));
    }

    // use default config if nothing new is provided
    currentConfig.get('endpoints').forEach(function(endpoint) {
      setUpEndpoint(endpoint, apiOpts);
    });
    Winston.info('Updated Endpoints config');
    callback(null);
  } else {
    callback('Config update failed because of invalid parameters');
  }
}

function displayEndpoints(){
  Winston.debug('File Queue Endpoints:')
  var routes = app._router.stack;
  for (var key in routes) {
    if (routes.hasOwnProperty(key)) {
      var val = routes[key];
      if(val.route)
      {
        val = val.route;
        Winston.debug(val.path);
      }   
    }
  }
}

// Create the config and start up the app
if (!module.parent) {
  Confit(Path.join(__dirname, '..', 'config')).create(function(err, config) {
    if (err) {
      throw err;
    }

    Object.defineProperty(app.locals, 'config', {value: config});

    Winston.clear();
    Winston.add(Winston.transports.Console, {timestamp: true, level: config.get('log_level')});

    Stats.init(config.get('statsd'));

    var apiOpts = config.get('api');
    var mediatorConf = config.get('mediatorConf');
    apiOpts.urn = mediatorConf.urn;

    MUtils.registerMediator(apiOpts, mediatorConf, function(err) {
      if (err) {
        Winston.error(err);
        Winston.error('Could not register mediator');
        process.exit(1);
      }

      MUtils.fetchConfig(apiOpts, (err, initialConfig) => {
        if (err) {
          Winston.error('Failed to fetch initial config');
          Winston.error(err.stack);
          process.exit(1);
        } else {
          Winston.info('Received initial config:');
          Winston.debug(JSON.stringify(initialConfig));
          mediatorConf.config = initialConfig
          updateEndpointConfig(config, apiOpts, initialConfig, function(err){
            if(err){
              handleGeneralError(err);
            }
          });

          Winston.info('Successfully registered mediator');

          var port = process.env.PORT || config.get('port');
          app.listen(port, function() {
            var heartbeat = MUtils.activateHeartbeat(apiOpts);
            heartbeat.on('error', function(err) {
              Winston.error('Sending heartbeat failed', err);
            });

            heartbeat.on('config', function(newConfig){
              Winston.info('Received updated config:');
              Winston.debug(JSON.stringify(newConfig));
              
              mediatorConf.config = newConfig;

              updateEndpointConfig(config, apiOpts, newConfig, function(err){
                if(err){
                  handleGeneralError(err);
                }
              });
              displayEndpoints()
            });

            displayEndpoints();
            Winston.info('App started on port %s', port);
          })
        }
      });
    });
  });
}
