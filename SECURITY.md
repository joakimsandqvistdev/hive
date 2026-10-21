# Hive security policy

Codex should use the OWASP Application Security Verification Standard (ASVS) 5.0.0 Level 2 baseline as a security target when designing, changing, and reviewing Hive. The pinned requirement inventory is [`docs/security/asvs-v5.0.0-requirements.csv`](docs/security/asvs-v5.0.0-requirements.csv). Treat its minimum Level 1 and Level 2 requirements as in scope unless an exact requirement ID is listed in [`docs/security/not-applicable.md`](docs/security/not-applicable.md).

## Applying the requirements

- Check relevant ASVS requirements when a change affects security controls, data handling, authentication, authorization, uploads, external integrations, deployment, or other security-sensitive behavior.
- Exclude a requirement only when its versioned ID appears in `docs/security/not-applicable.md`. Revisit that exclusion if product scope or implementation changes.
- A requirement listed in `docs/security/needs-information.md` is not excluded. Identify the missing evidence or decision and keep the requirement unresolved until it is available.
- Do not silently waive a requirement because it is inconvenient or because the current implementation does not meet it. Explain conflicts with accepted product or architecture decisions and record the remaining gap.
- Preserve existing security controls and tenant boundaries. Prefer focused changes that meet the applicable requirement and fit Hive's accepted architecture.
- Verify security-relevant behavior with appropriate code review, tests, and runtime or deployment evidence where available. Keep implementation evidence separate from verification results.
- Do not claim ASVS conformance from an attempted fix or a coverage percentage. Conformance requires verification passes for every applicable Level 1 and Level 2 requirement, as described in the security assessment records.

## Security workflow

Use the repo-local [`hive-security` skill](.agents/skills/hive-security/SKILL.md) for the `security-inspect`, `security-audit`, `security-fix`, and `security-verify` workflows. The current inspection matrix and exclusion registers are under `docs/security/`.

The default `security-audit` reviews every applicable ASVS 5.0.0 Level 1 and Level 2 requirement. It excludes only requirements with concrete evidence in `docs/security/not-applicable.md`; requirements needing information remain in scope and are reported as blocked when necessary. See [`docs/security/README.md`](docs/security/README.md) for targeted audits, the uncovered-requirements queue, and Hive's proposed resolution targets.
