# Assessment rules

## Pinned standard and official links

Use `docs/security/asvs-v5.0.0-requirements.csv`, a copy of OWASP's stable ASVS 5.0.0 English CSV:

- Official download page: <https://asvs.owasp.org/downloads/>
- Pinned CSV source: <https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.csv>
- Official standard overview: <https://asvs.owasp.org/>

The pinned inventory contains 345 requirements: 70 at minimum Level 1, 183 at minimum Level 2, and 92 at minimum Level 3. The L1+L2 baseline is 253 requirements (`L` is the minimum level; include rows where `L` is 1 or 2). Confirm these counts with `../scripts/validate_asvs_inventory.py` before using them. OWASP describes the overall catalog and L2 share as approximate; do not hard-code “350.”

The pinned CSV SHA-256 is `98c8fe911b9edb403af8ee05d3ce8201ecac2659e313b053890a62847cdcf680`.

In findings, prefix IDs with `v5.0.0-`, for example `v5.0.0-V1.2.5`. Use `references/asvs-chapter-links.md` to link the official v5.0.0 chapter document containing that ID. Do not guess a URL fragment. If a stable requirement-level fragment is not confirmed, link the chapter page and display the exact requirement ID and text.

## Requirement statuses and evidence

Use one status per requirement:

- `covered`: repository or supplied evidence supports the full requirement; cite file/line, test, configuration, or document.
- `partially covered`: evidence supports only part of the requirement; state the gap.
- `not covered`: reviewed evidence shows the control is absent or fails.
- `needs information`: applicability or behavior depends on unavailable runtime, deployment, provider, operational, or product facts. State the exact question/evidence needed.
- `not applicable`: supported by concrete scope evidence; explain why the feature/control is outside Hive's application boundary. Lack of evidence is not a reason.
- `not assessed`: assessment was not completed; do not silently treat as not applicable or covered.

Track implementation evidence and verification outcome separately. Verification outcome is `pass`, `fail`, `pending`, or `not attempted`. `covered` describes the available implementation evidence; only a requirement-level `pass` can support the L1+L2 conformance result. A requirement can be covered but still unverified.

For each covered/partial/not-covered assessment, record concise evidence and its type (`code`, `test`, `configuration`, `documentation`, or `runtime`). Track confidence as high/medium/low and explain low confidence. When the requirement needs an organization-level decision or policy, code alone cannot establish it.

## Metrics and conformance

Let `N=345`, `T=253` (L1+L2), and `C` be requirements marked `covered` with cited evidence. Let `A` be all requirements except those with a justified `not applicable` status. `needs information` and `not assessed` remain in `A` and do not enter `C`.

- Catalog evidence coverage = `C / N`.
- Hive applicability coverage (all levels) = `C / A`.
- L1+L2 progress = covered applicable L1/L2 requirements divided by applicable L1/L2 requirements. The 70% goal is a Hive progress target only.
- Report partial, not-covered, needs-information, not-assessed, and not-applicable counts separately. Display numerator and denominator beside every percentage; if a denominator is zero, report `N/A`.
- Do not call a 70% score “ASVS L2 pass” or “compliant.” State L1+L2 conformance as `demonstrated` only if every applicable L1/L2 requirement has verification outcome `pass` and none is pending, failed, partial, not covered, needs information, or not assessed. Otherwise say `not demonstrated` and list what remains.

## Security audit evidence and severity

Report only actionable, evidence-backed findings. Each finding includes:

- Stable ID within the report, severity (`critical`, `high`, `medium`, `low`, or `informational`) and a short impact/precondition rationale.
- Confidence (`high`, `medium`, `low`) distinct from severity.
- Affected file and line or runtime/configuration surface; concise redacted evidence.
- Impact, attacker prerequisites, remediation direction, and linked ASVS ID(s).
- Status: `open`, `change made, verification pending`, `verified`, `still open`, or `accepted risk` only when the user explicitly directs that disposition.

Do not invent a CVSS score. Use one only when the vector and assumptions are recorded and the user asks for it. Count unique findings separately from linked ASVS requirements. Avoid duplicate findings for the same root cause; explain when one issue maps to multiple requirements.

An audit is a repository review unless runtime checks are explicitly performed and documented. Record checks that were not possible. A lack of findings is not proof of security or conformance.

## Record maintenance and reports

- Keep `docs/security/current-inspection.md` as the complete current requirement matrix, and the needs-information/not-applicable files as focused registers derived from it. Preserve notes; resolve an entry only when new evidence supports the change, retaining a short resolution note/date.
- Audit and verification files are dated snapshots. Never rewrite an older report to make it appear that a later fix was present at audit time.
- Before writing a report, inspect git status and the target path. Do not overwrite an existing report; choose a unique timestamp suffix if needed.
- Leave all report files unstaged and uncommitted for user review. Keep reports free of secrets and unnecessary personal data.
