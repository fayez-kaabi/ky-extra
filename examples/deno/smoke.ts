// Deno smoke test: run after building the package
// Usage: deno run --allow-net --config examples/deno/deno.json examples/deno/smoke.ts
import {createClient, withCache, withRetrySmart} from '../../dist/index.js';

// Start a tiny local server to avoid external network flakiness
const controller = new AbortController();
const {signal} = controller;
const port = 8790;
const server = Deno.serve({hostname: '127.0.0.1', port, signal}, (_req) => new Response('pong'));

const api = createClient({prefixUrl: `http://127.0.0.1:${port}`, timeout: false}, withRetrySmart(), withCache());
const text = await api.get('').text();
console.log('deno-ok', text === 'pong');
controller.abort();


