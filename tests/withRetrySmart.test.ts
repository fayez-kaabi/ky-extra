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

  it('does not retry on excluded status', async () => {
    // New server that returns 400
    const srv = http.createServer((_req, res) => { res.writeHead(400); res.end('bad'); });
    await new Promise<void>((r) => srv.listen(0, r));
    const port = (srv.address() as any).port;
    const url = `http://127.0.0.1:${port}`;
    const client = createClient({prefixUrl: url}, withRetrySmart({limit: 3, statuses: [500]}));
    await expect(client.get('').text()).rejects.toBeTruthy();
    await new Promise<void>((r) => srv.close(() => r()));
  });
});


