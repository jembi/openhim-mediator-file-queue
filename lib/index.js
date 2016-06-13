#!/usr/bin/env node
'use strict';

var Confit = require('confit');
var Express = require('express');
var MUtils = require('openhim-mediator-utils');
var OnFinished = require('on-finished');
var Path = require('path');
var Stats = require('./stats');
var Utils = require('./utils');
var ConfigHandler = require('./configHandler');
var Winston = require('winston');

var app = Express();

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

function handleConfigError(err) {
  Stats.increment('errors');
  Winston.error(err);
  process.exit(1);
}

function start(callback) {
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
          ConfigHandler.updateEndpointConfig(app, config, apiOpts, initialConfig, function(err){
            if(err){
              handleConfigError(err);
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

              ConfigHandler.updateEndpointConfig(app, config, apiOpts, newConfig, function(err){
                if(err){
                  handleConfigError(err);
                }
              });

              Utils.displayEndpoints(app, (msg, routes) => {
                Winston.info(msg, routes.toString())
              });
            });

            Utils.displayEndpoints(app, (msg, routes) => {
              Winston.info(msg, routes.toString())
            });
            Winston.info('App started on port %s', port);
            callback();
          })
        }
      });
    });
  });
}
exports.start = start

function stop (callback) {
  app.close(callback)
}
exports.stop = stop

// Create the config and start up the app
if (!module.parent) {
   start(() => 'File Queue Started')
}
