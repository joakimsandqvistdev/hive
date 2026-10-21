# Hive security assessment

Use the repo-local `$hive-security` skill for security work against the pinned OWASP ASVS 5.0.0 inventory. It has four named workflows:

The workflow instructions are in [`.agents/skills/hive-security/SKILL.md`](../../.agents/skills/hive-security/SKILL.md).

| Mode | Use it for |
|---|---|
| `security-inspect` | Assess requirement coverage and refresh the matrix, exclusion registers, and uncovered-requirements queue. |
| `security-audit` | By default, assess every applicable L1+L2 requirement and report an explicit disposition per requirement. Target one or more requirement IDs to narrow the audit. Creates a dated report under `audits/`. |
| `security-fix` | Fix selected findings, attempt all open findings, or prepare a plan. The skill asks you to choose one before proceeding and saves a dated fix record under `fixes/`. |
| `security-verify` | Check changes marked “change made, verification pending.” Creates a dated report under `verifications/`. |

These are modes in one skill, not separate slash commands. Invoke `$hive-security` and name the mode. For example:

```text
$hive-security security-inspect

$hive-security security-audit

$hive-security security-audit v5.0.0-V6.3.1

$hive-security security-fix

$hive-security security-verify — verify findings from docs/security/audits/{report}.md
```

For a scoped fix, specify finding IDs after choosing that option. For verification, name the audit report or finding IDs when more than one report is available.

## Recommended cycle

1. Run `security-inspect` to refresh requirement evidence and the targeting queue.
2. Run `security-audit` for the full applicable L1+L2 review, or name an ASVS ID to target one item.
3. Run `security-fix` and choose selected findings, all open findings in the report, or a remediation plan.
4. Run `security-verify` for findings marked “change made, verification pending.”
5. Run `security-inspect` again after meaningful fixes or scope changes to refresh requirement status and estimates.

The default full audit covers all L1+L2 inventory rows except exact evidence-backed IDs in `not-applicable.md`. Needs-information requirements remain in scope and are reported as blocked when their missing evidence prevents assessment. The uncovered queue in [`uncovered-requirements.md`](uncovered-requirements.md) is refreshed by `security-inspect`; target an item by its ASVS ID. Full-audit results identify each requirement as having no issue identified, linked to findings, blocked for information, or not assessed. “No issue identified” does not mean verified or conformant.

The existing dated audit reports predate the requirement-by-requirement disposition format. They are useful repository reviews and contain specific findings, but they do not establish that all 188 applicable L1+L2 requirements were individually audited. The first new default full audit should create that complete disposition table.

The uncovered queue groups partial, not-covered, and not-assessed applicable L1+L2 requirements by estimated priority, with needs-information requirements in their own section. These are estimates for triage, not CVSS scores. Confirmed vulnerabilities may receive CVSS scores using [FIRST's current specification](https://www.first.org/cvss/specification-document). Hive's proposed targets are 24 hours for Critical, 7 days for High, 30 days for Medium, and 90 days for Low. These time limits are Hive targets; [OWASP DSOMM](https://dsomm.owasp.org/activity-description?uuid=44f2c8a9-4aaa-4c72-942d-63f78b89f385) recommends fixing High and Critical findings before release or production but does not set a universal days-based SLA.

## How to read the results

The inspection reports catalog evidence coverage, all-level Hive applicability coverage, applicable L1+L2 implementation coverage, and applicable L1+L2 verification-pass coverage separately. Hive's L1+L2 implementation-coverage target is 100% of applicable requirements. Justified not-applicable requirements are excluded from that denominator and are never counted as covered. OWASP's statement that L1+L2 are around 70% of the full ASVS catalog describes catalog composition; it is not a 70% completion threshold. The current per-requirement assessment is kept in `current-inspection.md`; `needs-information.md` and `not-applicable.md` are focused registers derived from that assessment. L1+L2 conformance requires 100% verification-pass coverage of every applicable requirement. Runtime, deployment, identity-provider, and operator facts that cannot be established from the repo are recorded as needs information.

The pinned CSV contains 345 requirements: 70 L1, 183 L2, and 92 L3. Run `python .agents/skills/hive-security/scripts/validate_asvs_inventory.py` to check the inventory. The official source and assessment rules are linked from the skill references.

The full-audit and remediation workflow is recorded in [decision 0044](../decisions/0044-applicable-asvs-audit-and-remediation-workflow.md).

Audit and verification reports are dated snapshots. They are generated under this folder and left unstaged for review. Reports must not contain secret values or unnecessary personal data.
