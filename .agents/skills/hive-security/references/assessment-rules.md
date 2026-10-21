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
- Let `A12` be all L1+L2 requirements except justified not-applicable IDs. Applicable L1+L2 coverage = covered applicable L1+L2 requirements divided by `A12`. Hive's target is **100%**; justified not-applicable requirements are excluded from `A12` and are never counted as covered.
- Applicable L1+L2 verification-pass coverage = requirements in `A12` with verification outcome `pass` divided by `A12`. Report this separately from implementation coverage; a `covered` implementation status alone is not a verification pass. The verification-pass threshold for demonstrating ASVS L2 conformance is 100% of `A12`.
- OWASP's statement that L1+L2 make up around 70% of ASVS requirements describes their approximate share of the full catalog, not a permitted completion threshold. ASVS Level 2 requires all applicable L1+L2 requirements in the selected, traceable application scope; tailoring may exclude justified irrelevant requirements but does not turn them into passes. See the pinned [ASVS 5.0.0 level and tailoring guidance](https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x03-What-is-the-ASVS.md).
- Report partial, not-covered, needs-information, not-assessed, and not-applicable counts separately. Display numerator and denominator beside every percentage; if a denominator is zero, report `N/A`.
- State L1+L2 conformance as `demonstrated` only if every applicable L1/L2 requirement has verification outcome `pass` and none is pending, failed, partial, not covered, needs information, or not assessed. Otherwise say `not demonstrated` and list what remains. Do not describe a coverage percentage by itself as conformance.

## Security audit evidence and severity

Report only actionable, evidence-backed findings. Each finding includes:

- Stable ID within the report, severity (`critical`, `high`, `medium`, `low`, or `informational`) and a short impact/precondition rationale.
- Confidence (`high`, `medium`, `low`) distinct from severity.
- Affected file and line or runtime/configuration surface; concise redacted evidence.
- Impact, attacker prerequisites, remediation direction, and linked ASVS ID(s).
- Status: `open`, `change made, verification pending`, `verified`, `still open`, or `accepted risk` only when the user explicitly directs that disposition.

Do not invent a CVSS score. Use CVSS only for a confirmed vulnerability when the vector and assumptions are recorded. CVSS is maintained by FIRST, not OWASP; use the current official [FIRST CVSS specification](https://www.first.org/cvss/specification-document) and include score, version, and vector when scored. The current specification defines None 0.0, Low 0.1–3.9, Medium 4.0–6.9, High 7.0–8.9, and Critical 9.0–10.0. Keep CVSS severity separate from the provisional priority estimates used for ASVS gaps.

Count unique findings separately from linked ASVS requirements. Avoid duplicate findings for the same root cause; explain when one issue maps to multiple requirements.

### Full applicable L1+L2 audit scope

For a default full audit, derive the target set from the pinned CSV: minimum level `L` is 1 or 2 and the versioned requirement ID is absent from `docs/security/not-applicable.md`. Reconcile this set against the inspection matrix and register. Needs-information and not-assessed requirements remain in scope. The current baseline is 188 applicable L1+L2 requirements (253 catalog L1+L2 minus 65 evidence-backed N/A); recompute it from current files rather than assuming the count stays fixed.

For every target ID, record one audit disposition: `no issue identified`, `finding(s)`, `blocked: needs information`, or `not assessed` with a reason. A finding on one requirement does not end the review. Review all relevant code paths, tests, documentation, and deployment/configuration evidence for the requirement. If a full review cannot be completed, mark the specific IDs not assessed and state why; do not report the audit as complete. An audit disposition of `no issue identified` is not an ASVS verification pass and is not conformance evidence.

Do not copy an inspection status or its evidence pointer into an audit disposition without performing a requirement-specific review. For each requirement, identify the evidence examined and the actual review/check performed (such as static code review, test review, a test run, configuration review, or runtime check). `no issue identified` means only that this documented review did not identify an actionable vulnerability within the stated scope. It does not mean the requirement was independently tested, that its control is covered, or that it passed verification. Report check types and counts separately. Use `not assessed` when no requirement-specific review was completed; use `blocked: needs information` when the review depends on evidence that is unavailable. Do not imply tests were run when only source or documentation was reviewed.

### Provisional priority and Hive target resolution times

The uncovered-requirements register may assign a provisional risk priority to an ASVS gap before a vulnerability is confirmed. Base the estimate on plausible impact, exposure, and prerequisites in Hive's context; write a short rationale. Do not attach a CVSS score to a requirement gap. `Critical`, `High`, `Medium`, and `Low` are triage estimates, not vulnerability ratings; revise them after an audit finds or rules out a concrete weakness. If evidence is insufficient to estimate impact, use `needs-information` in its separate group rather than guessing.

As a starting rubric: estimate Critical only where the available evidence supports broad, severe compromise with a credible attack path; estimate High for a gap in a direct security boundary with plausible significant data, account, or availability impact; estimate Medium for narrower impact, meaningful prerequisites, or supporting controls; estimate Low for limited-impact hardening or documentation gaps. This is an initial Hive-specific triage estimate and must not be presented as a CVSS category.

Use these as Hive's proposed resolution targets, measured from confirmation of the gap: Critical — mitigate immediately and resolve within 24 hours; High — 7 calendar days; Medium — 30 calendar days; Low — 90 calendar days. These are project targets, not OWASP-mandated deadlines. OWASP's [Vulnerability Management Guide](https://owasp.org/projects/vulnerability-management-guide?tab=main) describes vulnerability management practices, and OWASP [DSOMM's high/critical treatment activity](https://dsomm.owasp.org/activity-description?uuid=44f2c8a9-4aaa-4c72-942d-63f78b89f385) says high and critical security problems should be fixed before release or production. These sources do not establish a universal severity-to-days SLA. Record a target date only when the gap is confirmed and use the finding's confirmation date as day zero. Review these official sources when refreshing the guidance.

An audit is a repository review unless runtime checks are explicitly performed and documented. Record checks that were not possible. A lack of findings is not proof of security or conformance.

## Record maintenance and reports

- Keep `docs/security/current-inspection.md` as the complete current requirement matrix, and the needs-information/not-applicable files as focused registers derived from it. Preserve notes; resolve an entry only when new evidence supports the change, retaining a short resolution note/date.
- Audit and verification files are dated snapshots. Never rewrite an older report to make it appear that a later fix was present at audit time.
- Before writing a report, inspect git status and the target path. Do not overwrite an existing report; choose a unique timestamp suffix if needed.
- Leave all report files unstaged and uncommitted for user review. Keep reports free of secrets and unnecessary personal data.
