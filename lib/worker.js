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
  if (options.updateTx === true) {
    this.updateTx = true;
  } else {
    this.updateTx = false;
  }
  this.apiOpts = options.apiOpts;

  this.queuePath = Path.join(__dirname, '..', 'queue', options.name);
  this.workingPath = Path.join(__dirname, '..', 'working', options.name);
  this.errorPath = Path.join(__dirname, '..', 'error', options.name);
  Mkdirp.sync(this.queuePath);
  Mkdirp.sync(this.workingPath);
  Mkdirp.sync(this.errorPath);

  this.repopulate();
}

Worker.prototype.repopulate = function() {
  Winston.info('Repopulating', {worker: this.name});
  this._queue.kill();
  Stats.gauge('workers.' + this.name + '.queue_size', this._queue.length());
  FS.readdirSync(this.queuePath).forEach(function(file) {
    this.addToQueue(file);
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
    var headers = MUtils.genAuthHeaders(apiOpts);

    // determine transaction status
    var status = '';
    if (200 <= res.statusCode && res.statusCode <= 299) {
      status = 'Successful';
    } else if (400 <= res.statusCode && res.statusCode <= 499) {
      status = 'Completed';
    } else {
      status = 'Failed';
    }

    var update = {
      status: status,
      response: {
        status: res.statusCode,
        headers: res.headers,
        body: body.toString(),
        timestamp: new Date().toString()
      }
    };
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

Worker.prototype._processFile = function(file, done) {
  Winston.debug('Processing file %s', file, {worker: this.name});

  var start = process.hrtime();
  function finish(err) {
    Stats.increment('processed_files');
    Stats.timing('processing_time', Utils.millisecondsSince(start));
    done(err);
  }

  var self = this;
  var queueFile = Path.join(this.queuePath, file);
  var workingFile = Path.join(this.workingPath, file);

  function handleError(err) {
    Stats.increment('errors');
    Winston.error(err.stack, {file: file});
    return FS.rename(workingFile, Path.join(self.errorPath, file), finish);
  }

  // Move to the working directory
  FS.rename(queueFile, workingFile, function(err) {
    if (err) {
      Winston.error(err, {file: file});
      return finish(err);
    }

    var fileStream = FS.createReadStream(workingFile);
    var options = {
      headers: {
        'Content-Type': getContentType(file)
      },
      timeout: 0
    };
    var transactionId = file.substring(0, file.indexOf('.'));
    var validTxId = false;
    if (/^[0-9a-fA-F]{24}$/.test(transactionId)) {
      options.headers['X-OpenHIM-TransactionID'] = transactionId;
      validTxId = true;
    }
    // Post the file's contents to the url
    Needle.post(self._url, fileStream, options, function(err, res, body) {
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
      FS.unlink(workingFile, finish);
    });
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
