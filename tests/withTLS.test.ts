import {describe, it, expect, vi} from 'vitest';
// Mock undici so withTLS can import it during tests without the real dep
vi.mock('undici', () => {
  class Agent { constructor(_opts?: any) {} }
  const fetch = async (url: any, init: any) => {
    const {dispatcher: _d, ...rest} = init ?? {};
    return globalThis.fetch(url, rest as any);
  };
  return {Agent, fetch};
});
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


