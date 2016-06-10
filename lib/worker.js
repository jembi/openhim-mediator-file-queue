'use strict';

var Assert = require('assert');
var Async = require('async');
var FS = require('graceful-fs');
var Mkdirp = require('mkdirp');
var Needle = require('needle');
var Path = require('path');
var Stats = require('./stats');
var Utils = require('./utils');
var Winston = require('winston');
var MUtils = require('openhim-mediator-utils');
var Url = require('url');

function getContentType(file) {
  switch (Path.extname(file)) {
    case '.json':
      return 'application/json';
    case '.xml':
      return 'application/xml';
    default:
      return 'text/plain';
  }
}

function Worker(options) {
  Assert(options.name, 'name is required');
  Assert(options.url, 'url is required');
  this.name = options.name;
  this._url = options.url;
  this._queue = Async.queue(this._processFile.bind(this), options.parallel || 2);
  if (options.paused === true) {
    this.pause();
  }
  this.updateTx = options.updateTx === true;
  this.forwardMetadata = options.forwardMetadata === true;
  this.apiOpts = options.apiOpts;

  this.queuePath = Path.join(__dirname, '..', 'queue', options.name);
  this.workingPath = Path.join(__dirname, '..', 'working', options.name);
  this.errorPath = Path.join(__dirname, '..', 'error', options.name);
  Mkdirp.sync(this.queuePath);
  Mkdirp.sync(this.workingPath);
  Mkdirp.sync(this.errorPath);

  this.repopulate();
}

Worker.prototype.updateWorker = function(newOptions, callback){
  if(newOptions){
    if(newOptions.url){
      this._url = newOptions.url;
      this._queue.concurrency = newOptions.parallel || 2;
      if (newOptions.paused === true) {
        this.pause();
      } else {
        this.resume();
      }
      this.updateTx = newOptions.updateTx === true;
      this.forwardMetadata = newOptions.forwardMetadata === true;

      Winston.info('Worker updated');
      Winston.debug({
        url:this._url,
        parallel: this._queue.concurrency,
        updateTx: this.updateTx,
        forwardMetadata:this.forwardMetadata
      });
    } else {
      callback('Failed to update worker: url is required')
    }
  } else {
    callback('Failed to update worker: no options supplied');
  }
}

Worker.prototype.getOptions = function(){
  var options = {
    name: this.name,
    url: this._url,
    paused: this._queue.paused,
    parallel: this._queue.concurrency,
    updateTx: this.updateTx,
    forwardMetadata: this.forwardMetadata
  }
  return options;
};

Worker.prototype.repopulate = function() {
  Winston.info('Repopulating', {worker: this.name});
  this._queue.kill();
  Stats.gauge('workers.' + this.name + '.queue_size', this._queue.length());
  FS.readdirSync(this.queuePath).forEach(function(file) {
    if (file.indexOf('metadata') < 0) {
      this.addToQueue(file);
    }
  }.bind(this));
};

Worker.prototype.addToQueue = function(file, done) {
  Winston.debug('Adding file %s to queue', file, {worker: this.name});
  this._queue.push(file, function(err) {
    Stats.gauge('workers.' + this.name + '.queue_size', this._queue.length());
    done && done(err);
  }.bind(this));
  Stats.gauge('workers.' + this.name + '.queue_size', this._queue.length());
};

function updateTx(res, body, apiOpts, transactionId) {
  MUtils.authenticate(apiOpts, function (err) {
    if (err) {
      return Winston.error(err.stack);
    }

    var update;
    if (res.headers['content-type'] === 'application/json+openhim') {
      // use mediator response
      update = JSON.parse(body);
    } else {
      // determine transaction status
      var status = '';
      if (200 <= res.statusCode && res.statusCode <= 299) {
        status = 'Successful';
      } else if (400 <= res.statusCode && res.statusCode <= 499) {
        status = 'Completed';
      } else {
        status = 'Failed';
      }

      update = {
        status: status,
        response: {
          status: res.statusCode,
          headers: res.headers,
          body: body.toString(),
          timestamp: new Date().toISOString()
        }
      };
    }

    var headers = MUtils.genAuthHeaders(apiOpts);
    Needle.put(apiOpts.apiURL + '/transactions/' + transactionId, update, {headers: headers}, function(err, apiRes, body) {
      if (err) {
        return Winston.error(err);
      }
      if (apiRes.statusCode !== 200) {
        return Winston.error(new Error('Unable to save updated transaction to OpenHIM-core, received status code ' + apiRes.statusCode + ' with body ' + body).stack);
      }
      Winston.info('Successfully updated transaction with id ' + transactionId);
    });
  });
}

function moveTx(file, fromFolder, toFolder, forwardMetadata, callback) {
  FS.rename(Path.join(fromFolder, file), Path.join(toFolder, file), function(err) {
    if (err) {
      return callback(err);
    }
    if (forwardMetadata) {
      var metadataFile = Utils.getMetadataFilename(file);
      return FS.rename(Path.join(fromFolder, metadataFile), Path.join(toFolder, metadataFile), callback);
    } else {
      return callback();
    }
  });
}

function delTx(file, fromFolder, forwardMetadata, callback) {
  FS.unlink(Path.join(fromFolder, file), function(err) {
    if (err) {
      return callback(err);
    }
    if (forwardMetadata) {
      var metadataFile = Utils.getMetadataFilename(file);
      return FS.unlink(Path.join(fromFolder, metadataFile), callback);
    } else {
      return callback();
    }
  });
}

function fetchMetadata(file, fromFolder, callback) {
  FS.readFile(Path.join(fromFolder, Utils.getMetadataFilename(file)), function(err, data) {
    if (err) { return callback(err); }
    callback(null, JSON.parse(data));
  });
}

function sendRequest(file, options, self, finish) {
  
  function handleError(err) {
    Stats.increment('errors');
    Winston.error(err.stack, {file: file});
    return moveTx(file, self.workingPath, self.errorPath, self.forwardMetadata, finish);
  }
  
  var workingFile = Path.join(self.workingPath, file);
  
  var transactionId = file.substring(0, file.indexOf('.'));
  var validTxId = false;
  if (/^[0-9a-fA-F]{24}$/.test(transactionId)) {
    options.headers['X-OpenHIM-TransactionID'] = transactionId;
    validTxId = true;
  }
  
  var data = null;
  
  if (options.method === 'POST' || options.method === 'PUT') {
    data = FS.createReadStream(workingFile);
  }
  
  // Post the file's contents to the url
  Needle.request(options.method, options.url, data, options, function(err, res, body) {
    if (err) {
      return handleError(err);
    }
    if (self.updateTx === true && validTxId === true) {
      updateTx(res, body, self.apiOpts, transactionId);
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      return handleError(new Error('Non-2xx status code: ' + res.statusCode));
    }

    // if everything was successful, delete the file
    Winston.info('Successfully processed file ./%s', Path.relative(process.cwd(), workingFile), {worker: self.name});
    delTx(file, self.workingPath, self.forwardMetadata, finish);
  });
}

Worker.prototype._processFile = function(file, done) {
  Winston.debug('Processing file %s', file, {worker: this.name});

  var start = process.hrtime();
  function finish(err) {
    Stats.increment('processed_files');
    Stats.timing('processing_time', Utils.millisecondsSince(start));
    done(err);
  }

  var self = this;

  // Move to the working directory
  moveTx(file, this.queuePath, this.workingPath, self.forwardMetadata, function(err) {
    if (err) {
      Winston.error(err, {file: file});
      return finish(err);
    }

    if (self.forwardMetadata) {
      fetchMetadata(file, self.workingPath, function(err, options) {
        if (err) {
          Stats.increment('errors');
          Winston.error('Failed to fetch metadata', err);
          return moveTx(file, self.workingPath, self.errorPath, self.forwardMetadata, function(err) {
            finish(err);
          });
        }
        options.url = Url.resolve(self._url, options.url);
        options.timeout = 0;
        sendRequest(file, options, self, finish);
      });
    } else {
      var options = {
        method: 'POST',
        url: self._url,
        headers: {
          'Content-Type': getContentType(file)
        },
        timeout: 0
      };
      sendRequest(file, options, self, finish);
    }
  });
};

Worker.prototype.pause = function() {
  this._queue.pause();
  Winston.info('Worker paused', {worker: this.name});
};

Worker.prototype.resume = function() {
  this._queue.resume();
  Winston.info('Worker resumed', {worker: this.name});
};

module.exports = Worker;
