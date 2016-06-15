'use strict';

const fs = require('graceful-fs');
const tap = require('tap');
const rewire = require('rewire');
const utils = require('../lib/utils');
const testUtils = require('./utils');
const testServer = require('./test-openhim-server');
const testUpstreamServer = require('./test-upstream-server');
const OpenHIM = require('../lib/openhim.js');
var Express = require('express');
var Confit = require('confit');
var Path = require('path');
var Winston = require('winston');
const request = require('request');
var ConfigHandler = require('../lib/configHandler');
const mutils = require('openhim-mediator-utils')

var index = rewire('../lib/index');
var setupEndpoint = rewire('../lib/setupEndpoint');

const opts = {
  username: 'root@openhim.org',
  password: 'password',
  apiURL: 'http://localhost:8080'
}

function readWriteSync(filename) {
  var data = fs.readFileSync(filename, 'utf-8')
  
  var configJson = JSON.parse(data)
  configJson.api.apiURL = "http://localhost:7070";
  configJson.heartbeat = false;
  Winston.info(JSON.stringify(configJson.api) + ' ' + configJson.heartbeat);
  var newValue = JSON.stringify(configJson, null, 2)

  //Winston.info(newValue)
  fs.writeFileSync(filename, newValue, 'utf-8')

  Winston.info('config file updated for testing')
}

function resetConfigFile(filename) {
  var data = fs.readFileSync(filename, 'utf-8')

  var configJson = JSON.parse(data)
  configJson.api.apiURL = "https://localhost:8080";
  configJson.heartbeat = true;
  Winston.info(JSON.stringify(configJson.api) + ' ' + configJson.heartbeat);
  var newValue = JSON.stringify(configJson, null, 2)

  fs.writeFileSync(filename, newValue, 'utf-8')

  Winston.info('config file updates reversed')
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

function beforeEach() {
  readWriteSync('config/config.json')

  testServer.start(() => {
    Winston.info('OpenHim server started...')
  })
  testUpstreamServer.start(() => {
    Winston.info('Upstream server started...')
  })
}

tap.tearDown(function(done){
  Winston.info('teardown')
  setupEndpoint.__set__('WorkerInstances', []);
  resetConfigFile('config/config.json')

  // Shutdown servers
  testUpstreamServer.stop(() => {
    Winston.info('Upstream stopped')
  })

  testServer.stop(() => {
    Winston.info('OpenHim stopped')
  })
})

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
  beforeEach()
  t.plan(3)
  index.start((res) => {
    Winston.info(res)
    const options = {
      url: 'http://root:password@localhost:4002/test',
      body: "This is a test"
    }
    t.ok(res)
    request.post(options, (err, res) => {
      Winston.info(res.response)
      t.ok(res)
      index.stop(() => {
        setupEndpoint.destroyWorkers(() => {
          Winston.info('FQ Server stopped')
          t.pass('FQ server stopped')
          t.end()
        })
        index.forceStop()
      })
    })
  })
});


// tap.test('should send file upstream', function(t){
//   testServer.start(() => {
//     testUpstreamServer.start(() => {
//       // update test config to point to test server
//       // readWriteSync('config/config.json')

//       index.start((res) => {
//         const options = {
//           url: 'http://root:password@localhost:4002/test',
//           body: "This is a test"
//         }
//         t.ok(res)
//         request.post(options, (err, res) => {
//           Winston.info(res.response)
//           t.ok(res)
//           index.stop(() => {
//             Winston.info('index stopped')
//             testUpstreamServer.stop(() => {
//               testServer.stop(() => {
//                 resetConfigFile('config/config.json')
//                 t.end()
//                 index.forceStop()
//               })
//             })
//           })
//         })
//       })
//     })
//   })
// });
