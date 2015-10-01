'use strict';

var http = require('http');

http.createServer(function (req, res) {
  setTimeout(function () {
    res.writeHead(200);
    res.end('Phew, done\n');
  }, 5000);
}).listen(9999, function() { console.log('Listening on 9999...'); });
