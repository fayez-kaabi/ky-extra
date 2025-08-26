import http from 'node:http';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createClient, withCacheLRU} from '../src/index.js';

let server: http.Server;
let baseUrl: string;

describe('withCacheLRU', () => {
  beforeAll(async () => {
    let n = 0;
    server = http.createServer((req, res) => {
      if (req.url?.startsWith('/data')) {
        n++;
        res.writeHead(200, {'content-type': 'application/json'});
        res.end(JSON.stringify({n}));
        return;
      }
      res.writeHead(404); res.end();
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

  it('caches and evicts LRU', async () => {
    const api = createClient({prefixUrl: baseUrl}, withCacheLRU({capacity: 1, ttlMs: 200}));
    const a = await api.get('data?x=1').json<{n:number}>();
    const b = await api.get('data?x=1').json<{n:number}>();
    expect(a.n).toBe(b.n);
    await api.get('data?x=2').json<{n:number}>();
    const d = await api.get('data?x=1').json<{n:number}>();
    expect(d.n).toBeGreaterThan(b.n); // evicted
  });

  it('respects response no-store', async () => {
    const srv = http.createServer((_req, res) => {
      res.writeHead(200, {'cache-control': 'no-store'}); res.end('x');
    });
    await new Promise<void>((r) => srv.listen(0, r));
    const port = (srv.address() as any).port;
    const url = `http://127.0.0.1:${port}`;
    const api = createClient({prefixUrl: url}, withCacheLRU());
    const a = await api.get('').text();
    const b = await api.get('').text();
    expect(a).toBe('x');
    expect(b).toBe('x');
    await new Promise<void>((r) => srv.close(() => r()));
  });
});


