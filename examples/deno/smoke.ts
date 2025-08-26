// Deno smoke test: run after building the package
// Usage: deno run --allow-net examples/deno/smoke.ts
import {createClient, withCache, withRetrySmart} from '../../dist/index.js';

const api = createClient({prefixUrl: 'https://httpbin.org'}, withRetrySmart(), withCache());
const data = await api.get('get?deno=1').json();
console.log('deno-ok', Boolean(data));


