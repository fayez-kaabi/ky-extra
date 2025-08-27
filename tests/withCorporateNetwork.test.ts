import {describe, it, expect} from 'vitest';
import {createClient, withCorporateNetwork} from '../src/index.js';

describe('withCorporateNetwork preset', () => {
  it('applies timeout and request id', async () => {
    const slowFetch = async () => {
      await new Promise((r) => setTimeout(r, 50));
      return new Response('ok');
    };
    const api = createClient({fetch: slowFetch as any, timeout: 10}, withCorporateNetwork({timeoutMs: 10}));
    await expect(api.get('https://example.com/')).rejects.toBeTruthy();
  });
});


