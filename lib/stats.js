'use strict';

var OS = require('os');
var StatsD = require('node-statsd');

var stats = null;

module.exports = {
  init: function(options) {
    if(options) {
      stats = new StatsD({
        host: options.host,
        port: options.port,
        prefix: OS.hostname() + '.momconnect_queue.'
      });
    }
  },

  /**
   * Gauges a stat by a specified amount
   * @param stat {String|Array} The stat(s) to send
   * @param value The value to send
   * @param sampleRate {Number=} The Number of times to sample (0 to 1). Optional.
   * @param tags {Array=} The Array of tags to add to metrics. Optional.
   * @param callback {Function=} Callback when message is done being delivered. Optional.
   */
  gauge: function() {
    stats && stats.gauge.apply(stats, arguments);
  },

  /**
   * Increments a stat by a specified amount
   * @param stat {String|Array} The stat(s) to send
   * @param value The value to send
   * @param sampleRate {Number=} The Number of times to sample (0 to 1). Optional.
   * @param tags {Array=} The Array of tags to add to metrics. Optional.
   * @param callback {Function=} Callback when message is done being delivered. Optional.
   */
  increment: function() {
    stats && stats.increment.apply(stats, arguments);
  },

  /**
   * Represents the timing stat
   * @param stat {String|Array} The stat(s) to send
   * @param time {Number} The time in milliseconds to send
   * @param sampleRate {Number=} The Number of times to sample (0 to 1). Optional.
   * @param tags {Array=} The Array of tags to add to metrics. Optional.
   * @param callback {Function=} Callback when message is done being delivered. Optional.
   */
  timing: function() {
    stats && stats.timing.apply(stats, arguments);
  }
};
