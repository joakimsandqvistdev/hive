# Decision 0036: Authenticate the private model runner

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

The local model runner exposes expensive generation and model-download operations. Binding its host port to loopback limits network reachability, but does not prevent arbitrary local processes or browser pages from invoking those operations.

## Decision

- Require a shared bearer token on every runner HTTP route, including health and model-download routes.
- Pass the token only to the API, workflow worker, runner, and runner health check through Compose environment configuration.
- Have the local launcher create a random token in the ignored `.env` file when it is missing. Never print the token.
- Bind PostgreSQL's published development port to loopback by default.

## Consequences

Manual Compose deployments must configure the same non-empty `RUNNER_API_TOKEN` for the API, worker, and runner. Local launcher users receive a generated token automatically. Runner HTTP endpoints remain private worker interfaces; direct unauthenticated access returns 401.
