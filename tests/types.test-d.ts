// Type-only test; run with ts-node or dtslint-like checks if desired.
import ky from 'ky';
import type {Options} from 'ky';
import {withAuth, withRetrySmart, withCache, createClient, mergeHooks} from '../src/index.js';

declare const token: string;

const a: Options = {prefixUrl: 'https://x', headers: {a: '1'}};
const b: Options = {headers: {b: '2'}, hooks: {beforeRequest: [() => {}]}};
const m = mergeHooks(a, b);

const client = createClient(
  {prefixUrl: 'https://api.example.com'},
  withAuth(() => token, async () => {}),
  withRetrySmart({limit: 2}),
  withCache({ttlMs: 100})
);

// Basic usage typings
client.get('users').json<Record<string, unknown>>();


