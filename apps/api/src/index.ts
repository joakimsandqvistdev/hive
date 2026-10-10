import cors from "cors";
import express from "express";
import { db, pool } from "./db.js";
import { authRouter, requireAuthenticatedUser } from "./auth.js";
import { agentsRouter } from "./agents.js";

const app = express();
const port = Number(process.env.API_PORT ?? 3001);

app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use("/api/auth", authRouter);
app.use("/api/agents", requireAuthenticatedUser, agentsRouter);

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "error", database: "disconnected" });
  }
});

app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
