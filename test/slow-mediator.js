'use strict';

var http = require('http');

http.createServer((req, res) => {
  console.log('Received request - ' + req.method + ' ' + req.url);
  console.log('Headers: ' + JSON.stringify(req.headers, null, 2));
  console.log('with body:');
  req.on('data', function(chunk) {
    console.log(chunk.toString());
  });
  console.log();
  setTimeout(function () {
    res.writeHead(200, { 'Content-Type': 'application/json+openhim' });
    res.end(JSON.stringify({
      'x-mediator-urn': 'urn:uuid:42181537-401e-4e8b-960f-eb1c5414a354',
      status: 'Successful',
      response: {
        status: 201,
        body: 'Phew, done!\n',
        timestamp: new Date().toString()
      },
      orchestrations: [
        {
          name: 'Test orchestration',
          request: {
            path: '/some/path',
            headers: { 'Content-Type': 'test/format' },
            querystring: 'param=val',
            body: 'Body',
            method: 'POST',
            timestamp: new Date()
          },
          response: {
            status: 200,
            headers: { 'Location': '/my/test' },
            body: 'Body',
            timestamp: new Date()
          }
        }
      ],
      properties: {
        prop1: 'val1',
        prop2: 'val2'
      }
    }));
  }, 5000);
}).listen(9999, () => { console.log('Listening on 9999...'); });
