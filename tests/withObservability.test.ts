import http from 'node:http';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createClient, withObservability} from '../src/index.js';

let server: http.Server;
let baseUrl: string;

describe('withObservability', () => {
  beforeAll(async () => {
    server = http.createServer((_req, res) => { res.writeHead(200); res.end('ok'); });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

  it('emits start and success events with redaction', async () => {
    const events: any[] = [];
    const api = createClient({prefixUrl: baseUrl}, withObservability({
      redact: ({url, method, headers}) => ({url, method, headers: new Headers()}),
      onStart: (e) => events.push(['start', e.method]),
      onSuccess: (e) => events.push(['ok', e.status]),
      onError: (e) => events.push(['err', e.error]),
    }));
    const t = await api.get('x').text();
    expect(t).toBe('ok');
    expect(events[0][0]).toBe('start');
    expect(events[1][0]).toBe('ok');
  });

  it('emits error event on HTTP error', async () => {
    const events: any[] = [];
    // new server that returns 500
    const srv = http.createServer((_req, res) => { res.writeHead(500); res.end('boom'); });
    await new Promise<void>((r) => srv.listen(0, r));
    const port = (srv.address() as any).port;
    const url = `http://127.0.0.1:${port}`;
    const api = createClient({prefixUrl: url}, withObservability({
      onError: (e) => events.push(['err', e.durationMs]),
    }));
    await expect(api.get('x').text()).rejects.toBeTruthy();
    expect(events.length).toBeGreaterThan(0);
    expect(events.some(e => e[0] === 'err')).toBe(true);
    await new Promise<void>((r) => srv.close(() => r()));
  });
});


