# Hive security assessment

Use the repo-local `$hive-security` skill for security work against the pinned OWASP ASVS 5.0.0 inventory. It has four named workflows:

The workflow instructions are in [`.agents/skills/hive-security/SKILL.md`](../../.agents/skills/hive-security/SKILL.md).

| Mode | Use it for |
|---|---|
| `security-inspect` | Assess requirement coverage and update the current inspection matrix and two exclusion registers. |
| `security-audit` | Find and report evidence-backed vulnerabilities. Creates a dated report under `audits/`. |
| `security-fix` | Fix selected findings, attempt all open findings, or prepare a plan. The skill asks you to choose one before proceeding. |
| `security-verify` | Check changes marked “change made, verification pending.” Creates a dated report under `verifications/`. |

These are modes in one skill, not separate slash commands. Invoke `$hive-security` and name the mode. For example:

```text
$hive-security security-inspect

$hive-security security-audit

$hive-security security-fix

$hive-security security-verify — verify findings from docs/security/audits/{report}.md
```

For a scoped fix, specify finding IDs after choosing that option. For verification, name the audit report or finding IDs when more than one report is available.

## How to read the results

The inspection reports catalog evidence coverage, Hive applicability coverage, and applicable L1+L2 progress separately. The current per-requirement assessment is kept in `current-inspection.md`; `needs-information.md` and `not-applicable.md` are focused registers derived from that assessment. The 70% figure is a Hive tracking target, not an ASVS Level 2 pass. L1+L2 conformance is reported as demonstrated only when every applicable requirement has a verification pass. Runtime, deployment, identity-provider, and operator facts that cannot be established from the repo are recorded as needs information.

The pinned CSV contains 345 requirements: 70 L1, 183 L2, and 92 L3. Run `python .agents/skills/hive-security/scripts/validate_asvs_inventory.py` to check the inventory. The official source and assessment rules are linked from the skill references.

Audit and verification reports are dated snapshots. They are generated under this folder and left unstaged for review. Reports must not contain secret values or unnecessary personal data.
