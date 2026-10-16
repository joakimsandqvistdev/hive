# AGENTS.md

## Project context

This repository contains an existing web application with authentication, a database, APIs, and multiple features.

Treat the existing codebase as the source of truth for implemented behavior. Treat product and architecture documentation as the source of truth for intended behavior and agreed decisions.

## Asset policy

- Add raster assets only when a task or product requirement calls for them. Prefer existing assets or code-based graphics when appropriate.

## Dependency integration

- Prefer improvements to reusable dependency APIs over application-specific workarounds when the improvement is generally useful. Describe proposed upstream changes and their benefits.

## Before making changes

- Inspect the relevant implementation, tests, and existing patterns.
- Read the relevant documentation when a task touches its area.
- Check `docs/working/CURRENT.local.md` when resuming ongoing local work or when the task depends on recent progress. This file is local-only.
- Do not assume previous chat history is available.
- Distinguish confirmed requirements from assumptions.

## Public repository hygiene

- Keep real credentials, personal filesystem paths, local database contents, and machine-specific operational notes out of tracked files.
- Use clearly fake local-only values in examples; never copy values from a real environment file.
- Review documentation, examples, and generated artifacts for private data before publishing.

## Engineering rules

- Preserve established architecture and API contracts unless a change is explicitly intended.
- Prefer small, focused changes over unrelated refactoring.
- Reuse existing components, services, and utilities.
- Do not introduce dependencies without a clear need.
- Preserve authentication, authorization, tenant boundaries, and data integrity.
- Never expose secrets or bypass security controls.
- Do not perform destructive database or production operations without explicit approval.
- When adding a feature or making a substantial change to an existing feature, update both `README.md` and the signed-in/public home page description (`apps/web/src/pages/HomePage.tsx`) so they accurately reflect current capabilities. Keep the copy concise and consistent with implemented behavior.

## UI and Design System

- Follow `docs/DESIGN_SYSTEM.md` for all UI styling.
- When creating visualizations, mockups, or design previews for Hive, always use Hive's light Mantine theme: pale gray workspace (`gray.0`), white surfaces, Inter typography, Hive blue (`hiveSky`) primary actions, and the established semantic success/warning/error colors. Do not follow the host's appearance setting or show dark-theme variants unless the user explicitly asks for them. Match Mantine's spacing, radii, typography, and component treatment as well as the application's current design principles.
- Reuse existing design tokens and components.
- Do not introduce new colors or inconsistent styles without approval.
- Check existing UI patterns before creating new components.
- Do not change the workflow editor's visual styling—including canvas colors, node surfaces, controls, minimap, typography, spacing, or interaction states—unless the user explicitly requests an editor styling change. For non-visual feature work, preserve its existing appearance.

## Decisions

- Treat accepted architectural and business decisions as constraints.
- Record significant, lasting decisions in `docs/decisions/`.
- If a task conflicts with a documented decision, explain the conflict before proceeding.
- Do not silently reverse an established decision.

## Implementation and verification

- For complex or cross-cutting changes, propose a plan before implementation.
- Add or update tests for relevant behavior.
- Run the relevant tests, linting, and type checks when available.
- Report checks that were not run or that failed.
- Do not claim success without verification.

## Session continuity

- Update `docs/working/CURRENT.local.md` at the end of a meaningful work session. Never commit local work notes, machine-specific details, credentials, or environment snapshots.
- Record durable decisions in their proper documentation under `docs/decisions/`, not only in the session notes.
- Keep the current-work notes concise, factual, and actionable.
- Never overwrite unrelated user changes.
- Review and commit documentation alongside the code when appropriate.

## Completion summary

When finishing a task, report:
1. What changed and why.
2. Important files affected.
3. Tests and checks performed, including failures.
4. Decisions made or documentation updated.
5. Remaining issues and the next useful step.

## Commit message suggestions

- After a task leaves unstaged changes, include a concise, suitable commit message in the completion response. For broad changes, use a short subject and an optional body that summarizes the main related work.
- Do not stage or commit changes unless the user explicitly asks.
