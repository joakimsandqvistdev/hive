# Single-command local services

- **Status:** Accepted
- **Date:** 2026-10-13

## Decision

Provide `npm run local` and `npm run local:stop` through a dependency-free Node.js launcher and a Docker Compose local overlay. Docker runs the built API/web app, queue worker, PostgreSQL, and existing image runner. Install npm dependencies and build inside a shared Node.js 22 image; keep hot-reload development scripts available separately.

Create `.env` only when absent, using a random database password and the existing template. Preserve existing configuration. OAuth credentials remain a one-time manual prerequisite for sign-in. Always apply tracked migrations to the Compose database before starting the app and worker, regardless of an external `DATABASE_URL` in the host configuration.

Use NVIDIA passthrough when host detection succeeds, with explicit CPU/GPU options. Preserve the established database/model-cache volume names and host artifact directory. Stop only the current Compose project; never remove persistent volumes as part of normal shutdown.

## Consequences

Node.js and Docker are host prerequisites. Initial builds and model downloads require network access and time. This path runs a built local app rather than a source-watched development server. Manually launched processes must be stopped in their own terminals. Health checks prove service readiness, not model memory suitability or successful inference.
