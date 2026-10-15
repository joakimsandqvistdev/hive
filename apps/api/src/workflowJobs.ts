import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { Router } from "express";
import { db } from "./db.js";
import { runs, runNodes, workflowJobs, workflows } from "./schema.js";

const router = Router();
const createJobSchema = z.object({
  name: z.string().trim().min(1).max(100),
  workflowId: z.string().uuid(),
  firstRunAt: z.string().datetime({ offset: true }),
  repeatCount: z.number().int().min(1).max(10000).nullable(),
  intervalSeconds: z.number().int().min(60).max(31_536_000).nullable(),
}).strict().superRefine((job, context) => {
  if (job.repeatCount === 1 && job.intervalSeconds !== null) context.addIssue({ code: "custom", path: ["intervalSeconds"], message: "One-time jobs do not have an interval." });
  if ((job.repeatCount === null || job.repeatCount > 1) && job.intervalSeconds === null) context.addIssue({ code: "custom", path: ["intervalSeconds"], message: "Repeating jobs require an interval." });
});
const stateSchema = z.object({ status: z.enum(["active", "paused"]) }).strict();
const deleteSchema = z.object({ cancelQueuedRun: z.boolean().default(true) }).strict();
const ownerId = (res: import("express").Response) => res.locals.userId as string;
const validOrigin = (req: import("express").Request) => req.get("origin") === (process.env.WEB_ORIGIN ?? "http://localhost:5173");

router.get("/", async (_req, res, next) => {
  try {
    const rows = await db.select({ job: workflowJobs, workflowName: workflows.name, currentRunStatus: runs.status })
      .from(workflowJobs).innerJoin(workflows, eq(workflows.id, workflowJobs.workflowId))
      .leftJoin(runs, eq(runs.id, workflowJobs.currentRunId))
      .where(and(eq(workflowJobs.userId, ownerId(res)), ne(workflowJobs.status, "removed"))).orderBy(asc(workflowJobs.createdAt));
    res.json({ jobs: rows.map(({ job, workflowName, currentRunStatus }) => ({ ...job, workflowName, currentRunStatus })) });
  } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
  if (!validOrigin(req)) { res.status(403).json({ error: "invalid_origin" }); return; }
  const parsed = createJobSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_job", details: parsed.error.flatten() }); return; }
  const owner = ownerId(res);
  try {
    const result = await db.transaction(async (tx) => {
      const [workflow] = await tx.select({ id: workflows.id }).from(workflows)
        .where(and(eq(workflows.id, parsed.data.workflowId), eq(workflows.userId, owner), isNull(workflows.archivedAt))).limit(1);
      if (!workflow) return null;
      const [job] = await tx.insert(workflowJobs).values({
        userId: owner, workflowId: workflow.id, name: parsed.data.name, status: "active",
        firstRunAt: new Date(parsed.data.firstRunAt), nextRunAt: new Date(parsed.data.firstRunAt),
        repeatCount: parsed.data.repeatCount, intervalSeconds: parsed.data.intervalSeconds,
      }).returning();
      return job;
    });
    if (!result) { res.status(404).json({ error: "workflow_not_found" }); return; }
    res.status(201).json({ job: result });
  } catch (error) { next(error); }
});

router.patch("/:id", async (req, res, next) => {
  if (!validOrigin(req)) { res.status(403).json({ error: "invalid_origin" }); return; }
  const parsed = stateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_job_state" }); return; }
  try {
    const result = await db.transaction(async (tx) => {
      const [job] = await tx.select().from(workflowJobs).where(and(eq(workflowJobs.id, req.params.id), eq(workflowJobs.userId, ownerId(res)))).limit(1).for("update");
      if (!job) return { kind: "not_found" as const };
      if (job.status === "completed" || job.status === "removed") return { kind: "completed" as const };
      const [updated] = await tx.update(workflowJobs).set({
        status: parsed.data.status,
        nextRunAt: parsed.data.status === "active" && job.currentRunId === null && job.nextRunAt === null ? new Date() : job.nextRunAt,
        lastError: parsed.data.status === "active" ? null : job.lastError,
        updatedAt: new Date(),
      }).where(eq(workflowJobs.id, job.id)).returning();
      return { kind: "updated" as const, job: updated };
    });
    if (result.kind === "not_found") { res.status(404).json({ error: "job_not_found" }); return; }
    if (result.kind === "completed") { res.status(409).json({ error: "job_completed" }); return; }
    res.json({ job: result.job });
  } catch (error) { next(error); }
});

router.delete("/:id", async (req, res, next) => {
  if (!validOrigin(req)) { res.status(403).json({ error: "invalid_origin" }); return; }
  const parsed = deleteSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "invalid_job_delete" }); return; }
  try {
    const result = await db.transaction(async (tx) => {
      const [job] = await tx.select().from(workflowJobs).where(and(eq(workflowJobs.id, req.params.id), eq(workflowJobs.userId, ownerId(res)))).limit(1).for("update");
      if (!job) return { kind: "not_found" as const };
      let cancelledQueuedRun = false;
      if (job.currentRunId && parsed.data.cancelQueuedRun) {
        const [run] = await tx.select({ id: runs.id, status: runs.status }).from(runs).where(eq(runs.id, job.currentRunId)).limit(1).for("update");
        if (run?.status === "queued") {
          await tx.update(runs).set({ status: "cancelled", cancelRequestedAt: new Date(), finishedAt: new Date(), errorSummary: "Job was removed before this run started." }).where(eq(runs.id, run.id));
          await tx.update(runNodes).set({ status: "cancelled", errorCode: "run_cancelled", errorSummary: "Job was removed before this run started.", finishedAt: new Date() }).where(and(eq(runNodes.runId, run.id), eq(runNodes.status, "queued")));
          cancelledQueuedRun = true;
        }
      }
      await tx.update(workflowJobs).set({ status: "removed", nextRunAt: null, updatedAt: new Date() }).where(eq(workflowJobs.id, job.id));
      return { kind: "deleted" as const, cancelledQueuedRun };
    });
    if (result.kind === "not_found") { res.status(404).json({ error: "job_not_found" }); return; }
    res.json({ status: "removed", cancelledQueuedRun: result.cancelledQueuedRun });
  } catch (error) { next(error); }
});

export { router as workflowJobsRouter };
