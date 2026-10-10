# Current work

## 2026-10-10 — AI orchestration MVP design

- Added `docs/ORCHESTRATION_MVP_DESIGN.md` describing a proposed MVP architecture, data model, local inference options, artifact storage, execution, security, and delivery sequence.
- Recommended a browser control plane with an authenticated API, durable worker queue, isolated allow-listed local model runners, PostgreSQL metadata, and persistent local artifact storage for a single-host POC.
- This is design only; no runtime, schema, or product behavior has been implemented. Hardware target and model/license selection remain open.

## 2026-10-10 — Slate Sky visual theme

- Applied Slate Sky as the app's dark Mantine theme, with lighter developer-tool surfaces and a restrained sky-blue accent.
- Centralized palette, typography, spacing, radii, shadows, and shared component defaults in `apps/web/src/theme.ts`.
- Simplified Home into a flatter, more compact layout; preserved AppShell navigation and Google authentication behavior.
- Verify with the web production build and inspect the running browser view.
