# Soft workspace appearance

- **Status:** Accepted
- **Date:** 2026-10-13

## Decision

Use the light Soft workspace design selected by the user from the three Hive previews. It replaces the earlier Slate Sky dark appearance: pale gray workspace and navigation surfaces, white rounded panels, restrained shadows, and blue actions/selection states.

Keep colors, radii, and shadows centralized in the Mantine theme and shared styles. Existing navigation, forms, tables, workflow editing, and API contracts retain their behavior.

## Consequences

Light mode is the default enforced appearance. Explicit text shades and React Flow surfaces must remain readable in light mode. Future UI changes follow `docs/DESIGN_SYSTEM.md`; adding a theme switch is outside this change.
