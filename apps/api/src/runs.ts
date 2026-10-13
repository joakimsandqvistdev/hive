import { and, count, desc, eq } from "drizzle-orm";
import { Router } from "express";
import { db } from "./db.js";
import { artifacts, runNodes, runs } from "./schema.js";

const router = Router();

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
    const nodes = await db.select().from(runNodes).where(and(eq(runNodes.runId, run.id), eq(runNodes.userId, run.userId)));
    const outputs = await db.select().from(artifacts).where(and(eq(artifacts.runId, run.id), eq(artifacts.userId, run.userId)));
    res.json({ run, nodes, artifacts: outputs });
  } catch (error) { next(error); }
});

export { router as runsRouter };
