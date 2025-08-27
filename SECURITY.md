# Security Policy

## Reporting Vulnerabilities

Please report security issues privately by opening a Security Advisory in GitHub or emailing the maintainer. Do not file public issues for vulnerabilities.

We will acknowledge receipt within 72 hours and work on a fix. Once resolved, we will publish an advisory and release a patched version.

## Scope

- Runtime code avoids Node-only APIs to be safe in browsers and workers. Node-only enterprise helpers (`withProxy`, `withTLS`) are no-ops outside Node.
- The cache plugin stores responses in memory only; it never persists to disk.
- Avoid enabling cache for sensitive endpoints; consider disabling or scoping the cache key.

## Redaction & Logs

- Use `withRedaction` to mask sensitive headers (e.g., `Authorization`, `Cookie`) before sending data to logs/metrics.
- Do not log raw request/response bodies in production. If you must, redact fields.

## TLS

- Prefer verifying TLS (`rejectUnauthorized: true`). Avoid disabling verification; it opens the door to MITM attacks.
- To trust corporate CAs, either set `NODE_EXTRA_CA_CERTS` or use `withTLS({ caCertPath })`.

## Proxies

- Honor `NO_PROXY` for localhost and internal hosts to avoid routing secrets to proxies unnecessarily.

## Tokens and Secrets

`withAuth` never logs tokens. Ensure your application does not print headers or error objects containing secrets.


