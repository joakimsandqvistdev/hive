# Decision 0037: Start ngrok with the local Hive launcher

- **Status:** Accepted
- **Date:** 2026-10-20

## Context

Local webhook senders and Instagram need a public HTTPS route to the Hive API. Developers asked to use ngrok rather than configuring another tunnel provider manually.

## Decision

- `npm run local` starts `ngrok http 3001`, or reuses an existing ngrok tunnel already forwarding to that port.
- The launcher passes the discovered HTTPS URL to Hive as its webhook and Instagram media origin and as the Instagram OAuth callback base.
- `npm run local:stop` stops only the ngrok tunnel that the launcher started. A manually started tunnel is reused and left running.
- Persist only the launcher-owned ngrok process ID, tunnel ID, and public URL under ignored `.data/`; do not store ngrok credentials in the repository.

## Consequences

The ngrok agent and its authtoken must be installed and configured before `npm run local`. The displayed Instagram callback URL must be registered in Meta. A tunnel must remain available while remote webhook senders or Instagram fetch Hive media.
