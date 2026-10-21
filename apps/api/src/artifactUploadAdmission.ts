import type { RequestHandler } from "express";
import type { PoolClient } from "pg";

const MAX_ACTIVE_UPLOADS = 2;
const MAX_ACTIVE_UPLOADS_PER_USER = 1;
const ADVISORY_LOCK_NAMESPACE = 73190422;

/** Creates an upload gate whose two slots are shared by every API process using the same database. */
export function createArtifactUploadAdmission(connect: () => Promise<PoolClient>): RequestHandler {
  let activeUploads = 0;
  const activeUploadsByUser = new Map<string, number>();

  return (req, res, next) => {
    const userId = res.locals.userId as string | undefined;
    if (!userId) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }

    const userActiveUploads = activeUploadsByUser.get(userId) ?? 0;
    if (activeUploads >= MAX_ACTIVE_UPLOADS || userActiveUploads >= MAX_ACTIVE_UPLOADS_PER_USER) {
      res.set("Retry-After", "1").status(429).json({ error: "upload_concurrency_limit" });
      return;
    }

    activeUploads += 1;
    activeUploadsByUser.set(userId, userActiveUploads + 1);

    let requestEnded = false;
    let localCapacityReleased = false;
    let client: PoolClient | undefined;
    let lockSlot: number | undefined;
    let lockReleaseStarted = false;

    const releaseLocalCapacity = () => {
      if (localCapacityReleased) return;
      localCapacityReleased = true;
      activeUploads -= 1;
      const remainingForUser = (activeUploadsByUser.get(userId) ?? 1) - 1;
      if (remainingForUser === 0) activeUploadsByUser.delete(userId);
      else activeUploadsByUser.set(userId, remainingForUser);
    };

    const releaseDatabaseLock = () => {
      if (!client || lockSlot === undefined || lockReleaseStarted) return;
      lockReleaseStarted = true;
      const heldClient = client;
      void heldClient.query("SELECT pg_advisory_unlock($1, $2)", [ADVISORY_LOCK_NAMESPACE, lockSlot])
        .then(() => heldClient.release())
        .catch((error: unknown) => heldClient.release(error instanceof Error ? error : new Error("Could not release artifact upload admission lock.")));
    };

    const onRequestEnd = () => {
      requestEnded = true;
      releaseLocalCapacity();
      releaseDatabaseLock();
    };

    // Listen before awaiting a database connection so a disconnected client cannot
    // leave a lock held after its request has already ended.
    res.once("finish", onRequestEnd);
    res.once("close", () => {
      if (!req.complete) onRequestEnd();
    });
    req.once("aborted", onRequestEnd);

    void (async () => {
      try {
        client = await connect();
        for (let slot = 0; slot < MAX_ACTIVE_UPLOADS; slot += 1) {
          const result = await client.query<{ locked: boolean }>(
            "SELECT pg_try_advisory_lock($1, $2) AS locked",
            [ADVISORY_LOCK_NAMESPACE, slot],
          );
          if (result.rows[0]?.locked) {
            lockSlot = slot;
            break;
          }
        }

        if (lockSlot === undefined) {
          client.release();
          client = undefined;
          releaseLocalCapacity();
          if (!requestEnded) res.set("Retry-After", "1").status(429).json({ error: "upload_concurrency_limit" });
          return;
        }

        if (requestEnded) {
          releaseDatabaseLock();
          return;
        }

        next();
      } catch (error) {
        if (client) {
          client.release(error instanceof Error ? error : new Error("Could not acquire artifact upload admission lock."));
          client = undefined;
        }
        releaseLocalCapacity();
        if (!requestEnded) next(error);
      }
    })();
  };
}

export const admitArtifactUpload = createArtifactUploadAdmission(async () => {
  const { pool } = await import("./db.js");
  return pool.connect();
});
