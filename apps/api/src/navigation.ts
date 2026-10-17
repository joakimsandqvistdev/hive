import { and, count, eq, inArray, or, sql } from "drizzle-orm";
import { Router } from "express";
import { db } from "./db.js";
import { instagramPublications, runDeletions, runs, users, workflowJobs, workflows } from "./schema.js";

const router = Router();

router.get("/summary", async (_req, res, next) => {
  const ownerId = res.locals.userId as string;
  try {
    await db.execute(sql`UPDATE ${users} SET runner_status='paused' WHERE id=${ownerId} AND runner_status='pausing'
      AND NOT EXISTS (SELECT 1 FROM ${runs} WHERE user_id=${ownerId} AND claimed_by IS NOT NULL AND lease_expires_at>now())`);
    const [workflowsNeedingAttention, customNodesNeedingAttention, jobsNeedingAttention, runsNeedingAttention, succeededRuns, awaitingPublishRuns, runner, activeRuns] = await Promise.all([
      db.select({ total: count() }).from(workflows).where(and(eq(workflows.userId, ownerId), eq(workflows.isCustomNode, false), eq(workflows.needsAttention, true), sql`${workflows.archivedAt} is null`)),
      db.select({ total: count() }).from(workflows).where(and(eq(workflows.userId, ownerId), eq(workflows.isCustomNode, true), eq(workflows.needsAttention, true), sql`${workflows.archivedAt} is null`)),
      db.select({ total: count() }).from(workflowJobs).where(and(eq(workflowJobs.userId, ownerId), eq(workflowJobs.status, "failed"))),
      db.select({ total: count() }).from(runs).where(and(
        eq(runs.userId, ownerId),
        or(
          eq(runs.status, "failed"),
          sql`exists (select 1 from ${runDeletions} where ${runDeletions.runId} = ${runs.id} and ${runDeletions.userId} = ${ownerId} and ${runDeletions.lastError} is not null)`,
          sql`exists (select 1 from ${instagramPublications} where ${instagramPublications.runId} = ${runs.id} and ${instagramPublications.userId} = ${ownerId} and ${instagramPublications.status} = 'awaiting_review')`,
        ),
      )),
      db.select({ total: count() }).from(runs).where(and(eq(runs.userId, ownerId), eq(runs.status, "succeeded"))),
      db.select({ total: count() }).from(runs).where(and(eq(runs.userId, ownerId), eq(runs.status, "awaiting_publish"))),
      db.select({ status: users.runnerStatus }).from(users).where(eq(users.id, ownerId)).limit(1),
      db.select({ total: count() }).from(runs).where(and(eq(runs.userId, ownerId), inArray(runs.status, ["queued", "running", "cancel_requested"]))),
    ]);

    res.json({
      workflowsNeedAttention: (workflowsNeedingAttention[0]?.total ?? 0) > 0,
      customNodesNeedAttention: (customNodesNeedingAttention[0]?.total ?? 0) > 0,
      jobsNeedAttention: (jobsNeedingAttention[0]?.total ?? 0) > 0,
      runsNeedAttention: (runsNeedingAttention[0]?.total ?? 0) > 0,
      succeededRuns: succeededRuns[0]?.total ?? 0,
      awaitingPublishRuns: awaitingPublishRuns[0]?.total ?? 0,
      runnerStatus: runner[0]?.status ?? "active",
      hasActiveRuns: (activeRuns[0]?.total ?? 0) > 0,
    });
  } catch (error) { next(error); }
});

export { router as navigationRouter };
