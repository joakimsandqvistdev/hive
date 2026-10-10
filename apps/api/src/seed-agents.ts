import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "./db.js";
import { agents, users } from "./schema.js";

const email = process.env.AGENT_SEED_USER_EMAIL?.trim();
if (!email) {
  console.error("Set AGENT_SEED_USER_EMAIL to the email of an existing Hive user before seeding agents.");
  process.exitCode = 1;
} else {
  try {
    const [user] = await db.select({ id: users.id }).from(users)
      .where(sql`lower(${users.email}) = lower(${email})`).limit(1);
    if (!user) {
      throw new Error(`No Hive user found for ${email}. Sign in once, then run the seed command again.`);
    }

    const samples = [
      { modality: "text" as const, name: "Sample Text Writer", description: "Placeholder writing agent for drafting and refining text." },
      { modality: "image" as const, name: "Sample Image Creator", description: "Placeholder image agent for creating visual concepts." },
      { modality: "audio" as const, name: "Sample Audio Creator", description: "Placeholder audio agent for speech and sound generation." },
      { modality: "video" as const, name: "Sample Video Creator", description: "Placeholder video agent for assembling scenes and motion." },
    ];

    for (const sample of samples) {
      const [existing] = await db.select({ id: agents.id }).from(agents).where(and(
        eq(agents.userId, user.id),
        sql`lower(${agents.name}) = lower(${sample.name})`,
      )).limit(1);
      if (!existing) await db.insert(agents).values({ ...sample, userId: user.id });
    }
    console.log("Sample agents are ready. Existing sample agents were left unchanged.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Could not seed sample agents.");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
