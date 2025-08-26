import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import http from 'node:http';
import {createClient, withAuth} from '../src/index.js';

let server: http.Server;
let baseUrl: string;

describe('withAuth', () => {
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const auth = req.headers['authorization'];
      if (req.url === '/protected') {
        if (auth === 'Bearer good') {
          res.writeHead(200, {'content-type': 'application/json'});
          res.end(JSON.stringify({ok: true}));
        } else if (auth === 'Bearer stale') {
          res.writeHead(401);
          res.end();
        } else {
          res.writeHead(401);
          res.end();
        }
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  });

  it('adds header and succeeds', async () => {
    let token = 'good';
    const client = createClient({prefixUrl: baseUrl}, withAuth(() => token, async () => {}));
    const res = await client.get('protected').json<{ok: boolean}>();
    expect(res.ok).toBe(true);
  });

  it('refreshes once on 401 and replays', async () => {
    let token = 'stale';
    let refreshed = 0;
    const client = createClient(
      {prefixUrl: baseUrl},
      withAuth(
        () => token,
        async () => {
          token = 'good';
          refreshed++;
        },
      ),
    );
    const res = await client.get('protected').json<{ok: boolean}>();
    expect(res.ok).toBe(true);
    expect(refreshed).toBe(1);
  });

  it('does not loop infinitely on repeated 401', async () => {
    let token = 'stale';
    const client = createClient({prefixUrl: baseUrl}, withAuth(() => token, async () => {}));
    await expect(client.get('protected').json()).rejects.toBeTruthy();
  });
});


