'use strict';

const fs = require('graceful-fs');
const tap = require('tap');
const rewire = require('rewire');
const testUtils = require('./utils');
const testServer = require('./test-openhim-server');
const testUpstreamServer = require('./test-upstream-server');
const Winston = require('winston');
const request = require('request');

var index = null;
var setupEndpoint = rewire('../lib/setupEndpoint');

// this forces the use of the test config file
process.env.NODE_ENV = 'test';

function beforeEach(callback) {
  index = rewire('../lib/index');
  testServer.start(() => {
    testUpstreamServer.start(() => {
      Winston.info('Test servers started...');
      callback();
    });
  });
}

function cleanUp(callback){
  Winston.info('teardown');
  setupEndpoint.__set__('WorkerInstances', []);
  setupEndpoint.destroyWorkers(() => {
    // Shutdown servers
    testUpstreamServer.stop(() => {
      testServer.stop(() => {
        Winston.info('Test servers stopped');
        callback();
      });
    });
  });
  index = null;
}

// ************************************************
// tests for index.js
// ************************************************
tap.test('should write metadata to file', function(t) {
  var req = {
    method: 'POST',
    url: '/test/url?with=parm&and=another',
    headers: {
      header1: 'val1',
      header2: 'val2'
    }
  };
  var writeMetadata = setupEndpoint.__get__('writeMetadata');
  writeMetadata('test123.json', 'test', req, function(err) {
    t.error(err);
    var file = fs.readFileSync('test/test123-metadata.json', 'utf-8');
    var json = JSON.parse(file);
    t.same(json, req);
    fs.unlinkSync('test/test123-metadata.json');
    t.end();
  });
});

tap.test('should find worker', function(t){
  testUtils.findWorker(function(findWorker){
    t.ok(findWorker(testUtils.validConf));
    t.end();
  });  
});

tap.test('should fail to find worker', function(t){
  testUtils.findWorker(function(findWorker){
    t.notOk(findWorker(testUtils.invalidConf));
    t.end();
  });
});

tap.test('should send file upstream', function(t){
  beforeEach(() => {
    t.plan(3);
    index.start((res) => {
      Winston.info(res);
      const options = {
        url: 'http://root:password@localhost:4002/test',
        body: 'This is a test'
      };
      t.ok(res);
      setTimeout(function() {
        request.post(options, (err, res) => {
          Winston.info(res.body);
          Winston.info(res.statusCode);
          t.equal(res.statusCode, 202);
          setTimeout(function() {
            index.stop(() => {

              cleanUp(() => {
                t.pass();
                t.end();
              });
            });
          }, 2000);
        });
      }, 2000);
    });
  });
});

tap.test('should fail to send file upstream mediator config', function(t){
  beforeEach(() => {
    t.plan(3);
    index.start((res) => {
      Winston.info(res);
      const options = {
        url: 'http://root:password@localhost:4002/invalidPath',
        body: 'This is a test'
      };
      t.ok(res);
      setTimeout(function() {
        request.post(options, (err, res) => {
          Winston.info(res.body);
          Winston.info(res.statusCode);
          t.equal(res.statusCode, 404);
          setTimeout(function() {
            index.stop(() => {
              cleanUp(() => {
                t.pass();
                t.end();
              });
            });
          }, 2000);
        });
      }, 2000);
    });
  });
});
