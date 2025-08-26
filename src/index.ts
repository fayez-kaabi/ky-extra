import ky from 'ky';
export type Ky = typeof ky;
export type KyInstance = import('ky').KyInstance;
export type Options = import('ky').Options;
export type Hooks = import('ky').Hooks;

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

    beforeRequest.push(async (request) => {
      const token = await getToken();
      if (token) {
        request.headers.set(header, `${scheme} ${token}`);
      }
    });

    afterResponse.push(async (request, requestOptions, response) => {
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

    beforeRetry.push(async ({request, error, retryCount, options: o}: any) => {
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
      } catch {
        // Ignore cloning/cache errors to avoid breaking requests
      }
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

function normalizeKyHeaders(h: any): Headers {
  return new Headers(h as any);
}


