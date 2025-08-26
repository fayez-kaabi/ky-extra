import http from 'node:http';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createClient, withCircuitBreaker} from '../src/index.js';

let server: http.Server;
let baseUrl: string;

describe('withCircuitBreaker', () => {
  beforeAll(async () => {
    let hits = 0;
    server = http.createServer((req, res) => {
      if (req.url === '/flaky') {
        hits++;
        if (hits <= 2) {
          res.writeHead(503); res.end('nope');
        } else {
          res.writeHead(200); res.end('ok');
        }
        return;
      }
      res.writeHead(404); res.end();
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

  it('opens after failures and short-circuits, then recovers', async () => {
    const api = createClient({prefixUrl: baseUrl, retry: {limit: 0}}, withCircuitBreaker({failureThreshold: 2, recoveryTimeoutMs: 200}));
    await expect(api.get('flaky').text()).rejects.toBeTruthy();
    await expect(api.get('flaky').text()).rejects.toBeTruthy();
    // now breaker open
    const sc = await api.get('flaky', {throwHttpErrors: false}).text();
    expect(sc).toBe('Circuit open');
    await new Promise(r => setTimeout(r, 220));
    const ok = await api.get('flaky').text();
    expect(ok).toBe('ok');
  });
});


