# Decision 0044: Full applicable ASVS audit and remediation workflow

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

Hive tracks implementation evidence and verification separately against the pinned OWASP ASVS 5.0.0 inventory. Targeted vulnerability audits alone do not establish whether all applicable Level 1 and Level 2 requirements were reviewed. Requirements needing deployment or operational information must remain visible without being treated as not applicable.

## Decision

- `security-audit` defaults to every ASVS minimum Level 1 and Level 2 requirement, excluding only exact IDs with evidence-backed exclusions in `docs/security/not-applicable.md`. Needs-information requirements remain in scope and receive a blocked or not-assessed disposition when evidence prevents review. Level 3 is outside this full-audit scope.
- A full audit records an explicit audit disposition for every in-scope requirement. A targeted audit may name requirement IDs, findings, or entries in the uncovered requirements register. An audit disposition of no issue identified does not count as verification or conformance evidence.
- `docs/security/uncovered-requirements.md` is refreshed by inspection from the matrix. It contains applicable partial, not-covered, and not-assessed L1/L2 requirements grouped by provisional priority, and needs-information requirements in a separate section. Evidence-backed N/A and L3 requirements are omitted.
- Provisional ASVS gap priority is distinct from CVSS. CVSS is used only for confirmed vulnerabilities, following FIRST's current specification. Keep official FIRST/OWASP guidance links and record when the guidance was reviewed.
- Hive's proposed remediation targets for confirmed gaps are Critical: mitigate immediately and resolve within 24 hours; High: 7 days; Medium: 30 days; Low: 90 days. These are Hive targets, not OWASP-mandated deadlines. OWASP DSOMM recommends fixing High and Critical findings before release or production but does not set those days-based targets.
- `security-fix` offers selected findings, all open findings in a chosen report, or a remediation plan without edits. `security-verify` records whether pending changes pass, fail, or remain blocked/pending.

## Consequences

- Full audit reports are larger because they enumerate all applicable L1/L2 requirement dispositions and reconcile them to the scope.
- Inspection, audit, fix, and verify reports must preserve the difference between implementation evidence, audit results, and verification outcomes.
- The current inspection matrix and not-applicable register remain the source of scope and applicability; the uncovered queue is a derived targeting aid.
