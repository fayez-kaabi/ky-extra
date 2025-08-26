import http from 'node:http';
import ky from 'ky';
import {createClient, withAuth, withRetrySmart, withCache} from '../../dist/index.js';

const server = http.createServer((req, res) => {
  if (req.url === '/protected') {
    const auth = req.headers['authorization'];
    if (auth === 'Bearer demo') {
      res.writeHead(200, {'content-type': 'application/json'});
      res.end(JSON.stringify({ok: true}));
    } else {
      res.writeHead(401);
      res.end();
    }
    return;
  }

  if (req.url === '/flaky') {
    server._flakyCount = (server._flakyCount || 0) + 1;
    if (server._flakyCount < 2) {
      res.writeHead(503);
      res.end('try again');
    } else {
      res.writeHead(200, {'content-type': 'text/plain'});
      res.end('ok');
    }
    return;
  }

  if (req.url === '/data') {
    server._dataCount = (server._dataCount || 0) + 1;
    res.writeHead(200, {'content-type': 'application/json'});
    res.end(JSON.stringify({count: server._dataCount}));
    return;
  }

  res.writeHead(404);
  res.end();
});

await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;

let token = 'stale';
const api = createClient(
  {prefixUrl: baseUrl},
  withAuth(
    () => token,
    async () => {
      token = 'demo';
    },
  ),
  withRetrySmart({limit: 2}),
  withCache({ttlMs: 500})
);

console.log('Server:', baseUrl);

// Auth refresh demo
const authRes = await api.get('protected').json();
console.log('auth ok:', authRes);

// Retry demo
const flaky = await api.get('flaky').text();
console.log('flaky:', flaky);

// Cache demo
const a = await api.get('data').json();
const b = await api.get('data').json();
console.log('cache a:', a, 'b:', b);

server.close();


