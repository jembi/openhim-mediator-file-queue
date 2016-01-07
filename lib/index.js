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

var app = Express();

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
function writeMetadata(filename, path, req) {
  var metadataFile = Utils.getMetadataFilename(filename);
  
  var metadata = {
    method: req.method,
    url: req.url,
    headers: req.headers
  };
  var metadataPath = Path.join(path, metadataFile);
  FS.writeFileSync(metadataPath, JSON.stringify(metadata));
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
  var worker = new Worker({
    name: endpoint.name,
    url: endpoint.url,
    paused: endpoint.paused,
    parallel: endpoint.parallel,
    updateTx: updateTx,
    forwardMetadata: forwardMetadata,
    apiOpts: apiOpts
  });

  // Clear the worker's queue and repopulate it
  app.post('/workers/' + worker.name + '/repopulate', function(req, res) {
    worker.repopulate();
    res.status(200).send('Worker repopulated');
  });

  // Register an endpoint for pausing/resuming the worker
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

  // Register an endpoint for handling requests
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
      writeMetadata(filename, worker.queuePath, req);
    }

    var filePath = Path.join(worker.queuePath, filename);
    var stream = req.pipe(FS.createWriteStream(filePath));
    stream.on('error', function(err) {
      Stats.increment('errors');
      Winston.error('Handling request for %s failed', endpoint.path);
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
          timestamp: new Date().toString()
        }
      };
      res.status(202).type('application/json+openhim').send(mediatorResponse);
    });
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
        Winston.error('Could not register mediator');
        process.exit(1);
      }

      MUtils.activateHeartbeat(apiOpts);

      config.get('endpoints').forEach(function(endpoint) {
        setUpEndpoint(endpoint, apiOpts);
      });

      var port = process.env.PORT || config.get('port');
      app.listen(port, function() {
        Winston.info('App started on port %s', port);
      });
    });
  });
}
