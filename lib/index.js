#!/usr/bin/env node
'use strict';

var Express = require('express');
var MUtils = require('openhim-mediator-utils');
var enableDestroy = require('server-graceful-shutdown');
var Winston = require('winston');
var Config = require('./config');
var ConfigHandler = require('./configHandler');
var Utils = require('./utils');

var apiConfig = Object.assign({}, Config.getApiConfig());
var mediatorConfig = Object.assign({}, Config.getMediatorConfig());

var server;
var app = Express();

app.get('/heartbeat', function(req, res) {
  res.send({
    uptime: process.uptime()
  });
});

function handleConfigError(err) {
  Winston.error(err);
  process.exit(1);
}

function start(callback) {
  Object.defineProperty(app.locals, 'config', {value: apiConfig});

  Winston.clear();
  Winston.add(Winston.transports.Console, {timestamp: true, level: apiConfig.logLevel});

  var apiOpts = Object.assign({urn: mediatorConfig.urn}, apiConfig.api);

  MUtils.registerMediator(apiOpts, mediatorConfig, function(err) {
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
        mediatorConfig.config = initialConfig;
        ConfigHandler.updateEndpointConfig(app, apiConfig, apiOpts, initialConfig, mediatorConfig, function(err){
          if(err){
            handleConfigError(err);
          }
        });

        Winston.info('Successfully registered mediator');

        var port = apiConfig.port;
        server = app.listen(port, function() {
          if(apiConfig.heartbeat){
            var eventEmitter = MUtils.activateHeartbeat(apiOpts);
            eventEmitter.on('error', function(err) {
              Winston.error('Sending heartbeat failed', err);
            });

            eventEmitter.on('config', function(newConfig){
              Winston.info('Received updated config:');
              Winston.debug(JSON.stringify(newConfig));

              mediatorConfig.config = newConfig;

              ConfigHandler.updateEndpointConfig(app, apiConfig, apiOpts, newConfig, mediatorConfig, function(err){
                if(err){
                  handleConfigError(err);
                }
              });

              Utils.displayEndpoints(app, (msg, routes) => {
                Winston.info(msg, routes.toString());
              });
            });
          }

          Utils.displayEndpoints(app, (msg, routes) => {
            Winston.info(msg, routes.toString());
          });
          Winston.info('App started on port %s', port);
          callback(true);
        });
        enableDestroy(server);
      }
    });
  });
}
exports.start = start;

function stop (callback) {
  Winston.info('closing FQ server...');

  server.shutdown(() => {
    Winston.info('FQ server closed.');
    callback();
  });
}
exports.stop = stop;

// Create the config and start up the app
if (!module.parent) {
  start(() => {
    Winston.info('Finished');
  });
}
