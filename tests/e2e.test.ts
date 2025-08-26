import http from 'node:http';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createClient, withAuth, withRetrySmart, withCache} from '../src/index.js';

let server: http.Server;
let baseUrl: string;

describe('e2e composition', () => {
  beforeAll(async () => {
    let okAuthHits = 0;
    let dataHits = 0;
    server = http.createServer((req, res) => {
      if (req.url === '/combo') {
        const auth = req.headers['authorization'];
        if (auth !== 'Bearer good') {
          res.writeHead(401);
          res.end();
          return;
        }
        okAuthHits++;
        if (okAuthHits < 2) {
          res.writeHead(503);
          res.end('flaky');
          return;
        }
        res.writeHead(200, {'content-type': 'application/json'});
        res.end(JSON.stringify({ok: true}));
        return;
      }

      if (req.url === '/data') {
        dataHits++;
        res.writeHead(200, {'content-type': 'application/json'});
        res.end(JSON.stringify({n: dataHits}));
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

  it('auth refresh + retry + cache work together', async () => {
    let token = 'stale';
    let refreshed = 0;
    const api = createClient(
      {prefixUrl: baseUrl},
      withAuth(
        () => token,
        async () => {
          token = 'good';
          refreshed++;
        },
      ),
      withRetrySmart({limit: 3}),
      withCache({ttlMs: 200})
    );

    const combo = await api.get('combo').json<{ok: boolean}>();
    expect(combo.ok).toBe(true);
    expect(refreshed).toBe(1);

    const a = await api.get('data').json<{n: number}>();
    const b = await api.get('data').json<{n: number}>();
    expect(a.n).toBe(1);
    expect(b.n).toBe(1);
  });
});


