# Fix and verify workflows

## `security-fix`

Before changing files, ask the user to choose exactly one:

1. Fix selected findings only.
2. Attempt all open findings in the chosen audit report.
3. Produce a remediation plan without editing.

For options 1 and 2, identify the audit report and scope; ask for any missing selection. Compare its commit with the current checkout and re-evaluate affected findings if the code has changed. Make focused changes, preserve unrelated work, and run only relevant safe checks. Do not claim a finding is fixed merely because code changed. Mark changes that lack a successful verification as **change made, verification pending**. Summarize verified fixes, pending changes, and unresolved findings with reasons. Do not create or overwrite audit snapshots.

## `security-verify`

By default, verify findings marked **change made, verification pending** from the specified audit/fix scope; ask which report if ambiguous. If the user asks to verify named ASVS requirements or Level 2 conformance, assess that explicit requirement scope too. Compare prior report commits with the current checkout and inspect relevant changes. Run relevant safe tests or checks when available.

For each finding or requirement, record the check and evidence, then classify it as **verified/pass**, **still open/fail**, or **verification pending**. A code inspection alone must not stand in for required runtime or deployment evidence. Save a separate dated report under `docs/security/verifications/` using `templates/verification-report.md`; create the directory if needed, link to the original audit, and do not rewrite its snapshot. Update verification outcomes in `docs/security/current-inspection.md` when ASVS requirements were in scope.
