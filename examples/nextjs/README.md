# Next.js example (App Router)

```ts
// app/lib/api.ts
import {createClient, withRetrySmart, withCache} from 'ky-extra';

export const api = createClient(
  {prefixUrl: process.env.NEXT_PUBLIC_API_URL!},
  withRetrySmart(),
  withCache(),
);
```

```ts
// app/page.tsx
import {api} from './lib/api';

export default async function Page() {
  const data = await api.get('status').json<any>();
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
```

Notes:
- Next.js server runtime already provides `fetch`.
- Ensure `ky-extra` is ESM-only (it is) and that your project has "type": "module" or transpiles ESM.

