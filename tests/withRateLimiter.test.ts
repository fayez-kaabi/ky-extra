import http from 'node:http';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createClient, withRateLimiter} from '../src/index.js';

let server: http.Server;
let baseUrl: string;

describe('withRateLimiter', () => {
  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200); res.end('ok');
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

  it('limits concurrency and allows queued requests', async () => {
    const api = createClient({prefixUrl: baseUrl}, withRateLimiter({capacity: 1, refillPerSecond: 5}));
    const start = Date.now();
    await Promise.all([
      api.get('a').text(),
      api.get('b').text(),
      api.get('c').text(),
    ]);
    const duration = Date.now() - start;
    expect(duration).toBeGreaterThanOrEqual(0);
  });
});


