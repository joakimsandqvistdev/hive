# Hive security audit — {YYYY-MM-DD}

- ASVS inventory: 5.0.0 (`docs/security/asvs-v5.0.0-requirements.csv`)
- Commit: `{commit}`
- Scope: {scope}
- Method: repository review and checks listed below
- Limitations: {runtime/deployment/provider evidence unavailable, if any}

## Summary

| Measure | Count |
|---|---:|
| Unique findings | {count} |
| Critical / High / Medium / Low / Informational | {counts} |
| Verified fixes in this review | {count} |
| Change made, verification pending | {count} |

## Findings

### {FINDING-ID} — {short title}

- Severity and rationale: {level and impact/precondition basis}
- CVSS: {omit unless confirmed; if scored, include version, score, and full vector}
- Confidence: {high/medium/low}
- Status: {open/change made, verification pending/verified/still open}
- Location: `{path}:{line}` or named runtime/configuration surface
- Evidence: {concise, redacted evidence}
- Impact and preconditions: {description}
- Remediation: {direction}
- Resolution target: {Hive target and due date, when the gap is confirmed}
- ASVS: [`v5.0.0-{requirement-id}`]({official chapter URL}) — {short requirement text}

## ASVS coverage snapshot

Report numerator/denominator and percentage for catalog evidence coverage, all-level Hive applicability coverage, applicable L1+L2 implementation coverage, and applicable L1+L2 verification-pass coverage. The Hive L1+L2 implementation-coverage target is 100% of applicable requirements; justified not-applicable requirements are excluded and not credited as covered. The ASVS L2 conformance threshold is 100% verification-pass coverage of those applicable requirements. Explain that OWASP's approximate 70% refers to L1+L2's share of the full catalog, not a completion threshold. Show status counts and the separate L1+L2 conformance result. Link the current needs-information and not-applicable registers.

For a full audit, include a disposition row for every applicable L1+L2 requirement (expected baseline: 188; recalculate from current inventory and N/A register). For a targeted audit, include every requested requirement. Use only `no issue identified`, `finding(s)`, `blocked: needs information`, or `not assessed` as audit dispositions. For every row, describe the requirement-specific evidence examined and review/check performed; do not reuse a generic chapter-level evidence pointer. State the exact counts in each disposition and reconcile them to the audit scope.

Explain prominently that `no issue identified` means no actionable vulnerability emerged from the documented review; it is not a test result, a verification pass, or evidence that the requirement is covered. Give counts by check type (static review, test review, tests run, configuration review, runtime checks, or other types) and separately identify requirements not individually reviewed. Use `not assessed` when no requirement-specific review was completed. Never let summary counts imply checks were run when they were not.

| ASVS requirement | Audit disposition | Requirement-specific review and evidence | Check type / result |
|---|---|---|
| `v5.0.0-{id}` | {disposition} | {what evidence was examined and what review was performed; or reason blocked/not assessed} | {static review, test review/run, configuration review, runtime check, or N/A} |

## Checks performed

- {command/check, result, and scope}

## Checks not performed / limitations

- {what could not be verified and what evidence would close the gap}
