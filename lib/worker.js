'use strict';

var Assert = require('assert');
var Async = require('async');
var FS = require('graceful-fs');
var MV = require('mv');
var Mkdirp = require('mkdirp');
var Needle = require('needle');
var Path = require('path');
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
  this.path = options.path;
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
      callback(new Error('Failed to update worker: url is required'));
    }
  } else {
    callback(new Error('Failed to update worker: no options supplied'));
  }
};

Worker.prototype.getOptions = function(){
  var options = {
    name: this.name,
    url: this._url,
    path: this.path,
    paused: this._queue.paused,
    parallel: this._queue.concurrency,
    updateTx: this.updateTx,
    forwardMetadata: this.forwardMetadata
  };
  return options;
};

Worker.prototype.repopulate = function() {
  Winston.info('Repopulating', {worker: this.name});
  this._queue.kill();
  FS.readdirSync(this.queuePath).forEach(function(file) {
    if (file.indexOf('metadata') < 0) {
      this.addToQueue(file);
    }
  }.bind(this));
};

Worker.prototype.addToQueue = function(file, done) {
  Winston.debug('Adding file %s to queue', file, {worker: this.name});
  this._queue.push(file, function(err) {
    done && done(err);
  }.bind(this));
};

function updateTx(res, body, apiOpts, transactionId) {
  MUtils.authenticate(apiOpts, function (err) {
    if (err) {
      return Winston.error(err.stack);
    }

    var update;
    if (res.headers['content-type'] === 'application/json+openhim') {
      // use mediator response
      const responseBody = JSON.parse(body);

      if (responseBody.orchestrations) {
        // add $push operation to add orchestrations to existing array
        responseBody.$push = {
          orchestrations: responseBody.orchestrations
        };
        // delete the original orchestrations object to make use of $push.orchestrations instead,
        // otherwise it will override existing orchestrations on the transactions
        delete responseBody.orchestrations;
      }

      update = responseBody;
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

      // extract content type for properly converting payload to string
      var [contentKey = 'Content-Type'] = Object.keys(res.headers).filter(k => /^content-type$/i.test(k));
      var stringBody = '';
      if (res.headers[contentKey]) {
        stringBody = res.headers[contentKey].search('json') ? JSON.stringify(body, null, 2) : body.toString();
      }

      update = {
        status: status,
        response: {
          status: res.statusCode,
          headers: res.headers,
          body: stringBody,
          timestamp: new Date().toISOString()
        }
      };
    }

    var headers = MUtils.genAuthHeaders(apiOpts);
    // specify custom content-type header for OpenHIM to process successfully
    headers['content-type'] = 'application/json+openhim';

    Needle.put(apiOpts.apiURL + '/transactions/' + transactionId, update, {headers: headers, json: true}, function(err, apiRes, body) {
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
  MV(Path.join(fromFolder, file), Path.join(toFolder, file), function(err) {
    if (err) {
      return callback(err);
    }
    if (forwardMetadata) {
      var metadataFile = Utils.getMetadataFilename(file);
      return MV(Path.join(fromFolder, metadataFile), Path.join(toFolder, metadataFile), callback);
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

  function finish(err) {
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
