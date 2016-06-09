'use strict';

// Return the number of milliseconds since a start time
exports.millisecondsSince = function millisecondsSince(start) {
  var diff = process.hrtime(start);
  return diff[0] * 1e3 + diff[1] / 1e6;
};

exports.getMetadataFilename = function(file) {
  var transactionId = file.substring(0, file.indexOf('.'));
  return transactionId + '-metadata.json';
};

// parses JSON object into array of JSON objects
exports.parseJSONIntoArray = function(json){
  var result = [];

  for(var x in json){
    result.push(json[x]);
  }
  return result;
};
