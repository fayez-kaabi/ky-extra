import http from 'node:http';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createClient, withDedup} from '../src/index.js';

let server: http.Server;
let baseUrl: string;

describe('withDedup', () => {
  beforeAll(async () => {
    let count = 0;
    server = http.createServer((req, res) => {
      if (req.url === '/once') {
        count++;
        res.writeHead(200, {'content-type': 'application/json'});
        res.end(JSON.stringify({count}));
        return;
      }
      res.writeHead(404); res.end();
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

  it('coalesces concurrent GETs', async () => {
    const api = createClient({prefixUrl: baseUrl}, withDedup());
    const [a, b] = await Promise.all([
      api.get('once').json<{count:number}>(),
      api.get('once').json<{count:number}>(),
    ]);
    expect(a.count).toBe(1);
    expect(b.count).toBe(1);
  });
});


