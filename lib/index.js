#!/usr/bin/env node
'use strict';

var Express = require('express');
var MUtils = require('openhim-mediator-utils');
var enableDestroy = require('server-graceful-shutdown');
var logger = require('winston');
var Config = require('./config');
var ConfigHandler = require('./configHandler');
var Utils = require('./utils');

var apiConfig = Object.assign({}, Config.getApiConfig());
var mediatorConfig = Object.assign({}, Config.getMediatorConfig());
var app = Express();

var server;
var winstonLogFormat;

app.get('/heartbeat', function(req, res) {
  res.send({
    uptime: process.uptime()
  });
});

function start(callback) {
  Object.defineProperty(app.locals, 'config', {value: apiConfig});

  logger.clear();
  
  winstonLogFormat = logger.format.printf(function(info) {
    return `${info.timestamp} ${info.level}: ${info.message}`;
  });
  
  logger.remove(new logger.transports.Console());
  
  logger.add(new logger.transports.Console({
    format: logger.format.combine(logger.format.timestamp(), logger.format.colorize(), winstonLogFormat),
    level: 'info'
  }));

  var apiOpts = Object.assign({urn: mediatorConfig.urn}, apiConfig.api);

  MUtils.registerMediator(apiOpts, mediatorConfig, function(error) {
    if (error) {
      logger.error('Could not register mediator', error);
      throw error;
    }

    logger.info('Successfully registered mediator');

    MUtils.fetchConfig(apiOpts, (error, initialConfig) => {
      if (error) {
        logger.error('Failed to fetch initial config', error.stack);
        throw error;
      } else {
        logger.info('Received initial config.');
        logger.debug(JSON.stringify(initialConfig));
        mediatorConfig.config = initialConfig;
        ConfigHandler.updateEndpointConfig(app, apiConfig, apiOpts, initialConfig, mediatorConfig, function(error){
          if (error) {
            logger.error(error);
          }
        });

        server = app.listen(apiConfig.port, function() {
          if(apiConfig.heartbeat){
            var eventEmitter = MUtils.activateHeartbeat(apiOpts);
            eventEmitter.on('error', function(error) {
              logger.error('Sending heartbeat failed', error);
            });

            eventEmitter.on('config', function(newConfig){
              logger.info('Received updated config:');
              logger.debug(JSON.stringify(newConfig));

              mediatorConfig.config = newConfig;

              ConfigHandler.updateEndpointConfig(app, apiConfig, apiOpts, newConfig, mediatorConfig, function(error){
                if (error) {
                  logger.error(error);
                }
              });

              Utils.displayEndpoints(app, (msg, routes) => {
                logger.info(msg, routes.toString());
              });
            });
          }

          Utils.displayEndpoints(app, (msg, routes) => {
            logger.info(msg, routes.toString());
          });

          callback(true);
          enableDestroy(server);
        });
      }
    });
  });
}
exports.start = start;

function stop (callback) {
  logger.info('closing FQ server...');

  server.shutdown(() => {
    logger.info('FQ server closed.');
    callback();
  });
}
exports.stop = stop;

// Create the config and start up the app
if (!module.parent) {
  start(function () {
    logger.info('App started on port %s', apiConfig.port);
  });
}
