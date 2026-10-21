---
name: hive-security
description: Assess, audit, fix, or verify security controls in the Hive repository against OWASP ASVS 5.0.0 Level 2.
---

# Hive security workflows

Use this skill when the user asks for `security-inspect`, `security-audit`, `security-fix`, or `security-verify` in the Hive repository. Determine the requested mode and follow only that workflow. Read only the mode's supporting references.

## Shared rules

- Read the repository `AGENTS.md`, `docs/README.md`, and the relevant implementation and accepted decisions before assessing a requirement. Use `docs/ARCHITECTURE.md` and `docs/DATA_MODEL.md` as maps, then confirm behavior in code.
- Use the pinned inventory at `docs/security/asvs-v5.0.0-requirements.csv`. It is the OWASP English CSV for ASVS 5.0.0; do not substitute the latest branch or silently change versions. Keep version-prefixed IDs (`v5.0.0-V1.2.5`).
- Treat the project progress score as a tracking metric, not an ASVS conformance claim. Report conformance separately: it is demonstrated only when every in-scope L1/L2 requirement has a verification pass and none is unresolved or pending.
- Distinguish repository evidence from runtime/deployment evidence. Do not claim a pass based on an assumption, a file name, or the mere presence of a control. State evidence type and confidence.
- Inspect tracked and relevant non-ignored project source, tests, docs, and deployment configuration. Consult `docs/working/CURRENT.local.md` only when needed under the repository guidance; treat it as private context and never copy machine-specific details or secrets into reports. Do not read ignored `.env`, `.data`, dependency, or build output. Record unavailable runtime, cloud, identity-provider, or operator evidence as needs information.
- Never include secret values, tokens, private user data, or unnecessary exploit payloads in reports. Redact evidence and identify the affected file or setting without reproducing the secret.
- Do not stage or commit. Do not deploy, change production, run destructive operations, or access external services as part of these workflows.

## Modes

### `security-inspect`

Assess every requirement in the pinned inventory against repository evidence and user-provided context. Read `references/assessment-rules.md` for statuses and calculations. Report:

- Total inventory count and counts by ASVS minimum level.
- Catalog evidence coverage (`covered / all catalog requirements`).
- Hive applicability coverage (`covered / applicable requirements`) for all levels.
- L1+L2 progress toward Hive's 70% tracking target, separately from the formal conformance result.
- Applicable L1/L2 requirements satisfied, partial, not covered, or needing information; do not label 70% progress as ASVS L2 conformance.
- Evidence limitations and current audit/verification report links when available.

Update `docs/security/current-inspection.md`, `docs/security/needs-information.md`, and `docs/security/not-applicable.md`. The current inspection matrix is the source for per-requirement statuses and reproducible metrics; the two registers are focused lists derived from it. Preserve useful annotations and history, close records only with evidence, and include a reason and requirement ID for every entry. Do not classify a requirement as not applicable merely because evidence is unavailable. Do not edit application code in this mode.

### `security-audit`

Review the repository for concrete vulnerabilities in the requested scope (default: whole in-scope repository). Read `references/assessment-rules.md` for evidence/report rules and `references/asvs-chapter-links.md` for exact official links. Use `templates/audit-report.md`.

Save a dated Markdown snapshot under `docs/security/audits/`; create the directory if needed. Include scope, commit, ASVS version, method, limitations, severity counts, unique findings, and ASVS requirement coverage. Do not treat an untested hypothesis as a confirmed vulnerability. Do not modify source files in audit mode.

### `security-fix`

Follow the `security-fix` section in [references/remediation.md](references/remediation.md). Always present the three choices and wait for selection before editing.

### `security-verify`

Follow the `security-verify` section in [references/remediation.md](references/remediation.md). Use it for pending fixes or an explicitly requested requirement/conformance verification. Do not change application code in this mode.

