import { and, asc, eq, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { db } from "./db.js";
import { loadDataTypes, loadModelIoContracts } from "./modelContracts.js";
import { runs, workflowJobs } from "./schema.js";
import { createWorkflowRunInTransaction, workflowRunErrorMessage } from "./workflowRunService.js";

// A run awaiting Instagram review/publication has finished workflow execution.
// Keep its publication attached to the run, but allow the Job to advance.
const completedJobRunStatuses = ["succeeded", "failed", "cancelled", "awaiting_publish"] as const;

export async function processWorkflowJobTick(): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx.select({ job: workflowJobs, runStatus: runs.status, runFinishedAt: runs.finishedAt })
      .from(workflowJobs).leftJoin(runs, eq(runs.id, workflowJobs.currentRunId))
      .where(or(
        and(isNotNull(workflowJobs.currentRunId), or(isNull(runs.id), inArray(runs.status, completedJobRunStatuses))),
        and(eq(workflowJobs.status, "active"), isNotNull(workflowJobs.nextRunAt), lte(workflowJobs.nextRunAt, new Date())),
      )).orderBy(asc(workflowJobs.nextRunAt)).limit(1).for("update", { of: workflowJobs, skipLocked: true });
    if (!row) return;
    const { job, runFinishedAt } = row;

    let currentRunId = job.currentRunId;
    let completedRuns = job.completedRuns;
    let nextRunAt = job.nextRunAt;
    let status = job.status;
    if (currentRunId) {
      completedRuns += 1;
      currentRunId = null;
      const finishedAt = runFinishedAt ?? new Date();
      if (job.status === "removed") {
        nextRunAt = null;
      } else if (job.repeatCount !== null && completedRuns >= job.repeatCount) {
        status = "completed";
        nextRunAt = null;
      } else {
        nextRunAt = job.intervalSeconds === null ? null : new Date(finishedAt.getTime() + job.intervalSeconds * 1000);
        if (nextRunAt === null) status = "completed";
      }
      await tx.update(workflowJobs).set({ currentRunId, completedRuns, nextRunAt, status, lastError: null, updatedAt: new Date() }).where(eq(workflowJobs.id, job.id));
    }
    if (status !== "active" || currentRunId !== null || !nextRunAt || nextRunAt.getTime() > Date.now()) return;
    const [contracts, dataTypes] = await Promise.all([loadModelIoContracts(), loadDataTypes()]);
    const created = await createWorkflowRunInTransaction(tx, job.workflowId, job.userId, contracts, dataTypes, { id: job.id, scheduledFor: nextRunAt });
    if (!created.ok) {
      await tx.update(workflowJobs).set({ status: "failed", nextRunAt: null, lastError: workflowRunErrorMessage(created.error), updatedAt: new Date() }).where(eq(workflowJobs.id, job.id));
      return;
    }
    await tx.update(workflowJobs).set({ currentRunId: created.run.id, nextRunAt: null, lastError: null, updatedAt: new Date() }).where(eq(workflowJobs.id, job.id));
  });
}
