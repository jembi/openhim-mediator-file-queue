'use strict'

const tap = require('tap')
const testServer = require('./test-openhim-server')

const OpenHIM = require('../lib/openhim.js')

// don't log during tests - comment these out for debugging
console.log = () => {}
console.error = () => {}

const opts = {
  username: 'root@openhim.org',
  password: 'password',
  apiURL: 'http://localhost:8080'
}

const badOpts = {
  username: 'root@openhim.org',
  password: 'password',
  apiURL: 'http://localhost:1337'
}

tap.test('OpenHIM module - fetchChannelByName()', (t) => {
  let openhim = OpenHIM(opts)
  testServer.start(() => {
    openhim.fetchChannelByName('Test Channel', (err, channel) => {
      t.error(err)
      t.ok(channel)
      t.equals(channel._id, '575946b94a20db7a4e071ae4')
      testServer.stop(() => {
        t.end()
      })
    })
  })
})

tap.test('OpenHIM module - fetchChannelByName() error case', (t) => {
  let openhim = OpenHIM(badOpts)
  testServer.start(() => {
    openhim.fetchChannelByName('Test Channel', (err, channel) => {
      t.ok(err)
      t.match(err.message, 'ECONNREFUSED')
      testServer.stop(() => {
        t.end()
      })
    })
  })
})

tap.test('OpenHIM module - fetchChannelByName() no results case', (t) => {
  let openhim = OpenHIM(opts)
  testServer.start(() => {
    openhim.fetchChannelByName('nonexistent', (err, channel) => {
      t.ok(err)
      t.equals(err.message, 'Could not find channel in result set')
      testServer.stop(() => {
        t.end()
      })
    })
  })
})

tap.test('OpenHIM module - updateChannel()', (t) => {
  let openhim = OpenHIM(opts)
  testServer.start(() => {
    openhim.updateChannel('575946b94a20db7a4e071ae4', {}, (err) => {
      t.error(err)
      testServer.stop(() => {
        t.end()
      })
    })
  })
})

tap.test('OpenHIM module - updateChannel() error case', (t) => {
  let openhim = OpenHIM(badOpts)
  testServer.start(() => {
    openhim.updateChannel('575946b94a20db7a4e071ae4', {}, (err) => {
      t.ok(err)
      t.match(err.message, 'ECONNREFUSED')
      testServer.stop(() => {
        t.end()
      })
    })
  })
})