# Decision 0033: User-scoped runner pause and active-page polling

The workflow worker consumes a shared queue, while users need independent control over whether their queued work starts. Several pages also had manual refresh controls or no way to see asynchronous updates.

## Decision

- Store `active`, `pausing`, or `paused` on each user. Workers may claim runs only for active users; a pause waits for that user's currently leased runs to finish. Resume makes queued work eligible again.
- Keep the workflow queue control scoped to the authenticated user. It does not stop other users' work, Instagram publication, model downloads, or cleanup tasks.
- Poll data for mounted, visible pages. Use faster intervals for active work and slower intervals for idle status refreshes; Webhook Manager refreshes its trigger and selected delivery state while open.
- Refresh navigation run counts when the client starts or changes relevant work. Poll the summary only while the user's workflow queue has active work and the runner is not paused.

## Consequences

The user table needs an additive migration. Queue claim queries coordinate on the user row so a committed pause prevents subsequent claims for that user while allowing other users' runs to proceed. A user pause can leave queued jobs waiting until resumed; job scheduling remains independent and only keeps its existing one-run-at-a-time behavior.
