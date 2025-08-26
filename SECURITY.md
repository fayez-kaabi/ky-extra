# Security Policy

## Reporting Vulnerabilities

Please report security issues privately by opening a Security Advisory in GitHub or emailing the maintainer. Do not file public issues for vulnerabilities.

We will acknowledge receipt within 72 hours and work on a fix. Once resolved, we will publish an advisory and release a patched version.

## Scope

- Runtime code avoids Node-only APIs to be safe in browsers and workers.
- The cache plugin stores responses in memory only; it never persists to disk.
- Avoid enabling cache for sensitive endpoints; consider disabling or scoping the cache key.

## Tokens and Secrets

`withAuth` never logs tokens. Ensure your application does not print headers or error objects containing secrets.


