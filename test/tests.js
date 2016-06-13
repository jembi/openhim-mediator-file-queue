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
const request = require('request')

var setupEndpoint = rewire('../lib/setupEndpoint');

const opts = {
  username: 'root@openhim.org',
  password: 'password',
  apiURL: 'http://localhost:8080'
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

tap.tearDown(function(){
  setupEndpoint.__set__('WorkerInstances', []);
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
