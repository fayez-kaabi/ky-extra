import {describe, it, expect, vi} from 'vitest';
import {createClient, withProxy, withCorporateNetwork} from '../src/index';

// Mock undici to assert dispatcher usage without a real proxy
vi.mock('undici', () => {
  const calls: any[] = [];
  class ProxyAgent { url: string; constructor(url: string) { this.url = url; } }
  const fetch = async (url: any, init: any) => {
    calls.push({url, init});
    return new Response(JSON.stringify({ok: true}), {headers: {'content-type': 'application/json'}});
  };
  return {ProxyAgent, fetch, __calls: calls};
});

describe('withProxy', () => {
  it('bypasses when NO_PROXY matches host', async () => {
    const baseFetch = vi.fn(async () => new Response(JSON.stringify({ok: true}), {headers: {'content-type': 'application/json'}}));
    process.env.NO_PROXY = 'example.com';
    const api = createClient({prefixUrl: 'http://example.com', fetch: baseFetch as any}, withProxy({useEnv: true}));
    await api.get('test').json();
    expect(baseFetch).toHaveBeenCalled();
    delete process.env.NO_PROXY;
  });

  it('uses ProxyAgent when perHost matches', async () => {
    // Access mock calls
    const undici = await import('undici') as any;
    undici.__calls.length = 0;
    const api = createClient({prefixUrl: 'http://api.example.com'}, withProxy({perHost: {'api.example.com': 'http://corp-proxy:8080'}, noProxy: []}));
    const res = await api.get('v1').json<any>();
    expect(res.ok).toBe(true);
    expect(undici.__calls.length).toBe(1);
    expect(undici.__calls[0].init.dispatcher).toBeInstanceOf(undici.ProxyAgent);
    expect(undici.__calls[0].url).toContain('http://api.example.com');
  });
});

describe('withCorporateNetwork', () => {
  it('enforces size guard', async () => {
    const bigBody = 'X'.repeat(1024 * 64);
    const baseFetch = async () => new Response(bigBody);
    const api = createClient({prefixUrl: 'http://example.com', fetch: baseFetch as any}, withCorporateNetwork({maxResponseBytes: 1024}));
    await expect(api.get('big').text()).rejects.toThrow();
  });
});


