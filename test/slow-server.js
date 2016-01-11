'use strict';

var http = require('http');

http.createServer(function (req, res) {
  console.log('Received request - ' + req.method + ' ' + req.url);
  console.log('Headers: ' + JSON.stringify(req.headers, null, 2));
  console.log('with body:');
  req.on('data', function(chunk) {
    console.log(chunk.toString());
  });
  console.log();
  setTimeout(function () {
    res.writeHead(200);
    res.end('Phew, done\n');
  }, 5000);
}).listen(9999, function() { console.log('Listening on 9999...'); });
