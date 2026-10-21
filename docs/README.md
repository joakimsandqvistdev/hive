# Documentation guide

Use this page to find the smallest authoritative set of docs for a task. Read only the relevant sections and follow links to accepted decisions; the implementation remains the authority for current behavior.

## Authority and scope

1. **Current implementation** — what the application does today.
2. **Accepted decisions** in [`decisions/`](decisions/) — durable architecture and business constraints. A more recent accepted decision supersedes an older conflicting one.
3. **Domain docs** — current system behavior and contracts: [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`DATA_MODEL.md`](DATA_MODEL.md).
4. **Design guidance** — [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) governs UI presentation.
5. **Proposals** — [`../FEATURE_QUEUE.md`](../FEATURE_QUEUE.md) and [`../FEATURE_SUGGESTIONS.md`](../FEATURE_SUGGESTIONS.md) are unaccepted ideas unless separately approved.
6. **Local continuity notes** — [`working/CURRENT.local.md`](working/CURRENT.local.md) are git-ignored, temporary context. They are not a source of durable requirements.

When two authoritative sources conflict and no superseding decision is clear, stop before implementing the conflicting behavior and surface the discrepancy.

## Task-oriented entry points

| Task | Start here |
|---|---|
| Product behavior or feature scope | Relevant architecture/data-model sections and accepted decisions |
| Services, workers, API flow | `ARCHITECTURE.md`, then relevant code and decisions |
| Tables, ownership, retention | `DATA_MODEL.md`, then relevant migrations and decisions |
| UI or interaction changes | `DESIGN_SYSTEM.md`, then matching pages/components |
| Workflow orchestration | `ARCHITECTURE.md`, `DATA_MODEL.md`, and relevant workflow decisions |
| Security assessment | [`security/README.md`](security/README.md), then the pinned ASVS inventory and assessment records |
| Feature prioritization | `../FEATURE_QUEUE.md` (proposal only) |

## Decisions

Decision records live in `decisions/`, use zero-padded numeric prefixes, and state status, date, context, decision, and consequences. Check neighboring records for format. Add a record only for a significant, lasting choice; routine implementation details belong in code or the relevant domain doc.
