import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { Router } from "express";
import { db, pool } from "./db.js";
import { requireAuthenticatedUser } from "./auth.js";
import { artifacts, instagramAccounts, instagramOauthStates, instagramPublications, runs } from "./schema.js";
import { readArtifact } from "./artifactStore.js";

const router = Router();
const callbackUri = () => process.env.INSTAGRAM_REDIRECT_URI ?? "http://localhost:3001/api/instagram/oauth/callback";
const appId = () => process.env.INSTAGRAM_APP_ID;
const appSecret = () => process.env.INSTAGRAM_APP_SECRET;
const scopes = "instagram_business_basic,instagram_business_content_publish";
const graphApiVersion = () => process.env.INSTAGRAM_GRAPH_API_VERSION ?? "v22.0";
const key = () => {
  const decoded = Buffer.from(process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY ?? "", "base64");
  if (decoded.length !== 32) throw new Error("Instagram token encryption is not configured.");
  return decoded;
};
const encrypt = (value: string) => {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64url")).join(".");
};
export const decryptInstagramToken = (value: string) => {
  const [iv, tag, data] = value.split(".").map((part) => Buffer.from(part ?? "", "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv!); decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(data!), decipher.final()]).toString("utf8");
};
export async function usableInstagramToken(account: typeof instagramAccounts.$inferSelect): Promise<string> {
  let token = decryptInstagramToken(account.encryptedAccessToken);
  if (!account.tokenExpiresAt || account.tokenExpiresAt.getTime() > Date.now() + 7 * 24 * 60 * 60_000) return token;
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.search = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token }).toString();
  const response = await fetch(url);
  const body = await response.json() as { access_token?: string; expires_in?: number; error?: { message?: string } };
  if (!response.ok || !body.access_token) throw new Error(body.error?.message ?? "Instagram access token expired. Reconnect the account from Accounts.");
  token = body.access_token;
  await db.update(instagramAccounts).set({ encryptedAccessToken: encrypt(token), tokenExpiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000) : account.tokenExpiresAt, updatedAt: new Date() }).where(eq(instagramAccounts.id, account.id));
  return token;
}
export function instagramMediaUrl(artifactId: string) {
  const base = process.env.INSTAGRAM_PUBLIC_API_URL?.replace(/\/$/, "");
  if (!base || !base.startsWith("https://")) throw new Error("Set INSTAGRAM_PUBLIC_API_URL to an HTTPS URL reachable by Meta before publishing.");
  const expires = Math.floor(Date.now() / 1000) + 60 * 60;
  const payload = `${artifactId}.${expires}`;
  const signature = createHmac("sha256", key()).update(payload).digest("hex");
  return `${base}/api/instagram/media/${artifactId}?expires=${expires}&signature=${signature}`;
}
const ownerId = (res: import("express").Response) => res.locals.userId as string;
const validOrigin = (req: import("express").Request) => req.get("origin") === (process.env.WEB_ORIGIN ?? "http://localhost:5173");

router.get("/oauth/callback", async (req, res, next) => {
  const state = String(req.query.state ?? ""); const code = String(req.query.code ?? "");
  try {
    const [saved] = await db.delete(instagramOauthStates).where(and(eq(instagramOauthStates.stateHash, createHash("sha256").update(state).digest("hex")), gt(instagramOauthStates.expiresAt, new Date()))).returning();
    if (!saved || !code || !appId() || !appSecret()) { res.redirect(`${process.env.WEB_ORIGIN ?? "http://localhost:5173"}/#accounts?instagram=connect_failed`); return; }
    const form = new URLSearchParams({ client_id: appId()!, client_secret: appSecret()!, grant_type: "authorization_code", redirect_uri: callbackUri(), code });
    const tokenResponse = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form });
    const token = await tokenResponse.json() as { access_token?: string; user_id?: string | number };
    if (!tokenResponse.ok || !token.access_token || !token.user_id) throw new Error("Instagram token exchange failed.");
    const longLivedUrl = new URL("https://graph.instagram.com/access_token");
    longLivedUrl.search = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: appSecret()!, access_token: token.access_token }).toString();
    const longLivedResponse = await fetch(longLivedUrl);
    const longLived = await longLivedResponse.json() as { access_token?: string; expires_in?: number };
    if (!longLivedResponse.ok || !longLived.access_token) throw new Error("Instagram long-lived token exchange failed.");
    const profileResponse = await fetch(`https://graph.instagram.com/${graphApiVersion()}/me?fields=id,username&access_token=${encodeURIComponent(longLived.access_token)}`);
    const profile = await profileResponse.json() as { id?: string; username?: string };
    if (!profileResponse.ok || !profile.id || !profile.username) throw new Error("Instagram profile lookup failed.");
    await db.insert(instagramAccounts).values({ userId: saved.userId, instagramUserId: profile.id, username: profile.username, encryptedAccessToken: encrypt(longLived.access_token), tokenExpiresAt: longLived.expires_in ? new Date(Date.now() + longLived.expires_in * 1000) : null })
      .onConflictDoUpdate({ target: instagramAccounts.userId, set: { instagramUserId: profile.id, username: profile.username, encryptedAccessToken: encrypt(longLived.access_token), tokenExpiresAt: longLived.expires_in ? new Date(Date.now() + longLived.expires_in * 1000) : null, updatedAt: new Date() } });
    res.redirect(`${process.env.WEB_ORIGIN ?? "http://localhost:5173"}/#accounts?instagram=connected`);
  } catch (error) { next(error); }
});

router.get("/account", requireAuthenticatedUser, async (_req, res, next) => {
  try { const [account] = await db.select({ id: instagramAccounts.id, username: instagramAccounts.username, profileImageArtifactId: instagramAccounts.profileImageArtifactId, connectedAt: instagramAccounts.connectedAt }).from(instagramAccounts).where(eq(instagramAccounts.userId, ownerId(res))).limit(1); res.json({ account: account ?? null }); }
  catch (error) { next(error); }
});
router.get("/connect", requireAuthenticatedUser, async (_req, res, next) => {
  if (!appId() || !appSecret()) { res.status(503).json({ error: "instagram_not_configured" }); return; }
  try {
    const state = randomBytes(32).toString("base64url");
    await db.insert(instagramOauthStates).values({ stateHash: createHash("sha256").update(state).digest("hex"), userId: ownerId(res), expiresAt: new Date(Date.now() + 10 * 60_000) });
    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.search = new URLSearchParams({ client_id: appId()!, redirect_uri: callbackUri(), response_type: "code", scope: scopes, state, enable_fb_login: "0", force_authentication: "1" }).toString();
    res.json({ url: url.toString() });
  } catch (error) { next(error); }
});
router.patch("/account", requireAuthenticatedUser, async (req, res, next) => {
  if (!validOrigin(req)) { res.status(403).json({ error: "invalid_origin" }); return; }
  const profileImageArtifactId = typeof req.body?.profileImageArtifactId === "string" ? req.body.profileImageArtifactId : null;
  try {
    const updated = await db.transaction(async (tx) => {
      const [account] = await tx.select().from(instagramAccounts).where(eq(instagramAccounts.userId, ownerId(res))).limit(1).for("update");
      if (!account) return false;
      if (profileImageArtifactId) {
        const [asset] = await tx.select({ id: artifacts.id }).from(artifacts).where(and(eq(artifacts.id, profileImageArtifactId), eq(artifacts.userId, ownerId(res)), eq(artifacts.dataTypeId, "image"))).limit(1);
        if (!asset) return false;
      }
      await tx.update(instagramAccounts).set({ profileImageArtifactId, updatedAt: new Date() }).where(eq(instagramAccounts.id, account.id));
      return true;
    });
    if (!updated) { res.status(404).json({ error: "account_or_asset_not_found" }); return; }
    res.json({ status: "saved" });
  } catch (error) { next(error); }
});
router.delete("/account", requireAuthenticatedUser, async (req, res, next) => {
  if (!validOrigin(req)) { res.status(403).json({ error: "invalid_origin" }); return; }
  try {
    const [account] = await db.select({ id: instagramAccounts.id }).from(instagramAccounts).where(eq(instagramAccounts.userId, ownerId(res))).limit(1);
    if (account) {
      const [reference] = await db.select({ id: instagramPublications.id }).from(instagramPublications).where(eq(instagramPublications.accountId, account.id)).limit(1);
      if (reference) { res.status(409).json({ error: "account_has_publication_history" }); return; }
    }
    await db.delete(instagramAccounts).where(eq(instagramAccounts.userId, ownerId(res))); res.status(204).end();
  }
  catch (error) { next(error); }
});

router.get("/publications/:id", requireAuthenticatedUser, async (req, res, next) => {
  try { const id = String(req.params.id); const [publication] = await db.select().from(instagramPublications).where(and(eq(instagramPublications.id, id), eq(instagramPublications.userId, ownerId(res)))).limit(1); if (!publication) { res.status(404).json({ error: "publication_not_found" }); return; } res.json({ publication }); }
  catch (error) { next(error); }
});
router.patch("/publications/:id", requireAuthenticatedUser, async (req, res, next) => {
  if (!validOrigin(req)) { res.status(403).json({ error: "invalid_origin" }); return; }
  if (typeof req.body?.caption !== "string" || req.body.caption.length > 2200) { res.status(400).json({ error: "invalid_caption" }); return; }
  try { const id = String(req.params.id); const [publication] = await db.update(instagramPublications).set({ caption: req.body.caption, updatedAt: new Date() }).where(and(eq(instagramPublications.id, id), eq(instagramPublications.userId, ownerId(res)), eq(instagramPublications.status, "awaiting_review"))).returning(); if (!publication) { res.status(409).json({ error: "publication_not_editable" }); return; } res.json({ publication }); }
  catch (error) { next(error); }
});
router.post("/publications/:id/publish", requireAuthenticatedUser, async (req, res, next) => {
  if (!validOrigin(req)) { res.status(403).json({ error: "invalid_origin" }); return; }
  try { const id = String(req.params.id); const [publication] = await db.update(instagramPublications).set({ status: "queued", updatedAt: new Date() }).where(and(eq(instagramPublications.id, id), eq(instagramPublications.userId, ownerId(res)), eq(instagramPublications.status, "awaiting_review"))).returning(); if (!publication) { res.status(409).json({ error: "publication_not_ready" }); return; } res.json({ publication }); }
  catch (error) { next(error); }
});
router.post("/publications/:id/discard", requireAuthenticatedUser, async (req, res, next) => {
  if (!validOrigin(req)) { res.status(403).json({ error: "invalid_origin" }); return; }
  try {
    const resolved = await db.transaction(async (tx) => {
      const [item] = await tx.select().from(instagramPublications).where(and(eq(instagramPublications.id, String(req.params.id)), eq(instagramPublications.userId, ownerId(res)))).limit(1).for("update");
      if (!item || item.status !== "awaiting_review") return false;
      await tx.update(instagramPublications).set({ status: "discarded", updatedAt: new Date() }).where(eq(instagramPublications.id, item.id));
      await tx.update(runs).set({ status: "succeeded", finishedAt: new Date() }).where(and(eq(runs.id, item.runId), eq(runs.userId, ownerId(res)), eq(runs.status, "awaiting_publish")));
      return true;
    });
    if (!resolved) { res.status(409).json({ error: "publication_not_discardable" }); return; }
    res.json({ status: "discarded" });
  } catch (error) { next(error); }
});

router.get("/media/:artifactId", async (req, res, next) => {
  try {
    const expires = Number(req.query.expires); const signature = String(req.query.signature ?? "");
    if (!Number.isInteger(expires) || expires < Date.now() / 1000 || expires > Date.now() / 1000 + 3600) { res.status(403).end(); return; }
    const expected = createHmac("sha256", key()).update(`${req.params.artifactId}.${expires}`).digest();
    const supplied = Buffer.from(signature, "hex");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) { res.status(403).end(); return; }
    const found = await pool.query<{ media_type: string; storage_key: string }>("SELECT a.media_type,a.storage_key FROM artifacts a JOIN instagram_publications p ON p.artifact_id=a.id WHERE a.id=$1 AND p.status IN ('queued','publishing') LIMIT 1", [String(req.params.artifactId)]);
    const artifact = found.rows[0]; if (!artifact) { res.status(404).end(); return; }
    res.setHeader("Content-Type", artifact.media_type); res.setHeader("Cache-Control", "public, max-age=300"); res.setHeader("X-Content-Type-Options", "nosniff"); res.send(await readArtifact(artifact.storage_key));
  } catch (error) { next(error); }
});

export { router as instagramRouter };
