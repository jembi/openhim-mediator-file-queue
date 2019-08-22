'use strict';

exports.getMetadataFilename = function(file) {
  var transactionId = file.substring(0, file.indexOf('.'));
  return transactionId + '-metadata.json';
};

exports.displayEndpoints = function(app, callback) {
  var routes = app._router.stack;
  var routePaths = [];
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
  callback('File Queue Endpoints:', routePaths);
};
