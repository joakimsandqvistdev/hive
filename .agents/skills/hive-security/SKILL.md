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
- Do not stage or commit. Do not deploy, change production, run destructive operations, or access deployed applications, cloud consoles, identity-provider consoles, or other operational external services as part of these workflows. Public OWASP/FIRST standards pages may be consulted to keep severity guidance current.

## Modes

### `security-inspect`

Assess every requirement in the pinned inventory against repository evidence and user-provided context. Read `references/assessment-rules.md` for statuses and calculations. Report:

- Total inventory count and counts by ASVS minimum level.
- Catalog evidence coverage (`covered / all catalog requirements`).
- Hive applicability coverage (`covered / applicable requirements`) for all levels.
- L1+L2 progress toward Hive's 70% tracking target, separately from the formal conformance result.
- Applicable L1/L2 requirements satisfied, partial, not covered, or needing information; do not label 70% progress as ASVS L2 conformance.
- Evidence limitations and current audit/verification report links when available.

Update `docs/security/current-inspection.md`, `docs/security/needs-information.md`, `docs/security/not-applicable.md`, and `docs/security/uncovered-requirements.md`. The current inspection matrix is the source for per-requirement statuses and reproducible metrics; the registers and uncovered list are derived from it. The uncovered list includes applicable L1/L2 partial, not-covered, and not-assessed requirements, plus a separate needs-information section. Exclude L3 and only evidence-backed not-applicable IDs. Group items by a provisional risk priority using the rubric in `references/assessment-rules.md`; do not present estimates as CVSS scores. Recheck the linked FIRST CVSS specification and OWASP Vulnerability Management Guide/DSOMM guidance when refreshing this security-priority guidance, and record the source-review date. Keep the project resolution targets labeled as Hive targets unless an accepted user decision changes them. Preserve useful annotations and history, close records only with evidence, and include a reason and requirement ID for every entry. Do not classify a requirement as not applicable merely because evidence is unavailable. Do not edit application code in this mode.

### `security-audit`

Review the repository for concrete vulnerabilities. The default scope is **every applicable Level 1 and Level 2 requirement** in the pinned inventory: include requirements marked needs-information or not-assessed, and exclude only exact IDs in `docs/security/not-applicable.md`. Never include Level 3. Do not narrow the full audit to uncovered requirements or stop after finding an issue. Inspect all relevant code, tests, documentation, and deployment configuration, and record an explicit audit disposition for every in-scope requirement. Use a targeted audit only when the user names one or more requirement IDs, finding IDs, or entries from `docs/security/uncovered-requirements.md`; in that case inspect all relevant paths and controls for each requested item.

Do not use the inspection matrix or a generic chapter-level source scan as a substitute for an audit check. For each requirement, record the requirement-specific evidence examined and what review or check was performed, including its type (for example, static code review, test review, test execution, configuration review, or runtime check). `no issue identified` means only that the documented review found no actionable vulnerability within its stated scope; it is not a test result, verification pass, or proof that the requirement is covered. If no requirement-specific review was completed, use `not assessed` and explain why. If relevant review is blocked by unavailable evidence, use `blocked: needs information`. Summarize how many requirements received each check type so readers can tell a reviewed disposition from a test or runtime result.

Read `references/assessment-rules.md` for evidence/report rules and `references/asvs-chapter-links.md` for exact official links. Use `templates/audit-report.md`. Link each identified finding to its ASVS requirement(s), and update the uncovered register after the audit so it points to current findings and dispositions without erasing inspection evidence. Add confirmed findings for requirements previously marked covered to the queue; assign a provisional priority and preserve the inspection status separately from the audit result.

Save a dated Markdown snapshot under `docs/security/audits/`; create the directory if needed. Include scope, commit, ASVS version, method, limitations, severity counts, unique findings, and ASVS requirement coverage. Do not treat an untested hypothesis as a confirmed vulnerability. Do not modify source files in audit mode.

### `security-fix`

Follow the `security-fix` section in [references/remediation.md](references/remediation.md). Always present the three choices and wait for selection before editing.

### `security-verify`

Follow the `security-verify` section in [references/remediation.md](references/remediation.md). Use it for pending fixes or an explicitly requested requirement/conformance verification. Do not change application code in this mode.

