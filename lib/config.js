'use strict';

var fs = require('fs');
var path = require('path');

exports.getApiConfig = function() {
  return Object.freeze({
    port: process.env.SERVER_PORT || 4002,
    heartbeat: process.env.HEARTBEAT === 'true',
    logLevel: process.env.LOG_LEVEL || 'info',
    api: Object.freeze({
      apiURL: process.env.API_URL || 'https://localhost:8080',
      username: process.env.API_USERNAME || 'root@openhim.org',
      password: process.env.API_PASSWORD || 'openhim-password',
      trustSelfSigned: process.env.TRUST_SELF_SIGNED === 'true'
    })
  });
};

exports.getMediatorConfig = function() {
  var mediatorConfigFile = path.resolve('config', 'mediator.json');
  const FILE_QUEUE_URN = process.env.FILE_QUEUE_URN || 3;
  let config = JSON.parse(fs.readFileSync(mediatorConfigFile));
  config.urn += FILE_QUEUE_URN;
  return config;
};
