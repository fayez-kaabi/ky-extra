import http from 'node:http';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {createClient, withPolicy} from '../src/index.js';

let server: http.Server;
let baseUrl: string;

describe('withPolicy', () => {
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/hdr') {
        // echo if sensitive header is present
        const sensitive = req.headers['sensitive'];
        res.writeHead(200, {'content-type': 'application/json'});
        res.end(JSON.stringify({hasSensitive: Boolean(sensitive)}));
        return;
      }
      res.writeHead(404); res.end();
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}`;
  });
  afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

  it('strips blocked headers', async () => {
    const api = createClient({prefixUrl: baseUrl}, withPolicy({blockHeaders: ['sensitive']}));
    const r = await api.get('hdr', {headers: {sensitive: 'secret'}}).json<{hasSensitive: boolean}>();
    expect(r.hasSensitive).toBe(false);
  });

  it('signs request best-effort without throwing', async () => {
    const api = createClient({prefixUrl: baseUrl}, withPolicy({
      sign: { header: 'x-sig', getKey: async () => 'key' }
    }));
    const r = await api.get('hdr').json<{hasSensitive: boolean}>();
    expect(typeof r.hasSensitive).toBe('boolean');
  });
});


