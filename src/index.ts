import ky from 'ky';
export type Ky = typeof ky;
export type KyInstance = import('ky').KyInstance;
export type Options = import('ky').Options;
export type Hooks = import('ky').Hooks;
export type KyRequest = import('ky').KyRequest;
export type NormalizedOptions = import('ky').NormalizedOptions;
export type BeforeRequestHook = import('ky').BeforeRequestHook;
export type AfterResponseHook = import('ky').AfterResponseHook;

/**
 * A plugin transforms Ky options: given current options, returns new options.
 */
export interface Plugin {
  (options: Options): Options;
}

export interface WithAuthOptions {
  header?: string;
  scheme?: string;
  retryOnce?: boolean;
}

export type GetToken = () => string | Promise<string>;
export type RefreshToken = () => Promise<void>;

/**
 * Adds an Authorization header and performs a single refresh/retry on 401.
 */
export function withAuth(
  getToken: GetToken,
  refresh: RefreshToken,
  opts: WithAuthOptions = {}
): Plugin {
  const {header = 'Authorization', scheme = 'Bearer', retryOnce = true} = opts;

  return (options: Options): Options => {
    const hooks: Hooks = options.hooks ?? {};
    const beforeRequest = [...(hooks.beforeRequest ?? [])];
    const afterResponse = [...(hooks.afterResponse ?? [])];

    beforeRequest.push(async (request: KyRequest) => {
      const token = await getToken();
      if (token) {
        request.headers.set(header, `${scheme} ${token}`);
      }
    });

    afterResponse.push(async (request: KyRequest, requestOptions: NormalizedOptions, response: Response) => {
      if (response.status !== 401) return;
      const marker = 'x-ky-extra-refreshed';
      if (!request.headers.has(marker) && retryOnce) {
        await refresh();
        const newHeaders = new Headers(request.headers);
        newHeaders.set(marker, '1');
        const token = await getToken();
        if (token) newHeaders.set(header, `${scheme} ${token}`);
        const merged = {...requestOptions, headers: newHeaders} as Options;
        return ky(request, merged as any);
      }
    });

    return {
      ...options,
      hooks: {
        ...hooks,
        beforeRequest,
        afterResponse,
      },
    } as Options;
  };
}

export interface WithRetrySmartOptions {
  limit?: number;
  statuses?: number[];
  backoffCapMs?: number;
}

function jitteredBackoff(attempt: number, capMs: number): number {
  const base = Math.min(capMs, Math.pow(2, attempt) * 100);
  const jitter = Math.random() * base * 0.5;
  return Math.min(capMs, base + jitter);
}

/**
 * Adds exponential backoff with jitter using Ky's beforeRetry hook.
 */
export function withRetrySmart(opts: WithRetrySmartOptions = {}): Plugin {
  const {limit = 3, statuses = [408, 429, 500, 502, 503, 504], backoffCapMs = 2000} = opts;

  return (options: Options): Options => {
    const hooks: Hooks = options.hooks ?? {};
    const beforeRetry = [...(hooks.beforeRetry ?? [])];

    beforeRetry.push(async ({request: _request, error, retryCount, options: o}: any) => {
      const status: number | undefined = error?.response?.status;
      if (typeof status === 'number' && !statuses.includes(status)) {
        o.retry = {limit: 0};
        return;
      }
      const attempt = typeof retryCount === 'number' ? retryCount + 1 : 1;
      const waitMs = jitteredBackoff(attempt, backoffCapMs);
      await new Promise((r) => setTimeout(r, waitMs));
    });

    return {
      ...options,
      retry: {
        limit,
        methods: ['get', 'put', 'head', 'delete', 'options', 'trace', 'post', 'patch'],
        statusCodes: statuses,
      },
      hooks: {
        ...hooks,
        beforeRetry,
      },
    } as Options;
  };
}

export interface WithCacheOptions {
  ttlMs?: number;
  key?: (input: Request | URL | string, options: Options) => string | Promise<string>;
  methods?: Array<'GET' | 'HEAD'>;
}

interface CacheEntry {
  expiresAt: number;
  response: Response;
}

/**
 * Provides an in-memory TTL cache by wrapping options.fetch. Standards-only.
 */
export function withCache(opts: WithCacheOptions = {}): Plugin {
  const {ttlMs = 10_000, key, methods = ['GET', 'HEAD']} = opts;
  const cache = new Map<string, CacheEntry>();

  return (options: Options): Options => {
    const origFetch = options.fetch ?? fetch;

    const wrappedFetch: typeof fetch = async (input, init) => {
      const req = new Request(input as any, init as any);
      const method = req.method.toUpperCase();
      if (!methods.includes(method as 'GET' | 'HEAD')) {
        return origFetch(req as any);
      }

      const hdrs = req.headers;
      const cacheControl = hdrs.get('cache-control');
      if (cacheControl && /no-cache|no-store/i.test(cacheControl)) {
        return origFetch(req as any);
      }

      const urlRaw = req.url;
      const u = new URL(urlRaw);
      const url = `${u.pathname}${u.search}`;
      const k = key
        ? await (key as any)(req as any, {method, headers: hdrs} as any)
        : `${method} ${url}`;
      const now = Date.now();
      const entry = cache.get(k);
      if (entry && entry.expiresAt > now) {
        return entry.response.clone();
      }

      const res = await origFetch(req as any);
      try {
        const respCC = res.headers.get('cache-control');
        const isNoStore = respCC ? /no-cache|no-store/i.test(respCC) : false;
        if (res.ok && !isNoStore) {
          const clone = res.clone();
          cache.set(k, {expiresAt: now + ttlMs, response: clone});
        }
      } catch { /* ignore */ }
      return res;
    };

    return {
      ...options,
      fetch: wrappedFetch,
    } as Options;
  };
}

export type PluginFactory = (...args: any[]) => Plugin;

/**
 * Deep-merge two Ky Options where hooks arrays are concatenated.
 * Non-hook fields are overridden by patch.
 */
export function mergeHooks(base: Options, patch: Options): Options {
  const merged: any = {...base, ...patch};
  const a = (base.hooks ?? {}) as Hooks;
  const b = (patch.hooks ?? {}) as Hooks;
  merged.hooks = {
    beforeRequest: [...(a.beforeRequest ?? []), ...(b.beforeRequest ?? [])],
    beforeRetry: [...(a.beforeRetry ?? []), ...(b.beforeRetry ?? [])],
    afterResponse: [...(a.afterResponse ?? []), ...(b.afterResponse ?? [])],
    beforeError: [...(a.beforeError ?? []), ...(b.beforeError ?? [])],
  } as Hooks;
  return merged as Options;
}

/**
 * Compose plugins and create a configured Ky instance.
 */
export function createClient(baseOptions: Options, ...plugins: Plugin[]): KyInstance {
  let options = {...baseOptions};
  for (const plugin of plugins) {
    options = mergeHooks(options, plugin(options));
  }
  return ky.create(options);
}

//

// =========================
// Additional Plugins
// =========================

export interface WithDedupOptions {
  key?: (req: Request) => string | Promise<string>;
  methods?: Array<'GET' | 'HEAD'>;
}

export function withDedup(opts: WithDedupOptions = {}): Plugin {
  const {methods = ['GET', 'HEAD'], key} = opts;
  const inflight = new Map<string, Promise<Response>>();

  const makeKey = async (req: Request): Promise<string> => {
    if (key) return key(req);
    const u = new URL(req.url);
    return `${req.method} ${u.pathname}${u.search}`;
  };

  return (options: Options): Options => {
    const origFetch = options.fetch ?? fetch;
    const wrapped: typeof fetch = async (input, init) => {
      const req = new Request(input as any, init as any);
      const method = req.method.toUpperCase();
      if (!methods.includes(method as 'GET' | 'HEAD')) {
        return origFetch(req as any);
      }
      const k = await makeKey(req);
      const existing = inflight.get(k);
      if (existing) {
        return existing.then(r => r.clone());
      }
      const p = origFetch(req as any).finally(() => inflight.delete(k));
      inflight.set(k, p);
      const res = await p;
      return res;
    };
    return {...options, fetch: wrapped} as Options;
  };
}

type BreakerState = 'closed' | 'open' | 'half-open';
export interface WithCircuitBreakerOptions {
  failureThreshold?: number; // consecutive failures
  recoveryTimeoutMs?: number; // open -> half-open after
  failureStatuses?: number[]; // statuses that count as failure
  scope?: (req: Request) => string; // key scope (e.g., host)
  shortCircuitAs?: 'error' | 'response';
}

export function withCircuitBreaker(opts: WithCircuitBreakerOptions = {}): Plugin {
  const {
    failureThreshold = 5,
    recoveryTimeoutMs = 5000,
    failureStatuses = [500, 502, 503, 504],
    scope = (req) => new URL(req.url).host,
    shortCircuitAs = 'response',
  } = opts;
  interface Entry { state: BreakerState; failures: number; nextTryAt: number; }
  const states = new Map<string, Entry>();

  const getEntry = (key: string): Entry => states.get(key) ?? {state: 'closed', failures: 0, nextTryAt: 0};

  const shouldShortCircuit = (e: Entry): boolean => {
    if (e.state === 'open') return Date.now() < e.nextTryAt;
    return false;
  };

  return (options: Options): Options => {
    const origFetch = options.fetch ?? fetch;
    const wrapped: typeof fetch = async (input, init) => {
      const req = new Request(input as any, init as any);
      const key = scope(req);
      let entry = getEntry(key);
      if (shouldShortCircuit(entry)) {
        if (shortCircuitAs === 'error') return Promise.reject(new Error('Circuit breaker open'));
        return new Response('Circuit open', {status: 503});
      }
      if (entry.state === 'open' && Date.now() >= entry.nextTryAt) {
        entry = {state: 'half-open', failures: entry.failures, nextTryAt: 0};
        states.set(key, entry);
      }
      try {
        const res = await origFetch(req as any);
        if (failureStatuses.includes(res.status)) {
          // failure
          if (entry.state === 'half-open' || ++entry.failures >= failureThreshold) {
            entry.state = 'open';
            entry.nextTryAt = Date.now() + recoveryTimeoutMs;
          }
          states.set(key, entry);
        } else {
          // success
          states.set(key, {state: 'closed', failures: 0, nextTryAt: 0});
        }
        return res;
      } catch (err) {
        // network error counts as failure
        if (entry.state === 'half-open' || ++entry.failures >= failureThreshold) {
          entry.state = 'open';
          entry.nextTryAt = Date.now() + recoveryTimeoutMs;
        }
        states.set(key, entry);
        throw err;
      }
    };
    return {...options, fetch: wrapped} as Options;
  };
}

export interface WithRateLimiterOptions {
  capacity?: number; // max tokens
  refillPerSecond?: number; // tokens per second
  scope?: (req: Request) => string; // bucket key
}

export function withRateLimiter(opts: WithRateLimiterOptions = {}): Plugin {
  const {capacity = 10, refillPerSecond = 5, scope = (req) => new URL(req.url).host} = opts;
  interface Bucket { tokens: number; lastRefill: number; queue: Array<() => void>; }
  const buckets = new Map<string, Bucket>();

  const take = async (key: string): Promise<void> => {
    const now = Date.now();
    let b = buckets.get(key);
    if (!b) { b = {tokens: capacity, lastRefill: now, queue: []}; buckets.set(key, b); }
    // Refill
    const elapsed = Math.max(0, now - b.lastRefill) / 1000;
    const refill = elapsed * refillPerSecond;
    if (refill > 0) {
      b.tokens = Math.min(capacity, b.tokens + refill);
      b.lastRefill = now;
    }
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return;
    }
    await new Promise<void>(resolve => { b!.queue.push(resolve); });
  };

  const release = (key: string) => {
    const b = buckets.get(key);
    if (!b) return;
    const next = b.queue.shift();
    if (next) next();
    else b.tokens = Math.min(capacity, b.tokens + 1);
  };

  return (options: Options): Options => {
    const origFetch = options.fetch ?? fetch;
    const wrapped: typeof fetch = async (input, init) => {
      const req = new Request(input as any, init as any);
      const key = scope(req);
      await take(key);
      try {
        const res = await origFetch(req as any);
        return res;
      } finally {
        release(key);
      }
    };
    return {...options, fetch: wrapped} as Options;
  };
}

export interface WithObservabilityOptions {
  redact?: (info: {url: string; method: string; headers: Headers}) => {url: string; method: string; headers: Headers};
  onStart?: (info: {id: string; url: string; method: string; startMs: number}) => void;
  onSuccess?: (info: {id: string; durationMs: number; status: number}) => void;
  onError?: (info: {id: string; durationMs: number; error: unknown}) => void;
}

export function withObservability(opts: WithObservabilityOptions = {}): Plugin {
  const {redact, onStart, onSuccess, onError} = opts;
  return (options: Options): Options => {
    const origFetch = options.fetch ?? fetch;
    const hooks: Hooks = options.hooks ?? {};
    const beforeError = [...(hooks.beforeError ?? [])];
    if (onError) {
      beforeError.push(async (err) => {
        try {
          onError({id: 'hook', durationMs: 0, error: err});
        } catch { /* ignore */ }
        return err;
      });
    }
    const wrapped: typeof fetch = async (input, init) => {
      const req = new Request(input as any, init as any);
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const start = performance?.now?.() ?? Date.now();
      try {
        const info = {url: req.url, method: req.method, headers: req.headers};
        const red = redact ? redact(info) : info;
        onStart?.({id, url: red.url, method: red.method, startMs: Date.now()});
        const res = await origFetch(req as any);
        const end = performance?.now?.() ?? Date.now();
        onSuccess?.({id, durationMs: end - start, status: res.status});
        return res;
      } catch (error) {
        const end = performance?.now?.() ?? Date.now();
        onError?.({id, durationMs: end - start, error});
        throw error;
      }
    };
    return {...options, fetch: wrapped, hooks: {...hooks, beforeError}} as Options;
  };
}

export interface WithCacheLRUOptions {
  capacity?: number; // max entries
  ttlMs?: number;
  methods?: Array<'GET' | 'HEAD'>;
}

export function withCacheLRU(opts: WithCacheLRUOptions = {}): Plugin {
  const {capacity = 100, ttlMs = 10_000, methods = ['GET', 'HEAD']} = opts;
  type Entry = {expiresAt: number; response: Response};
  const lru = new Map<string, Entry>();
  const getKey = (req: Request) => {
    const u = new URL(req.url);
    return `${req.method} ${u.pathname}${u.search}`;
  };
  const setLRU = (k: string, v: Entry) => {
    if (lru.has(k)) lru.delete(k);
    lru.set(k, v);
    if (lru.size > capacity) {
      const first = lru.keys().next().value as string | undefined;
      if (first) lru.delete(first);
    }
  };
  return (options: Options): Options => {
    const orig = options.fetch ?? fetch;
    const wrapped: typeof fetch = async (input, init) => {
      const req = new Request(input as any, init as any);
      const method = req.method.toUpperCase();
      if (!methods.includes(method as 'GET' | 'HEAD')) return orig(req as any);
      // Ignore request Cache-Control for LRU to maximize hit rate; respect response directives below
      const k = getKey(req);
      const now = Date.now();
      const hit = lru.get(k);
      if (hit && hit.expiresAt > now) return hit.response.clone();
      const res = await orig(req as any);
      const ccRes = res.headers.get('cache-control');
      if (res.ok && !(ccRes && /no-cache|no-store/i.test(ccRes))) {
        try { setLRU(k, {expiresAt: now + ttlMs, response: res.clone()}); } catch { /* ignore */ }
      }
      return res;
    };
    return {...options, fetch: wrapped} as Options;
  };
}

// Validation helper (schema-first without bundling a validator)
export async function jsonValidated<T>(res: Response, validate: (data: unknown) => T): Promise<T> {
  const data = await res.json();
  return validate(data);
}

// Policy plugin: enforce header rules/timeout and optional HMAC signing
export interface WithPolicyOptions {
  blockHeaders?: Array<RegExp | string>; // names to strip
  sign?: {
    header: string; // header to set
    getKey: () => Promise<CryptoKey | ArrayBuffer | string>;
    algorithm?: AlgorithmIdentifier; // e.g., {name:'HMAC', hash:'SHA-256'}
  };
}

export function withPolicy(opts: WithPolicyOptions = {}): Plugin {
  const {blockHeaders = [], sign} = opts;
  const shouldBlock = (name: string) => blockHeaders.some(p => typeof p === 'string' ? p.toLowerCase() === name.toLowerCase() : p.test(name));
  return (options: Options): Options => {
    const hooks: Hooks = options.hooks ?? {};
    const beforeRequest = [...(hooks.beforeRequest ?? [])];
    beforeRequest.push(async (request: KyRequest, normalized: NormalizedOptions) => {
      // Strip blocked headers
      const h = new Headers(normalized.headers);
      for (const [k] of h) if (shouldBlock(k)) h.delete(k);
      normalized.headers = h;
      // Also strip from the in-flight Request headers to be safe across environments
      for (const [k] of request.headers) if (shouldBlock(k)) request.headers.delete(k);
      // Note: Ky's NormalizedOptions does not expose `timeout`; for per-request timeouts,
      // configure `options.timeout` at client creation or wrap fetch externally.
      // Signing (best-effort)
      if (sign) {
        try {
          const {header, getKey, algorithm = {name: 'HMAC', hash: 'SHA-256'}} = sign;
          const key = await getKey();
          const keyObj = key instanceof CryptoKey ? key : await (async () => {
            const raw = typeof key === 'string' ? new TextEncoder().encode(key) : key;
            return await crypto.subtle.importKey('raw', raw as ArrayBuffer, algorithm, false, ['sign']);
          })();
          const toSign = new TextEncoder().encode(`${normalized.method} ${new URL(request.url).pathname}${new URL(request.url).search}`);
          const sig = await crypto.subtle.sign(algorithm, keyObj, toSign);
          const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
          h.set(header, b64);
          normalized.headers = h;
        } catch { /* ignore */ }
      }
    });
    return {...options, hooks: {...hooks, beforeRequest}} as Options;
  };
}

// TanStack Query adapter: create a queryFn for a Ky instance
export function createQueryFn(instance: KyInstance) {
  return async ({queryKey}: {queryKey: readonly [string, Record<string, any>?]}) => {
    const [path, params] = queryKey;
    const search = params ? new URLSearchParams(params as any).toString() : '';
    const url = search ? `${path}?${search}` : path;
    return instance.get(url).json<any>();
  };
}

// Presets
export const presets = {
  nextServer(): Plugin[] {
    return [withRetrySmart(), withCache(), withDedup()];
  },
  workers(): Plugin[] {
    return [withRetrySmart(), withCache(), withDedup()];
  },
};


