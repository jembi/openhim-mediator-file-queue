#!/usr/bin/env node

'use strict';

var enableDestroy = require('server-graceful-shutdown');
const http = require('http');
const URL = require('url');
const testUtils = require('./utils');
var Winston = require('winston');

const response = [{
  _id: '575946b94a20db7a4e071ae4',
  name: 'Test Channel',
  urlPattern: '^/test$',
  routes: [{
    name: 'test route',
    url: ''
  }]
}, {
  _id: '111111',
  name: 'Another Channel',
  urlPattern: '^/another$',
  routes: [{
    name: 'another route',
    url: ''
  }]
}];

const server = http.createServer(function (req, res) {
  let body = '';
  req.on('data', function (chunk) {
    body += chunk.toString();
  });
  req.on('end', function () {
    Winston.info(`Received ${req.method} request to ${req.url}`);
    Winston.info(`with body: ${body}`);
    let url = URL.parse(req.url);
    if (url.path === '/channels') {
      res.writeHead(200);
      res.end(JSON.stringify(response));
    } else if (url.path === '/channels/575946b94a20db7a4e071ae4') {
      res.writeHead(200);
      res.end();
    } else if (url.path === '/authenticate/root@openhim.org') {
      res.writeHead(200);
      res.end(JSON.stringify({
        ts: new Date(),
        salt: '123'
      }));
    } else if (url.path === '/mediators') {
      res.writeHead(201);
      res.end();
    }else if (url.path === '/mediators/urn:uuid:a15c3d48-0686-4c9b-b375-f68d2f244a33/heartbeat') {
      res.writeHead(200);
      var endpoints = [];
      endpoints.push(testUtils.validConf);
      var endPointConf = {
        endpoints: endpoints
      };
      res.end(JSON.stringify(endPointConf));
    } else {
      Winston.info('Error: no path matched');
      res.writeHead(500);
      res.end();
    }
  });
});

function start (callback) {
  server.setTimeout(2000);
  server.listen(7070, function () {
    Winston.info('Listening on 7070');
    callback();
  });

  enableDestroy(server);
}
exports.start = start;

function stop (callback) {
  server.shutdown(callback);
  Winston.info('OpenHim stopped');
}
exports.stop = stop;

if (!module.parent) {
  // if this script is run directly, start the server
  start('first time',() => {Winston.info('OpenHIM Server listening on 7070...');});
}