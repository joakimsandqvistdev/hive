# Run completion notifications

Hive records per-user notifications when a run transitions to `failed`, `succeeded`, or `awaiting_publish`. A run can therefore produce an awaiting-publishing notification and a later success notification if its Instagram publication completes.

Notifications are durable and remain unread until the user marks them read. The header bell shows the unread count and offers **Mark as read**, **Go to run** (which also marks it read), and **Mark all as read**. Deleting the associated run removes its notifications through a foreign-key cascade. Notifications are created only for status transitions after this migration; historical runs are not backfilled.

The API owns notification reads and mutations, and a PostgreSQL trigger records status changes so worker and API run-completion paths behave consistently.
