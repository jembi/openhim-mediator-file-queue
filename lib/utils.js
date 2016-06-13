'use strict';

var url = require('url');

// Return the number of milliseconds since a start time
exports.millisecondsSince = function millisecondsSince(start) {
  var diff = process.hrtime(start);
  return diff[0] * 1e3 + diff[1] / 1e6;
};

exports.getMetadataFilename = function(file) {
  var transactionId = file.substring(0, file.indexOf('.'));
  return transactionId + '-metadata.json';
};

exports.parseUrl = function(urlStr) {
  var match = url.parse(urlStr)
  return match && {
      protocol: match.protocol,
      host: match.host,
      hostname: match.hostname,
      port: match.port,
      path: match.pathname
  }
};

exports.displayEndpoints = function(app, callback) {
  var routes = app._router.stack;
  var routePaths = []
  for (var key in routes) {
    if (routes.hasOwnProperty(key)) {
      var val = routes[key];
      if(val.route)
      {
        val = val.route;
        routePaths.push(val.path);
      }
    }
  }
  callback('File Queue Endpoints:', routePaths)
};
