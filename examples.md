### Examples

#### Next.js (server runtime)

```ts
import {createClient, withAuth, withRetrySmart, withCache} from 'ky-extra';

export const api = createClient(
  {prefixUrl: process.env.API_URL!},
  withAuth(async () => process.env.TOKEN ?? '', async () => {/* refresh */}),
  withRetrySmart(),
  withCache(),
);
```

#### Cloudflare Workers (edge)

```ts
import {createClient, withRetrySmart} from 'ky-extra';

export default {
  async fetch(_req: Request, _env: unknown, _ctx: ExecutionContext) {
    const api = createClient({prefixUrl: 'https://api.example.com'}, withRetrySmart());
    return api.get('status').then(r => r);
  }
};
```

#### Browser

```ts
import {createClient, withCache} from 'ky-extra';

const api = createClient({prefixUrl: '/api'}, withCache());
const data = await api.get('users').json();
```


