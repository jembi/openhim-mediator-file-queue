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
  apiURL: 'http://localhost:7000'
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
  let openhim = OpenHIM(opts);
  testServer.start(() => {
    openhim.fetchChannelByName('Test Channel', (err, channel) => {
      t.error(err);
      t.ok(channel);
      t.equals(channel._id, '575946b94a20db7a4e071ae4');
      testServer.stop(() => {
        t.end();
      });
    });
  });
});

tap.test('OpenHIM module - fetchChannelByName() error case', (t) => {
  let openhim = OpenHIM(badOpts);
  testServer.start(() => {
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
  let openhim = OpenHIM(opts);
  testServer.start(() => {
    openhim.fetchChannelByName('nonexistent', (err) => {
      t.ok(err);
      t.equals(err.message, 'Could not find channel in result set');
      testServer.stop(() => {
        t.end();
      });
    });
  });
});

tap.test('OpenHIM module - updateChannel()', (t) => {
  let openhim = OpenHIM(opts);
  testServer.start(() => {
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
  testServer.start(() => {
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
  let openhim = OpenHIM(opts);

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

  testServer.start(() => {
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
  testServer.start(() => {
    openhim.addChannel({}, (err) => {
      t.ok(err);
      t.match(err.message, 'ECONNREFUSED');
      testServer.stop(() => {
        t.end();
      });
    });
  });
});