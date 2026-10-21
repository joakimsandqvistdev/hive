# Hive agent guide

## Source of truth

- Follow the code for behavior that exists today; follow product, architecture, business-rule, and accepted decision docs for intended behavior.
- If sources conflict, preserve security and data integrity, identify the conflict, and resolve it against the relevant accepted decision before implementing.
- Treat `FEATURE_QUEUE.md` and `FEATURE_SUGGESTIONS.md` as proposals, not approved requirements. Treat `docs/working/CURRENT.local.md` as private, temporary session context, not a durable decision.

## Find the relevant guidance

- Start with `docs/README.md` for the documentation map and authority order.
- For UI, read `docs/DESIGN_SYSTEM.md`; for domain changes, read relevant sections of `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, and linked records in `docs/decisions/`.
- When continuing local work or relying on recent progress, check `docs/working/CURRENT.local.md`. Do not assume prior chat context.
- Inspect the relevant implementation, tests, and established patterns before editing. Separate confirmed requirements from assumptions.

## Engineering and safety

- For security-sensitive design and code changes, follow the repository security policy in [`SECURITY.md`](SECURITY.md).
- Preserve architecture, API contracts, authentication, authorization, tenant boundaries, and data integrity unless a change is explicitly intended.
- Prefer small focused changes; reuse components, services, utilities, and dependency APIs. Avoid new dependencies without a clear need. When a reusable dependency improvement is appropriate, describe its upstream benefit.
- Do not expose secrets, bypass security controls, or perform destructive database or production operations without explicit approval.
- Keep credentials, personal filesystem paths, local database contents, and machine-specific operational details out of tracked files. Use fake example values and review artifacts for private data.
- Add raster assets only when required; prefer existing assets or code-based graphics where suitable.

## Product and UI requirements

- For a new feature or substantial feature change, update `README.md` and `apps/web/src/pages/HomePage.tsx` with concise, accurate, consistent capability descriptions.
- Follow `docs/DESIGN_SYSTEM.md`; reuse tokens and components. Do not invent colors or styles.

## Decisions and delivery

- Treat accepted records in `docs/decisions/` as constraints. Explain conflicts before proceeding; never silently reverse a decision. Record significant lasting decisions there.
- For complex or cross-cutting changes, present a plan before implementation. Add or update relevant tests and run relevant tests, lint, and type checks when available. Report what ran, failed, or was skipped; do not claim unverified success.
- Never overwrite unrelated user changes. Do not stage or commit unless asked.
- At the end of meaningful work, keep `docs/working/CURRENT.local.md` concise and actionable. It is git-ignored; never commit it. Put durable decisions in tracked documentation.
- Completion summary: describe what/why, key files, checks and results, documentation/decisions, and remaining work. If changes remain unstaged, suggest a commit message.
