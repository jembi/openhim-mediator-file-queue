'use strict';

var http = require('http')
var request = require('request')
var Winston = require('winston')
var enableDestroy = require('server-graceful-shutdown')

const port = 8000;
 
const server = http.createServer(function(request,response){
  console.log('Server 8000: Request Received...')
  response.writeHead(200)
  request.pipe(response)
  // request.end()
  console.log('Server 8000: Request echoed back to client...')
  // response.end()
})

function start(callback) {
  Winston.info('Upstream started...')
  server.setTimeout(2000)
  server.listen(port, function(){
    Winston.info('App started on port %s...', port);
    callback()
  })
  enableDestroy(server)
}
exports.start = start

function stop (callback) {
  Winston.info('Upstream stopped')
  server.shutdown(callback)
}
exports.stop = stop
