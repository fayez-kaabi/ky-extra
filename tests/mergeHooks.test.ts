import {describe, it, expect} from 'vitest';
import {mergeHooks} from '../src/index.js';

describe('mergeHooks', () => {
  it('overrides non-hook fields and concatenates hooks', async () => {
    const log: string[] = [];
    const base = {
      prefixUrl: 'http://x',
      hooks: {
        beforeRequest: [() => log.push('base-before')],
      },
      headers: {a: '1'},
    } as any;
    const patch = {
      prefixUrl: 'http://y',
      hooks: {
        beforeRequest: [() => log.push('patch-before')],
      },
      headers: {b: '2'},
    } as any;

    const merged = mergeHooks(base, patch);
    expect(merged.prefixUrl).toBe('http://y');
    expect(merged.hooks?.beforeRequest?.length).toBe(2);
    // Run hooks
    for (const h of merged.hooks!.beforeRequest!) await h(new Request('http://t'), {} as any);
    expect(log).toEqual(['base-before', 'patch-before']);
  });

  it('handles no hooks in either object', () => {
    const merged = mergeHooks({}, {} as any);
    expect(merged.hooks?.beforeRequest ?? []).toEqual([]);
  });

  it('multiple merges remain consistent', () => {
    const a = mergeHooks({}, {hooks: {beforeRequest: [() => {}]}} as any);
    const b = mergeHooks(a, {hooks: {beforeRequest: [() => {}]}} as any);
    expect(b.hooks?.beforeRequest?.length).toBe(2);
  });
});


