'use strict';

var fs = require('graceful-fs');
var tap = require('tap');
var rewire = require('rewire');

var index = rewire('../lib/index');
var worker = rewire('../lib/worker');

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
  writeMetadata('test123.json', 'test', req);
  var file = fs.readFileSync('test/test123-metadata.json', 'utf-8');
  var json = JSON.parse(file);
  t.same(json, req);
  fs.unlinkSync('test/test123-metadata.json');
  t.end();
});

function setupTestFiles(bodyFile, metaFile) {
  fs.mkdirSync('test/from');
  fs.mkdirSync('test/to');
  if (bodyFile) {
    fs.writeFileSync('test/from/xb58d4327b141ebffe6e990c.txt', 'Test123');
  }
  if (metaFile) {
    fs.writeFileSync('test/from/xb58d4327b141ebffe6e990c-metadata.json', {'test': 'obj'});
  }
}

function cleanupTestFiles() {
  try { fs.unlinkSync('test/to/xb58d4327b141ebffe6e990c.txt');
  } catch(e) { /* delete if exist */ }
  try { fs.unlinkSync('test/to/xb58d4327b141ebffe6e990c-metadata.json');
  } catch(e) { /* delete if exist */ }
  try { fs.rmdirSync('test/from');
  } catch(e) { /* delete if exist */ }
  try { fs.rmdirSync('test/to');
  } catch(e) { /* delete if exist */ }
}

tap.test('should move both body and metadata files', function(t) {
  setupTestFiles(true, true);
  var moveTx = worker.__get__('moveTx');
  moveTx('xb58d4327b141ebffe6e990c.txt', 'test/from', 'test/to', true, function(err) {
    t.notOk(err);
    t.ok(fs.statSync('test/to/xb58d4327b141ebffe6e990c.txt'));
    t.ok(fs.statSync('test/to/xb58d4327b141ebffe6e990c-metadata.json'));
    t.end();
  });
  t.tearDown(cleanupTestFiles);
});

tap.test('should move just body if forward metadata is false', function(t) {
  setupTestFiles(true, false);
  var moveTx = worker.__get__('moveTx');
  moveTx('xb58d4327b141ebffe6e990c.txt', 'test/from', 'test/to', false, function(err) {
    t.notOk(err);
    t.ok(fs.statSync('test/to/xb58d4327b141ebffe6e990c.txt'));
    t.end();
  });
  t.tearDown(cleanupTestFiles);
});

tap.test('should throw an error if metadata file doesnt exist', function(t) {
  setupTestFiles(true, false);
  var moveTx = worker.__get__('moveTx');
  moveTx('xb58d4327b141ebffe6e990c.txt', 'test/from', 'test/to', true, function(err) {
    t.ok(err);
    t.end();
  });
  t.tearDown(cleanupTestFiles);
});

tap.test('should throw an error if body file doesnt exist', function(t) {
  t.plan(1);
  var moveTx = worker.__get__('moveTx');
  moveTx('xb58d4327b141ebffe6e990c.txt', 'test/from', 'test/to', false, function(err) {
    t.ok(err);
  });
});
