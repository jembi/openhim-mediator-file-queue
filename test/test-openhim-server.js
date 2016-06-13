#!/usr/bin/env node

'use strict'

const http = require('http')
const URL = require('url')

const response = [{
  _id: '575946b94a20db7a4e071ae4',
  name: 'Test Channel',
  urlPattern: '^/test$',
  routes: [{
    name: 'test route',
    url: ''
  }]
}, {
  _id: '111111',
  name: 'Another Channel',
  urlPattern: '^/another$',
  routes: [{
    name: 'another route',
    url: ''
  }]
}]

const server = http.createServer(function (req, res) {
  let body = ''
  req.on('data', function (chunk) {
    body += chunk.toString()
  })
  req.on('end', function () {
    console.log(`Received ${req.method} request to ${req.url}`)
    console.log(`with body: ${body}`)
    let url = URL.parse(req.url)
    if (url.path === '/channels') {
      res.writeHead(200)
      res.end(JSON.stringify(response))
    } else if (url.path === '/channels/575946b94a20db7a4e071ae4') {
      res.writeHead(200)
      res.end()
    } else if (url.path === '/authenticate/root@openhim.org') {
      res.writeHead(200)
      res.end(JSON.stringify({
        ts: new Date(),
        salt: '123'
      }))
    } else {
      console.log('Error: no path matched')
      res.writeHead(500)
      res.end()
    }
  })
})

function start (callback) {
  server.listen(8080, function (msg) {
    console.log(msg)
    callback()
  })
}
exports.start = start

function stop (callback) {
  server.close(callback)
}
exports.stop = stop

if (!module.parent) {
  // if this script is run directly, start the server
  start(() => console.log('OpenHIM Server listening on 8080...'))
}