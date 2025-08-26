## ky-extra

Small, zero-dep plugins for the ky HTTP client: auth with refresh, smart retry, and a portable in-memory cache. ESM-only, tree-shakable.

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

#### withRetrySmart(options)

Exponential backoff + jitter using Ky retry hooks.

| name | type | default |
|---|---|---|
| limit | number | 3 |
| statuses | number[] | `[408,429,500,502,503,504]` |
| backoffCapMs | number | 2000 |

Returns: Plugin (function transforming Ky options)

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

#### createClient(baseOptions, ...plugins)

Deep-merges Ky options and concatenates hooks arrays, then returns `ky.create()`.

| Parameter | Type | Description |
|---|---|---|
| baseOptions | `ky.Options` | Initial options for the client |
| ...plugins | `Plugin[]` | Plugins that patch/augment options |

Returns: `ky.KyInstance`

#### mergeHooks(baseOptions, patchOptions)

Deep-merges two Ky `Options` objects where hook arrays are concatenated (base first, then patch). Used internally by `createClient` to ensure multiple plugins can add hooks without clobbering each other.

| Parameter | Type | Description |
|---|---|---|
| baseOptions | `ky.Options` | The base options (existing client state) |
| patchOptions | `ky.Options` | The plugin-provided patch to merge into base |

Returns: `ky.Options` (non-hook fields overridden by `patchOptions`; hook arrays concatenated in order: base → patch).

### Runtime support

- Browser: ✅
- Node ≥18.18: ✅
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


