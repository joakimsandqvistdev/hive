import { eq, sql } from "drizzle-orm";
import { db } from "./db.js";
import { artifacts } from "./schema.js";

function positiveInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive safe integer.`);
  return parsed;
}

const maxUserBytes = BigInt(positiveInteger("ARTIFACT_USER_QUOTA_BYTES", 1_073_741_824));
const maxUserFiles = positiveInteger("ARTIFACT_USER_QUOTA_FILES", 1_000);
const maxTotalBytes = BigInt(positiveInteger("ARTIFACT_TOTAL_QUOTA_BYTES", 10_737_418_240));
const maxTotalFiles = positiveInteger("ARTIFACT_TOTAL_QUOTA_FILES", 100_000);

type QuotaTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class ArtifactQuotaError extends Error {
  constructor(readonly scope: "user" | "instance") {
    super(`The ${scope} artifact storage quota has been reached.`);
    this.name = "ArtifactQuotaError";
  }
}

export async function withArtifactQuota<T>(
  userId: string,
  byteSize: number,
  persist: (tx: QuotaTransaction) => Promise<T>,
): Promise<T> {
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) throw new Error("Artifact size must be a positive safe integer.");
  return db.transaction(async (tx) => {
    // Serialize all artifact admissions across API and worker processes.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(73190421)`);
    const [userUsage] = await tx.select({
      files: sql<number>`count(*)::int`,
      bytes: sql<string>`coalesce(sum(${artifacts.byteSize}), 0)::text`,
    }).from(artifacts).where(eq(artifacts.userId, userId));
    const [totalUsage] = await tx.select({
      files: sql<number>`count(*)::int`,
      bytes: sql<string>`coalesce(sum(${artifacts.byteSize}), 0)::text`,
    }).from(artifacts);

    if (BigInt(userUsage?.bytes ?? "0") + BigInt(byteSize) > maxUserBytes || Number(userUsage?.files ?? 0) + 1 > maxUserFiles) {
      throw new ArtifactQuotaError("user");
    }
    if (BigInt(totalUsage?.bytes ?? "0") + BigInt(byteSize) > maxTotalBytes || Number(totalUsage?.files ?? 0) + 1 > maxTotalFiles) {
      throw new ArtifactQuotaError("instance");
    }
    return persist(tx);
  });
}
