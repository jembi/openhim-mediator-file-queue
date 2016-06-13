'use strict';

const fs = require('graceful-fs');
const tap = require('tap');
const rewire = require('rewire');
const utils = require('../lib/utils');
const testUtils = require('./utils');
const testServer = require('./test-openhim-server')
const OpenHIM = require('../lib/openhim.js')
var Express = require('express');
var Confit = require('confit');
var Path = require('path');
var Winston = require('winston');

var index = rewire('../lib/index');

const opts = {
  username: 'root@openhim.org',
  password: 'password',
  apiURL: 'http://localhost:8080',
  urn: "urn:uuid:a15c3d48-0686-4c9b-b375-f68d2f244a33",
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
  var writeMetadata = index.__get__('writeMetadata');
  writeMetadata('test123.json', 'test', req, function(err) {
    t.error(err);
    var file = fs.readFileSync('test/test123-metadata.json', 'utf-8');
    var json = JSON.parse(file);
    t.same(json, req);
    fs.unlinkSync('test/test123-metadata.json');
    t.end();
  });
});

tap.tearDown(function(){
  index.__set__('WorkerInstances', []);
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

// tap.test('should setup endpoint', function(t){
//   let openhim = OpenHIM(opts)
//   var config = []
//   config.push(testUtils.validConf)

//   testServer.start(() => {
//     var fqApp = index.__get__('app');
    
//     Confit(Path.join(__dirname, '..', 'config')).create(function(err, config) {
//       Object.defineProperty(fqApp.locals, 'config', {value: config});

//       fqApp.listen(4002, function(){
//         var updateEndpointConfig = index.__get__('updateEndpointConfig')

//         Winston.info('hello');
//         // updateEndpointConfig(config, opts, testUtils.validConf, function(err){
//           // Winston.info(w);
//         //   t.ok(err)
//         //   t.end()
//         // });  
//         t.pass()
//         t.end()
//       })
//     })
//   })
// });

// ************************************************
// tests for utils.js
// ************************************************
tap.test('should parse URL', function(t){
  var result = utils.parseUrl("http://example.com:3000/pathname/?search=test#hash")

  t.equal(result.protocol, "http:")
  t.equal(result.host, "example.com:3000")
  t.equal(result.hostname, "example.com")
  t.equal(result.port, "3000")
  t.equal(result.path, "/pathname/")
  t.end()
});
