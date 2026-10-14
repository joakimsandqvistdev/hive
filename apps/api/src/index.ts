import cors from "cors";
import express from "express";
import { db, pool } from "./db.js";
import { authRouter, requireAuthenticatedUser } from "./auth.js";
import { workflowsRouter } from "./workflows.js";
import { runsRouter } from "./runs.js";
import { artifactsRouter } from "./artifacts.js";
import { modelsRouter } from "./models.js";

const app = express();
const port = Number(process.env.API_PORT ?? 3001);

app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use("/api/auth", authRouter);
app.use("/api/workflows", requireAuthenticatedUser, workflowsRouter);
app.use("/api/runs", requireAuthenticatedUser, runsRouter);
app.use("/api/artifacts", requireAuthenticatedUser, artifactsRouter);
app.use("/api/models", requireAuthenticatedUser, modelsRouter);

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "error", database: "disconnected" });
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 500;
  if (status === 413) { res.status(413).json({ error: "request_too_large" }); return; }
  if (status === 400) { res.status(400).json({ error: "invalid_request" }); return; }
  // Never return database queries, submitted text, or exception messages to clients.
  console.error("API request failed", error instanceof Error ? error.name : "UnknownError");
  res.status(500).json({ error: "internal_error" });
});

app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
