import type { RequestHandler } from "express";

const MAX_ACTIVE_UPLOADS = 2;
const MAX_ACTIVE_UPLOADS_PER_USER = 1;

let activeUploads = 0;
const activeUploadsByUser = new Map<string, number>();

/** Admit bounded upload body parsing before Express buffers the request bytes. */
export const admitArtifactUpload: RequestHandler = (_req, res, next) => {
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

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeUploads -= 1;
    const remainingForUser = (activeUploadsByUser.get(userId) ?? 1) - 1;
    if (remainingForUser === 0) activeUploadsByUser.delete(userId);
    else activeUploadsByUser.set(userId, remainingForUser);
  };

  res.once("finish", release);
  res.once("close", () => {
    if (!_req.complete) release();
  });
  _req.once("aborted", release);
  next();
};
