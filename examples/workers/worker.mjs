import {createClient, withRetrySmart, withCache} from '../../dist/index.js';

export default {
  async fetch(_req, _env, _ctx) {
    const api = createClient({prefixUrl: 'https://httpbin.org'}, withRetrySmart(), withCache());
    // Demonstrate a simple fetch
    const res = await api.get('get?demo=1').json();
    return new Response(JSON.stringify({ok: true, res}), {headers: {'content-type': 'application/json'}});
  }
};


