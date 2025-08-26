import http from 'node:http';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createClient, withCache} from '../src/index.js';

let server: http.Server;
let baseUrl: string;

describe('withCache', () => {
  beforeAll(async () => {
    let count = 0;
    let mut = 0;
    server = http.createServer((req, res) => {
      if (req.url === '/count') {
        count++;
        res.writeHead(200, {'content-type': 'application/json'});
        res.end(JSON.stringify({count}));
        return;
      }
      if (req.url === '/mut' && req.method === 'POST') {
        mut++;
        res.writeHead(200, {'content-type': 'application/json'});
        res.end(JSON.stringify({mut}));
        return;
      }
      if (req.url === '/nocache') {
        res.writeHead(200);
        res.end('x');
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

  it('caches GET and returns cloned response', async () => {
    const client = createClient({prefixUrl: baseUrl}, withCache({ttlMs: 300}));
    const r1 = await client.get('count').json<{count: number}>();
    const r2 = await client.get('count').json<{count: number}>();
    expect(r1.count).toBe(1);
    expect(r2.count).toBe(1);
  });

  it('does not cache non-GET', async () => {
    const client = createClient({prefixUrl: baseUrl}, withCache({ttlMs: 50}));
    const a = await client.post('mut').json<{mut: number}>();
    const b = await client.post('mut').json<{mut: number}>();
    expect(a.mut).toBe(1);
    expect(b.mut).toBe(2);
  });

  it('respects TTL expiration', async () => {
    const client = createClient({prefixUrl: baseUrl}, withCache({ttlMs: 20}));
    const a = await client.get('count').json<{count: number}>();
    await new Promise((r) => setTimeout(r, 25));
    const b = await client.get('count').json<{count: number}>();
    expect(b.count).toBeGreaterThan(a.count);
  });

  it('respects Cache-Control: no-cache request header', async () => {
    const client = createClient({prefixUrl: baseUrl}, withCache());
    const t1 = await client.get('nocache', {headers: {'cache-control': 'no-cache'}}).text();
    const t2 = await client.get('nocache', {headers: {'cache-control': 'no-cache'}}).text();
    expect(t1).toBe('x');
    expect(t2).toBe('x');
  });
});


