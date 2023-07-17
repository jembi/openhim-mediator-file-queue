'use strict';

var fs = require('graceful-fs');
var tap = require('tap');
var rewire = require('rewire');
var testUtils = require('./utils');
var logger = require('winston');
var worker = rewire('../lib/worker');

var winstonLogFormat;

// ************************************************
// tests for worker.js
// ************************************************

logger.clear();
  
winstonLogFormat = logger.format.printf(function(info) {
  return `${info.timestamp} ${info.level}: ${info.message}`;
});

logger.remove(new logger.transports.Console());

logger.add(new logger.transports.Console({
  format: logger.format.combine(logger.format.timestamp(), logger.format.colorize(), winstonLogFormat),
  level: 'info'
}));


function setupTestFiles(bodyFile, metaFile) {
  fs.mkdirSync('test/from');
  fs.mkdirSync('test/to');
  if (bodyFile) {
    fs.writeFileSync('test/from/xb58d4327b141ebffe6e990c.txt', 'Test123');
  }
  if (metaFile) {
    fs.writeFileSync('test/from/xb58d4327b141ebffe6e990c-metadata.json', JSON.stringify({'test': 'obj'}));
  }
}

function cleanupTestFiles() {
  try { fs.unlinkSync('test/from/xb58d4327b141ebffe6e990c.txt');
  } catch(e) { /* delete if exist */ }
  try { fs.unlinkSync('test/from/xb58d4327b141ebffe6e990c-metadata.json');
  } catch(e) { /* delete if exist */ }
  try { fs.unlinkSync('test/to/xb58d4327b141ebffe6e990c.txt');
  } catch(e) { /* delete if exist */ }
  try { fs.unlinkSync('test/to/xb58d4327b141ebffe6e990c-metadata.json');
  } catch(e) { /* delete if exist */ }
  try { fs.rmdirSync('test/from');
  } catch(e) { /* delete if exist */ }
  try { fs.rmdirSync('test/to');
  } catch(e) { /* delete if exist */ }
}

// In case there are leftovers from previously failed tests
cleanupTestFiles();

tap.test('moveTx - should move both body and metadata files', function(t) {
  setupTestFiles(true, true);
  var moveTx = worker.__get__('moveTx');
  moveTx('xb58d4327b141ebffe6e990c.txt', 'test/from', 'test/to', true, function(err) {
    t.notOk(err);
    t.ok(fs.statSync('test/to/xb58d4327b141ebffe6e990c.txt'));
    t.ok(fs.statSync('test/to/xb58d4327b141ebffe6e990c-metadata.json'));
    t.end();
  });
  t.teardown(cleanupTestFiles);
});

tap.test('moveTx - should move just body if forward metadata is false', function(t) {
  setupTestFiles(true, false);
  var moveTx = worker.__get__('moveTx');
  moveTx('xb58d4327b141ebffe6e990c.txt', 'test/from', 'test/to', false, function(err) {
    t.notOk(err);
    t.ok(fs.statSync('test/to/xb58d4327b141ebffe6e990c.txt'));
    t.end();
  });
  t.teardown(cleanupTestFiles);
});

tap.test('moveTx - should throw an error if metadata file doesnt exist', function(t) {
  setupTestFiles(true, false);
  var moveTx = worker.__get__('moveTx');
  moveTx('xb58d4327b141ebffe6e990c.txt', 'test/from', 'test/to', true, function(err) {
    t.ok(err);
    t.end();
  });
  t.teardown(cleanupTestFiles);
});

tap.test('moveTx - should throw an error if body file doesnt exist', function(t) {
  var moveTx = worker.__get__('moveTx');
  moveTx('xb58d4327b141ebffe6e990c.txt', 'test/from', 'test/to', false, function(err) {
    t.ok(err);
    t.end();
  });
});

tap.test('delTx - should delete both files', function(t) {
  t.plan(3);
  setupTestFiles(true, true);
  var delTx = worker.__get__('delTx');
  delTx('xb58d4327b141ebffe6e990c.txt', 'test/from', true, function(err) {
    t.notOk(err);
    fs.stat('test/from/xb58d4327b141ebffe6e990c.txt', function(err) {
      t.ok(err);
    });
    fs.stat('test/from/xb58d4327b141ebffe6e990c-metadata.json', function(err) {
      t.ok(err);
    });
  });
  t.teardown(cleanupTestFiles);
});

tap.test('delTx - should just body file when not forwarding metadata', function(t) {
  t.plan(3);
  setupTestFiles(true, true);
  var delTx = worker.__get__('delTx');
  delTx('xb58d4327b141ebffe6e990c.txt', 'test/from', false, function(err) {
    t.notOk(err);
    fs.stat('test/from/xb58d4327b141ebffe6e990c.txt', function(err) {
      t.ok(err);
    });
    fs.stat('test/from/xb58d4327b141ebffe6e990c-metadata.json', function(err) {
      t.notOk(err);
    });
  });
  t.teardown(cleanupTestFiles);
});

tap.test('delTx - should throw an error if metadata file doesnt exist', function(t) {
  setupTestFiles(true, false);
  var delTx = worker.__get__('delTx');
  delTx('xb58d4327b141ebffe6e990c.txt', 'test/from', true, function(err) {
    t.ok(err);
    t.end();
  });
  t.teardown(cleanupTestFiles);
});

tap.test('delTx - should throw an error if body file doesnt exist', function(t) {
  var delTx = worker.__get__('delTx');
  delTx('xb58d4327b141ebffe6e990c.txt', 'test/from', false, function(err) {
    t.ok(err);
    t.end();
  });
});

tap.test('should update worker config', function(t){
  testUtils.setupWorker(function(workerObj){
    workerObj.updateWorker(testUtils.validConf, function(err){
      t.notOk(err, 'There were no errors');
    });
    t.same(workerObj.getOptions(), testUtils.validConf, 'The worker\'s config was successfully updated');
    t.end();
  });
});

tap.test('should fail to update worker config: no url', function(t){
  testUtils.setupWorker(function(workerObj){  
    workerObj.updateWorker(testUtils.noUrlConf, function(err){
      t.ok(err, 'There were errors');
    });
    t.notSame(workerObj.getOptions(), testUtils.noUrlConf, 'The worker\'s config failed to be updated');
    t.end();
  });
});

tap.test('should fail to update worker config: undefined config', function(t){
  testUtils.setupWorker(function(workerObj){
    var newConf;
  
    workerObj.updateWorker(newConf, function(err){
      t.ok(err, 'There were errors');
    });
    t.notSame(workerObj.getOptions(), newConf, 'The worker\'s config failed to be updated');
    t.end();
  });
});