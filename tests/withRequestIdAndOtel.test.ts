import {describe, it, expect, vi} from 'vitest';
import {createClient, withRequestId, withOtel, withRedaction} from '../src/index.js';

describe('withRequestId', () => {
  it('adds header when missing', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => new Response('ok'));
    const api = createClient({fetch: fetchMock as any}, withRequestId({}));
    await api.get('https://example.com/');
    const req = fetchMock.mock.calls[0][0] as Request;
    expect((req as any).headers.get('X-Request-ID')).toBeTruthy();
  });
});

describe('withOtel', () => {
  it('no-op when api not installed', async () => {
    const fetchMock = vi.fn(async () => new Response('ok'));
    const api = createClient({fetch: fetchMock as any}, withOtel());
    await api.get('https://example.com/');
    expect(fetchMock).toHaveBeenCalled();
  });
});


