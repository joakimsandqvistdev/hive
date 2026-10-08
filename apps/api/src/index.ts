import cors from "cors";
import express from "express";
import { desc } from "drizzle-orm";
import { db, pool } from "./db.js";
import { tasks } from "./schema.js";

const app = express();
const port = Number(process.env.API_PORT ?? 3001);

app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "error", database: "disconnected" });
  }
});

app.get("/api/tasks", async (_req, res, next) => {
  try {
    res.json(await db.select().from(tasks).orderBy(desc(tasks.createdAt)));
  } catch (error) {
    next(error);
  }
});

app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
