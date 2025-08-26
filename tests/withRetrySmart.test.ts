import http from 'node:http';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createClient, withRetrySmart} from '../src/index.js';

let server: http.Server;
let baseUrl: string;

describe('withRetrySmart', () => {
  beforeAll(async () => {
    let attempt = 0;
    server = http.createServer((req, res) => {
      if (req.url === '/flaky') {
        attempt++;
        if (attempt < 3) {
          res.writeHead(503);
          res.end('fail');
        } else {
          res.writeHead(200);
          res.end('ok');
        }
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  });

  it('retries up to limit and succeeds', async () => {
    const client = createClient({prefixUrl: baseUrl}, withRetrySmart({limit: 3}));
    const res = await client.get('flaky').text();
    expect(res).toBe('ok');
  });
});


