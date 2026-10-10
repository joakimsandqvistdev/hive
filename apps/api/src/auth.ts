import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { Router } from "express";
import type { RequestHandler } from "express";
import { db } from "./db.js";
import { sessions, users } from "./schema.js";

const router = Router();
const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_ENDPOINT = "https://www.googleapis.com/oauth2/v3/certs";
const OAUTH_COOKIE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE = "hive_session";

type GoogleJwk = {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n: string;
  e: string;
};

type GoogleIdClaims = {
  aud?: string | string[];
  exp?: number;
  iat?: number;
  iss?: string;
  nonce?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

let cachedJwks: { keys: GoogleJwk[]; expiresAt: number } | undefined;

export const requireAuthenticatedUser: RequestHandler = async (req, res, next) => {
  const rawSessionId = cookieValue(req, SESSION_COOKIE);
  if (!rawSessionId) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  try {
    const [session] = await db.select({ userId: sessions.userId }).from(sessions)
      .where(and(eq(sessions.id, sessionHash(rawSessionId)), gt(sessions.expiresAt, new Date())))
      .limit(1);
    if (!session) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    res.locals.userId = session.userId as string;
    next();
  } catch (error) {
    next(error);
  }
};

function webOrigin() {
  return process.env.WEB_ORIGIN ?? "http://localhost:5173";
}

function googleCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3001/api/auth/google/callback";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}

function secureCookie() {
  return process.env.NODE_ENV === "production";
}

function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: secureCookie(), sameSite: "lax" as const, path: "/", maxAge };
}

function clearAuthCookies(res: import("express").Response) {
  for (const name of ["hive_oauth_state", "hive_oauth_nonce", "hive_oauth_verifier", SESSION_COOKIE]) {
    res.clearCookie(name, { ...cookieOptions(0), maxAge: undefined });
  }
}

function cookieValue(req: import("express").Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function sessionHash(sessionId: string) {
  return createHash("sha256").update(sessionId).digest("hex");
}

function sameSecret(left: string | undefined, right: string | undefined) {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function getGoogleJwks(forceRefresh = false): Promise<GoogleJwk[]> {
  if (!forceRefresh && cachedJwks && cachedJwks.expiresAt > Date.now()) return cachedJwks.keys;

  const response = await fetch(GOOGLE_JWKS_ENDPOINT);
  if (!response.ok) throw new Error("Could not fetch Google signing keys");
  const body = (await response.json()) as { keys?: GoogleJwk[] };
  if (!Array.isArray(body.keys)) throw new Error("Google signing keys were invalid");
  const maxAge = response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1];
  const cacheMs = Math.min(Number(maxAge ?? 300) * 1000, 60 * 60 * 1000);
  cachedJwks = { keys: body.keys, expiresAt: Date.now() + cacheMs };
  return body.keys;
}

async function verifyGoogleIdToken(idToken: string, expectedNonce: string, clientId: string): Promise<GoogleIdClaims> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Google returned an invalid ID token");

  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as { alg?: string; kid?: string };
  if (header.alg !== "RS256" || !header.kid) throw new Error("Google returned an unsupported ID token");

  let jwk = (await getGoogleJwks()).find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) jwk = (await getGoogleJwks(true)).find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) throw new Error("Google signing key was not found");

  const signingInput = `${parts[0]}.${parts[1]}`;
  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const signatureValid = verify(
    "RSA-SHA256",
    Buffer.from(signingInput),
    publicKey,
    Buffer.from(parts[2], "base64url"),
  );
  if (!signatureValid) throw new Error("Google ID token signature was invalid");

  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as GoogleIdClaims;
  const audienceMatches = Array.isArray(claims.aud) ? claims.aud.includes(clientId) : claims.aud === clientId;
  const now = Math.floor(Date.now() / 1000);
  if (!audienceMatches || !["https://accounts.google.com", "accounts.google.com"].includes(claims.iss ?? "")) {
    throw new Error("Google ID token issuer or audience was invalid");
  }
  if (typeof claims.exp !== "number" || claims.exp <= now) throw new Error("Google ID token expired");
  if (typeof claims.iat !== "number" || claims.iat > now + 300) throw new Error("Google ID token issue time was invalid");
  if (!sameSecret(claims.nonce, expectedNonce)) throw new Error("Google ID token nonce was invalid");
  if (!claims.sub || claims.sub.length > 255 || !claims.email || claims.email_verified !== true) {
    throw new Error("Google account did not provide a verified email address");
  }
  return claims;
}

router.get("/google/config", (_req, res) => {
  res.json({ configured: Boolean(googleCredentials()) });
});

router.get("/google", (_req, res) => {
  const credentials = googleCredentials();
  if (!credentials) {
    res.status(503).json({ error: "google_not_configured" });
    return;
  }

  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  for (const [name, value] of [
    ["hive_oauth_state", state],
    ["hive_oauth_nonce", nonce],
    ["hive_oauth_verifier", verifier],
  ]) {
    res.cookie(name, value, cookieOptions(OAUTH_COOKIE_TTL_MS));
  }

  const authorizationUrl = new URL(AUTHORIZATION_ENDPOINT);
  authorizationUrl.searchParams.set("client_id", credentials.clientId);
  authorizationUrl.searchParams.set("redirect_uri", credentials.redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", "openid email profile");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("nonce", nonce);
  authorizationUrl.searchParams.set("code_challenge", challenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  res.redirect(authorizationUrl.toString());
});

router.get("/google/callback", async (req, res) => {
  const credentials = googleCredentials();
  const providerError = typeof req.query.error === "string" ? req.query.error : undefined;
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const expectedState = cookieValue(req, "hive_oauth_state");
  const nonce = cookieValue(req, "hive_oauth_nonce");
  const verifier = cookieValue(req, "hive_oauth_verifier");
  clearAuthCookies(res);

  if (providerError) {
    res.redirect(`${webOrigin()}/?auth_error=cancelled`);
    return;
  }
  if (!credentials || !code || !sameSecret(state, expectedState) || !nonce || !verifier) {
    res.redirect(`${webOrigin()}/?auth_error=invalid_request`);
    return;
  }

  try {
    const tokenResponse = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        redirect_uri: credentials.redirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
    });
    if (!tokenResponse.ok) throw new Error("Google rejected the authorization code");
    const tokenBody = (await tokenResponse.json()) as { id_token?: unknown };
    if (typeof tokenBody.id_token !== "string") throw new Error("Google did not return an ID token");

    const profile = await verifyGoogleIdToken(tokenBody.id_token, nonce, credentials.clientId);
    const now = new Date();
    const [user] = await db.insert(users).values({
      googleSubject: profile.sub!,
      email: profile.email!,
      emailVerified: true,
      name: profile.name ?? null,
      avatarUrl: profile.picture ?? null,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: users.googleSubject,
      set: {
        email: profile.email!,
        emailVerified: true,
        name: profile.name ?? null,
        avatarUrl: profile.picture ?? null,
        updatedAt: now,
      },
    }).returning({ id: users.id });

    await db.delete(sessions).where(lt(sessions.expiresAt, now));
    const rawSessionId = randomBytes(32).toString("base64url");
    await db.insert(sessions).values({
      id: sessionHash(rawSessionId),
      userId: user.id,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    });
    res.cookie(SESSION_COOKIE, rawSessionId, cookieOptions(SESSION_TTL_MS));
    res.redirect(webOrigin());
  } catch (error) {
    console.error("Google sign-in failed:", error instanceof Error ? error.message : "Unknown error");
    res.redirect(`${webOrigin()}/?auth_error=sign_in_failed`);
  }
});

router.get("/me", async (req, res) => {
  const rawSessionId = cookieValue(req, SESSION_COOKIE);
  if (!rawSessionId) {
    res.json({ user: null });
    return;
  }

  const [result] = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    avatarUrl: users.avatarUrl,
  }).from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionHash(rawSessionId)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  res.json({ user: result ?? null });
});

router.post("/logout", async (req, res) => {
  if (req.get("origin") !== webOrigin()) {
    res.status(403).json({ error: "invalid_origin" });
    return;
  }
  const rawSessionId = cookieValue(req, SESSION_COOKIE);
  if (rawSessionId) await db.delete(sessions).where(eq(sessions.id, sessionHash(rawSessionId)));
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(0), maxAge: undefined });
  res.status(204).end();
});

export { router as authRouter };
