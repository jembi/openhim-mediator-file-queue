'use strict';

const tap = require('tap');
const testServer = require('./test-openhim-server');
const testUtils = require('./utils');
const URL = require('url');
const OpenHIM = require('../lib/openhim.js');
const logger = require('winston');

var winstonLogFormat;

const opts = {
  username: 'root@openhim.org',
  password: 'password',
};

const badOpts = {
  username: 'root@openhim.org',
  password: 'password',
  apiURL: 'http://localhost:1337'
};

logger.clear();
  
winstonLogFormat = logger.format.printf(function(info) {
  return `${info.timestamp} ${info.level}: ${info.message}`;
});

logger.remove(new logger.transports.Console());

logger.add(new logger.transports.Console({
  format: logger.format.combine(logger.format.timestamp(), logger.format.colorize(), winstonLogFormat),
  level: 'info'
}));


tap.test('OpenHIM module - fetchChannelByName()', (t) => {
  let openhim = OpenHIM({
    ...opts,
    apiURL: 'http://localhost:7001'
  });
  testServer.start(7001, () => {
    openhim.fetchChannelByName('Test Channel', (err, channel) => {
      t.error(err);
      t.ok(channel);
      t.equal(channel._id, '575946b94a20db7a4e071ae4');
      testServer.stop(() => {
        t.end();
      });
    });
  });
});

tap.test('OpenHIM module - fetchChannelByName() error case', (t) => {
  let openhim = OpenHIM(badOpts);
  testServer.start(7002, () => {
    openhim.fetchChannelByName('Test Channel', (err) => {
      t.ok(err);
      t.match(err.message, 'ECONNREFUSED');
      testServer.stop(() => {
        t.end();
      });
    });
  });
});

tap.test('OpenHIM module - fetchChannelByName() no results case', (t) => {
  let openhim = OpenHIM({
    ...opts,
    apiURL: 'http://localhost:7003'
  });
  testServer.start(7003, () => {
    openhim.fetchChannelByName('nonexistent', (err) => {
      t.ok(err);
      t.equal(err.message, 'Could not find channel in result set');
      testServer.stop(() => {
        t.end();
      });
    });
  });
});

tap.test('OpenHIM module - updateChannel()', (t) => {
  let openhim = OpenHIM({
    ...opts,
    apiURL: 'http://localhost:7004'
  });
  testServer.start(7004, () => {
    openhim.updateChannel('575946b94a20db7a4e071ae4', {}, (err) => {
      t.error(err);
      testServer.stop(() => {
        t.end();
      });
    });
  });
});

tap.test('OpenHIM module - updateChannel() error case', (t) => {
  let openhim = OpenHIM(badOpts);
  testServer.start(7005, () => {
    openhim.updateChannel('575946b94a20db7a4e071ae4', {}, (err) => {
      t.ok(err);
      t.match(err.message, 'ECONNREFUSED');
      testServer.stop(() => {
        t.end();
      });
    });
  });
});

tap.test('OpenHIM module - addChannel()', (t) => {
  let openhim = OpenHIM({
    ...opts,
    apiURL: 'http://localhost:7006'
  });

  var endpointChannel = {
    name: testUtils.validConf.name,
    urlPattern: '^' + testUtils.validConf.path + '$',
    status: 'enabled',
    routes: [
      {
        name: testUtils.validConf.name,
        host: URL.parse(testUtils.validConf.url).hostname,
        path: testUtils.validConf.path,
        port: URL.parse(testUtils.validConf.url).port,
        secured: URL.parse(testUtils.validConf.url).protocol==='http:'? false : true,
        primary: true
      }
    ],
    authType: 'public'
  };

  testServer.start(7006, () => {
    openhim.addChannel(endpointChannel, (err) => {
      t.error(err);
      testServer.stop(() => {
        t.end();
      });
    });
  });
});

tap.test('OpenHIM module - addChannel() error case', (t) => {
  let openhim = OpenHIM(badOpts);
  testServer.start(7007, () => {
    openhim.addChannel({}, (err) => {
      t.ok(err);
      t.match(err.message, 'ECONNREFUSED');
      testServer.stop(() => {
        t.end();
      });
    });
  });
});