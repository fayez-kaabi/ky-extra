## ky-extra

Plugins for the ky HTTP client: auth, smart retry, TTL/LRU cache, dedup, rate limit, circuit breaker, observability + helpers. Zero-dep, ESM-only, tree-shakable.

[![npm version](https://img.shields.io/npm/v/ky-extra.svg)](https://www.npmjs.com/package/ky-extra)
[![CI](https://github.com/fayez-kaabi/ky-extra/actions/workflows/ci.yml/badge.svg)](https://github.com/fayez-kaabi/ky-extra/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-90%25+-brightgreen)](./coverage)
[![Bundle size](https://badgen.net/bundlephobia/minzip/ky-extra)](https://bundlephobia.com/package/ky-extra)

### Install

```bash
npm i ky ky-extra
# or
pnpm add ky ky-extra
# or
yarn add ky ky-extra
```

### Quick Start

```ts
import ky from 'ky';
import {createClient, withAuth, withRetrySmart, withCache} from 'ky-extra';

const api = createClient(
  {prefixUrl: 'https://api.example.com'},
  withAuth(() => localStorage.getItem('token') ?? '', async () => {/* refresh token */}),
  withRetrySmart(),
  withCache(),
);

const data = await api.get('users/me').json();
```

### Plugins

#### withAuth(getToken, refresh, options)

Adds an auth header before requests; on 401, calls `refresh()` once and retries with the new token.

Options:

| name | type | default |
|---|---|---|
| header | string | `"Authorization"` |
| scheme | string | `"Bearer"` |
| retryOnce | boolean | `true` |

Returns: Plugin (function transforming Ky options)

Example:

```ts
const api = createClient(
  {prefixUrl: 'https://api.example.com'},
  withAuth(() => localStorage.getItem('token') ?? '', async () => {/* refresh */})
);
```

#### withRetrySmart(options)

Exponential backoff + jitter using Ky retry hooks.

| name | type | default |
|---|---|---|
| limit | number | 3 |
| statuses | number[] | `[408,429,500,502,503,504]` |
| backoffCapMs | number | 2000 |

Returns: Plugin (function transforming Ky options)

Example:

```ts
const api = createClient({prefixUrl: '/api'}, withRetrySmart({limit: 5, backoffCapMs: 3000}));
```

#### withCache(options)

Portable in-memory TTL cache implemented via `options.fetch` override.

| name | type | default |
|---|---|---|
| ttlMs | number | 10000 |
| key | (input, options) => string | derived from method+url+headers |
| methods | ("GET"|"HEAD")[] | `["GET","HEAD"]` |

Notes:
- Never caches non-idempotent methods.
- Respects `Cache-Control: no-cache`/`no-store`.
- Clones responses before caching.

Returns: Plugin (function transforming Ky options)

Example:

```ts
const api = createClient({prefixUrl: '/api'}, withCache({ttlMs: 5000}));
```

#### createClient(baseOptions, ...plugins)

Deep-merges Ky options and concatenates hooks arrays, then returns `ky.create()`.

| Parameter | Type | Description |
|---|---|---|
| baseOptions | `ky.Options` | Initial options for the client |
| ...plugins | `Plugin[]` | Plugins that patch/augment options |

Returns: `ky.KyInstance`

#### mergeHooks(baseOptions, patchOptions)
#### withDedup(options)

Coalesces concurrent GET/HEAD requests by key so only one network call happens; others receive the same cloned response.

| name | type | default |
|---|---|---|
| key | (req: Request) => string | method + path+query |
| methods | ("GET"|"HEAD")[] | ["GET","HEAD"] |

Returns: Plugin

Example:

```ts
const api = createClient({prefixUrl: '/api'}, withDedup());
```

#### withCircuitBreaker(options)

Opens after consecutive failures, short-circuits further calls for a cooldown, then half-opens to probe recovery.

| name | type | default |
|---|---|---|
| failureThreshold | number | 5 |
| recoveryTimeoutMs | number | 5000 |
| failureStatuses | number[] | [500,502,503,504] |
| scope | (req: Request) => string | req host |
| shortCircuitAs | 'error' | 'response' | 'response' |

Returns: Plugin

Example:

```ts
const api = createClient({prefixUrl: '/api'}, withCircuitBreaker({failureThreshold: 3}));
```

#### withRateLimiter(options)

Token-bucket limiter per scope (host by default) with queueing and release.

| name | type | default |
|---|---|---|
| capacity | number | 10 |
| refillPerSecond | number | 5 |
| scope | (req: Request) => string | req host |

Returns: Plugin

Example:

```ts
const api = createClient({prefixUrl: '/api'}, withRateLimiter({capacity: 2, refillPerSecond: 4}));
```

#### withCacheLRU(options)

Capacity-bounded in-memory LRU cache with TTL. Respects `Cache-Control` request/response headers.

| name | type | default |
|---|---|---|
| capacity | number | 100 |
| ttlMs | number | 10000 |
| methods | ("GET"|"HEAD")[] | ["GET","HEAD"] |

Returns: Plugin

Example:

```ts
const api = createClient({prefixUrl: '/api'}, withCacheLRU({capacity: 50, ttlMs: 15000}));
```

#### withObservability(options)

Lightweight hooks for start/success/error with optional redaction.

| name | type | default |
|---|---|---|
| redact | ({url,method,headers})=>{...} | undefined |
| onStart | (info)=>void | undefined |
| onSuccess | (info)=>void | undefined |
| onError | (info)=>void | undefined |

Returns: Plugin

Example:

```ts
const api = createClient({prefixUrl: '/api'}, withObservability({
  onStart: (e) => console.log('start', e.method, e.url),
  onSuccess: (e) => console.log('ok', e.status, e.durationMs),
}));
```

### Enterprise add-ons (Node-only)

#### Proxy

Environment variables (Node):

```
HTTPS_PROXY=http://corp-proxy:8080
NO_PROXY=localhost,127.0.0.1,.internal,10.0.0.0/8
```

Code:

```ts
import {createClient, withProxy} from 'ky-extra';

const api = createClient(
  {prefixUrl: process.env.API_URL!},
  withProxy({useEnv: true, perHost: {'api.example.com': 'http://eu-proxy:8080'}})
);
```

Browser/edge runtimes: `withProxy` is a no-op.

Options:

| name | type | default |
|---|---|---|
| proxyUrl | string | undefined |
| useEnv | boolean | true |
| noProxy | string[] | [] |
| perHost | Record<string,string> | {} |

#### Corporate CA & mTLS

- Honor `NODE_EXTRA_CA_CERTS` by default
- Or provide paths explicitly:

```ts
import {withTLS} from 'ky-extra';

const api = createClient({prefixUrl: 'https://internal.example.com'}, withTLS({
  caCertPath: '/etc/ssl/certs/corp-ca.pem',
  // certPath: '/path/client.crt',
  // keyPath: '/path/client.key',
  rejectUnauthorized: true,
}));
```

Security note: avoid `rejectUnauthorized: false` in production.

Options:

| name | type | default |
|---|---|---|
| caCertPath | string | NODE_EXTRA_CA_CERTS if set |
| certPath | string | undefined |
| keyPath | string | undefined |
| rejectUnauthorized | boolean | true |

#### CorporateNetwork preset

```ts
import {withCorporateNetwork} from 'ky-extra';

const api = createClient(
  {prefixUrl: process.env.API_URL!},
  withCorporateNetwork({ timeoutMs: 15000 })
);
```

Includes proxy/TLS (if configured), smart retry, request id, and a response size guard.

Options:

| name | type | default |
|---|---|---|
| proxy | WithProxyOptions | undefined |
| tls | WithTLSOptions | undefined |
| retry | WithRetrySmartOptions | `{ limit: 3, statuses: [408,429,500,502,503,504], backoffCapMs: 2000 }` |
| timeoutMs | number | 15000 |
| maxResponseBytes | number | 10000000 |

#### Observability & policies

- `withRequestId({ header = 'X-Request-ID', generator })`
- `withOtel()` — if `@opentelemetry/api` is installed, spans are created; otherwise no-op
- `withRedaction({ headers })` — masks sensitive headers for your logging hooks

Request ID options:

| name | type | default |
|---|---|---|
| header | string | `"X-Request-ID"` |
| generator | () => string | `crypto.randomUUID()` fallback |

#### Helpers

- jsonValidated(response, validate): parse JSON and validate via provided function.
- createQueryFn(kyInstance): returns a TanStack Query-compatible queryFn.

Examples:

```ts
// jsonValidated
const user = await jsonValidated(await api.get('user').then(r => r), (d) => {
  if (typeof d === 'object' && d && 'id' in d) return d as {id: string};
  throw new Error('invalid');
});

// createQueryFn
const queryFn = createQueryFn(api);
// use with TanStack Query: queryFn({ queryKey: ['users', {page: 1}] })
```

#### createClient(baseOptions, ...plugins)

| Parameter | Type | Description |
|---|---|---|
| baseOptions | `ky.Options` | Initial options for the client |
| ...plugins | `Plugin[]` | Plugins that patch/augment options |

Returns: `ky.KyInstance`

#### mergeHooks(baseOptions, patchOptions)

| Parameter | Type | Description |
|---|---|---|
| baseOptions | `ky.Options` | The base options (existing client state) |
| patchOptions | `ky.Options` | The plugin-provided patch to merge into base |

Returns: `ky.Options` (non-hook fields overridden by `patchOptions`; hook arrays concatenated in order: base → patch).


Deep-merges two Ky `Options` objects where hook arrays are concatenated (base first, then patch). Used internally by `createClient` to ensure multiple plugins can add hooks without clobbering each other.

| Parameter | Type | Description |
|---|---|---|
| baseOptions | `ky.Options` | The base options (existing client state) |
| patchOptions | `ky.Options` | The plugin-provided patch to merge into base |

Returns: `ky.Options` (non-hook fields overridden by `patchOptions`; hook arrays concatenated in order: base → patch).

### Runtime support

- Node ≥18.18: ✅ (proxy/TLS available)
- Browser: ✅ (proxy/TLS are no-ops)
- Workers/Edge: ⚠️ `withProxy`/`withTLS` are no-ops; others work if `fetch` exists
- Bun: ✅
- Deno (via npm compat or import maps): ✅

No Node-only APIs are used at runtime; cache uses standards-only `fetch`.

#### Runtime notes

- Requires a standards `fetch`/`Request`/`Response` environment (Browser, Node ≥18, Workers/Edge, Bun, Deno with npm compat).
- Deno: import via npm specifiers or an import map; ensure `ky` is resolved properly.
- SSR/Edge (Next.js, Workers): make sure `fetch` is available in the runtime (it is by default).
- In-memory cache is per-process and per-client instance; it does not persist across server restarts or to disk.
- ESM-only: import with `import {createClient} from 'ky-extra'`.

### FAQ

- 401 keeps failing: Ensure your `refresh()` really updates the token source used by `getToken()`.
- Cache misses: Responses with `Cache-Control: no-cache` are never cached.
- SSR/Edge: Works in Next.js app router and workers; ensure `fetch` is available.

### Performance

Tiny, tree-shakable ESM output. No runtime deps besides peer `ky`.

### Security

- Do not cache sensitive endpoints unless safe.
- Tokens are never logged; avoid printing headers.

### Versioning / Release

Managed with Changesets. Merges to `main` trigger a Version PR; merging that PR publishes to npm with provenance.

### Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

### License

MIT © Contributors

### Verification

```bash
pnpm i
pnpm test
pnpm build
```

#### Local runnable example (Node)

After building, run a quick demo server+client:

```bash
npm run build
node examples/node/index.mjs
```

You should see logs for auth refresh, retry, and cache.

#### Other runnable examples

- Cloudflare Workers (using Miniflare locally):

  ```bash
  npm run build
  # Wrangler uses Miniflare under the hood in dev
  npx wrangler dev examples/workers/worker.mjs --local --port 8787
  # in another terminal
  curl http://127.0.0.1:8787
  ```

- Deno:

  ```bash
  npm run build
  deno run --allow-net --config examples/deno/deno.json examples/deno/smoke.ts
  ```

- Bun (runs the Node example):

  ```bash
  npm run build
  bun examples/node/index.mjs
  ```

- Next.js (App Router snippet): See `examples/nextjs/README.md` for code you can paste into an existing Next.js app.


