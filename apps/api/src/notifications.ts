import { and, count, desc, eq, isNull } from "drizzle-orm";
import { Router } from "express";
import { db } from "./db.js";
import { notifications } from "./schema.js";

const router = Router();
const userId = (res: import("express").Response) => res.locals.userId as string;

function validOrigin(req: import("express").Request, res: import("express").Response) {
  if (req.get("origin") === (process.env.WEB_ORIGIN ?? "http://localhost:5173")) return true;
  res.status(403).json({ error: "invalid_origin" });
  return false;
}

router.get("/", async (_req, res, next) => {
  try {
    const ownerId = userId(res);
    const unread = and(eq(notifications.userId, ownerId), isNull(notifications.readAt));
    const [items, totals] = await Promise.all([
      db.select().from(notifications).where(unread).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(100),
      db.select({ total: count() }).from(notifications).where(unread),
    ]);
    res.json({ items, unreadCount: totals[0]?.total ?? 0 });
  } catch (error) { next(error); }
});

router.post("/read-all", async (req, res, next) => {
  if (!validOrigin(req, res)) return;
  try {
    const updated = await db.update(notifications).set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId(res)), isNull(notifications.readAt))).returning({ id: notifications.id });
    res.json({ markedRead: updated.length });
  } catch (error) { next(error); }
});

router.post("/runs/:runId/read", async (req, res, next) => {
  if (!validOrigin(req, res)) return;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.runId)) {
    res.status(400).json({ error: "invalid_run_id" });
    return;
  }
  try {
    const updated = await db.update(notifications).set({ readAt: new Date() })
      .where(and(eq(notifications.runId, req.params.runId), eq(notifications.userId, userId(res)), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    res.json({ markedRead: updated.length });
  } catch (error) { next(error); }
});

router.post("/:id/read", async (req, res, next) => {
  if (!validOrigin(req, res)) return;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
    res.status(400).json({ error: "invalid_notification_id" });
    return;
  }
  try {
    const [notification] = await db.update(notifications).set({ readAt: new Date() })
      .where(and(eq(notifications.id, req.params.id), eq(notifications.userId, userId(res)), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    if (!notification) { res.status(404).json({ error: "notification_not_found" }); return; }
    res.json({ status: "read" });
  } catch (error) { next(error); }
});

export { router as notificationsRouter };
