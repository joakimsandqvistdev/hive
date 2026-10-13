import { and, count, desc, eq } from "drizzle-orm";
import { Router } from "express";
import { db, pool } from "./db.js";
import { artifacts, runNodes, runs } from "./schema.js";
import { workflowExecutionOrder } from "./workflowExecutionOrder.js";

const router = Router();

router.post("/:id/cancel", async (req, res, next) => {
  const ownerId = res.locals.userId as string;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<{ status: string }>(
      "SELECT status FROM runs WHERE id=$1 AND user_id=$2 FOR UPDATE", [req.params.id, ownerId],
    );
    const status = selected.rows[0]?.status;
    if (!status) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "run_not_found" });
      return;
    }
    if (status === "queued") {
      await client.query("UPDATE runs SET status='cancelled',cancel_requested_at=now(),finished_at=now(),error_summary='Run stopped by user.' WHERE id=$1", [req.params.id]);
      await client.query("UPDATE run_nodes SET status='cancelled',error_code='run_cancelled',error_summary='Step cancelled because the run was stopped.',finished_at=now() WHERE run_id=$1 AND status='queued'", [req.params.id]);
    } else if (status === "running") {
      await client.query("UPDATE runs SET status='cancel_requested',cancel_requested_at=now() WHERE id=$1", [req.params.id]);
    }
    await client.query("COMMIT");
    res.json({ status: status === "queued" ? "cancelled" : status === "running" ? "cancel_requested" : status });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally { client.release(); }
});

function parsePagination(req: import("express").Request) {
  const page = Math.min(1_000_000, Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1));
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(String(req.query.pageSize ?? "10"), 10) || 10));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

router.get("/", async (req, res, next) => {
  const ownerId = res.locals.userId as string;
  const { page, pageSize, offset } = parsePagination(req);
  try {
    const [items, totals] = await Promise.all([
      db.select().from(runs).where(eq(runs.userId, ownerId))
        .orderBy(desc(runs.createdAt), desc(runs.id)).limit(pageSize).offset(offset),
      db.select({ total: count() }).from(runs).where(eq(runs.userId, ownerId)),
    ]);
    const total = totals[0]?.total ?? 0;
    res.json({ items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const [run] = await db.select().from(runs)
      .where(and(eq(runs.id, req.params.id), eq(runs.userId, res.locals.userId as string))).limit(1);
    if (!run) { res.status(404).json({ error: "run_not_found" }); return; }
    const snapshot = run.workflowSnapshotJson as unknown as {
      nodes?: Array<{ id: string }>;
      edges?: Array<{ source: string; target: string }>;
    };
    const executionOrder = workflowExecutionOrder(snapshot.nodes ?? [], snapshot.edges ?? []);
    const executionRank = new Map(executionOrder.map((node, index) => [node.id, index]));
    const rank = (nodeId: string) => executionRank.get(nodeId) ?? Number.MAX_SAFE_INTEGER;
    const nodes = (await db.select().from(runNodes).where(and(eq(runNodes.runId, run.id), eq(runNodes.userId, run.userId))))
      .sort((left, right) => rank(left.nodeId) - rank(right.nodeId));
    const outputs = (await db.select().from(artifacts).where(and(eq(artifacts.runId, run.id), eq(artifacts.userId, run.userId))))
      .sort((left, right) => rank(left.runNodeId) - rank(right.runNodeId));
    res.json({ run, nodes, artifacts: outputs });
  } catch (error) { next(error); }
});

export { router as runsRouter };
