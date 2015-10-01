'use strict';

// Return the number of milliseconds since a start time
exports.millisecondsSince = function millisecondsSince(start) {
  var diff = process.hrtime(start);
  return diff[0] * 1e3 + diff[1] / 1e6;
};
