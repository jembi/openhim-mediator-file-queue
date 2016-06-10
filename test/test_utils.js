'use strict';

var rewire = require('rewire');
var worker = require('../lib/worker');

var index = rewire('../lib/index');

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
        index.__set__('WorkerInstances', workerList);
    });  
    var findWorker = index.__get__('findWorker');

    done(findWorker);
};