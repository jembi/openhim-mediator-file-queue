'use strict';

var rewire = require('rewire');
var worker = require('../lib/worker');

var setupEndpoint = rewire('../lib/setupEndpoint');

// commonly used variables/objects
exports.validConf = {
  "name": "echoServer",
  "url": "http://localhost:7000",
  "paused": false,
  "parallel": 5,
  "updateTx": true,
  "forwardMetadata": false
};

exports.invalidConf = {
  "name": "invalidEnpoint",
  "url": "http://localhost:7000",
  "paused": false,
  "parallel": 5,
  "updateTx": true,
  "forwardMetadata": false
};

exports.noUrlConf = {
  "name": "echoServer",
  "paused": false,
  "parallel": 5,
  "updateTx": true,
  "forwardMetadata": false
};

exports.validMediatorConf = {
  "urn": "urn:uuid:a15c3d48-0686-4c9b-b375-f68d2f244a33",
  "version": "2.0.2",
  "name": "file-queue",
  "description": "Valid mediator config",
  "defaultChannelConfig": [],
  "endpoints": [
    {
      "name": "File queue",
      "host": "localhost",
      "path": "/workers/test",
      "port": "4002",
      "primary": true,
      "type": "http"
    }
  ],
  "configDefs": [],
  "config": {
    "endpoints": [
      {
        "name": "Test Endpoint",
        "path": "/test",
        "url": "http://localhost:8000",
        "paused": false,
        "parallel": 2,
        "updateTx": true,
        "forwardMetadata": true
      }
    ]
  }
}

function setupWorker(done){
  var config = {
      "name": "echoServer",
      "path": "/test",
      "url": "http://localhost:8000",
      "paused": false,
      "parallel": 2,
      "updateTx": true,
      "forwardMetadata": true
    };
  var newWorker = new worker(config);
  done(newWorker);
};

exports.setupWorker = setupWorker;

exports.findWorker = function(done){
    var workerList = []
    setupWorker(function(workerObj){
        workerList.push(workerObj);
        setupEndpoint.__set__('WorkerInstances', workerList);
    });  
    var findWorker = setupEndpoint.__get__('findWorker');

    done(findWorker);
};