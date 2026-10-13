# 0014 — Remove the legacy tasks table

Date: 2026-10-14

## Decision

Remove the unused `tasks` table from the current Drizzle schema and drop it from existing databases through a forward migration. The table is not used by application code; the inspected local database contained zero rows.

## Rationale

The table was created by the initial authentication migration as a placeholder and has no role in the current agent, workflow, or run data model. Keeping an unused table creates confusion about the supported data model.

## Consequences

- New databases still apply the historical initial migration, followed by migration `0013_free_charles_xavier`, which removes the placeholder table.
- Existing databases remove the table when the migration is applied. No data was present in the inspected local table.
- The migration uses a strict `DROP TABLE` so unexpected dependent objects cause an error instead of being removed with `CASCADE`.
