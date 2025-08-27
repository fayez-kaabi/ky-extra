import {describe, it, expect} from 'vitest';
import {createClient, withTLS} from '../src/index.js';
import http from 'node:http';

describe('withTLS', () => {
  it('is no-op without files (honors NODE_EXTRA_CA_CERTS implicitly)', async () => {
    const server = http.createServer((_req, res) => { res.end('ok'); });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const {port} = server.address() as any;
    const api = createClient({prefixUrl: `http://127.0.0.1:${port}`}, withTLS({}));
    const text = await api.get('').text();
    expect(text).toBe('ok');
    await new Promise<void>((r) => server.close(() => r()));
  });
});


