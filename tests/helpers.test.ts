import {describe, it, expect} from 'vitest';
import {jsonValidated, createQueryFn} from '../src/index.js';

describe('helpers', () => {
  it('jsonValidated validates with provided function', async () => {
    const res = new Response(JSON.stringify({a: 1}), {headers: {'content-type': 'application/json'}});
    const out = await jsonValidated(res, (d) => {
      if (typeof d === 'object' && d && 'a' in d) return d as any;
      throw new Error('invalid');
    });
    expect(out.a).toBe(1);
  });

  it('createQueryFn creates a proper queryFn', async () => {
    const instance = { get: (u: string) => ({ json: async () => ({u}) }) } as any;
    const qf = createQueryFn(instance);
    const data = await qf({queryKey: ['users', {page: 1}] as any});
    expect(data.u).toContain('users?');
  });
});


