# AGENTS.md

## Project context

This repository contains an existing web application with authentication, a database, APIs, and multiple features.

Treat the existing codebase as the source of truth for implemented behavior. Treat product and architecture documentation as the source of truth for intended behavior and agreed decisions.

## Image generation

- Generate or add image assets only when the user explicitly asks for image generation or image creation.
- Do not generate images merely because a visual asset could improve a design; use existing assets or code-based graphics unless the user explicitly requests a generated image.

## ionodes maintenance feedback

- When integrating `ionodes`, consider whether a limitation is better fixed in the library than worked around in Hive.
- If a library-level change would make the integration simpler, more correct, or more reusable, tell the user what should change in `ionodes` and why.

## Before making changes

- Inspect the relevant implementation, tests, and existing patterns.
- Read the relevant documentation when a task touches its area.
- Check `docs/working/CURRENT.md` when resuming ongoing work or when the task depends on recent progress.
- Do not assume previous chat history is available.
- Distinguish confirmed requirements from assumptions.

## Engineering rules

- Preserve established architecture and API contracts unless a change is explicitly intended.
- Prefer small, focused changes over unrelated refactoring.
- Reuse existing components, services, and utilities.
- Do not introduce dependencies without a clear need.
- Preserve authentication, authorization, tenant boundaries, and data integrity.
- Never expose secrets or bypass security controls.
- Do not perform destructive database or production operations without explicit approval.

## UI and Design System

- Follow `docs/DESIGN_SYSTEM.md` for all UI styling.
- Reuse existing design tokens and components.
- Do not introduce new colors or inconsistent styles without approval.
- Check existing UI patterns before creating new components.

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

- Update `docs/working/CURRENT.md` at the end of a meaningful work session.
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
