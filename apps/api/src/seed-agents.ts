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
      { modality: "text" as const, name: "Sample Text Writer", prompt: "Draft and refine clear, coherent text based on the run request." },
      { modality: "image" as const, name: "Sample Image Creator", prompt: "Create a visual image that follows the run request." },
      { modality: "audio" as const, name: "Sample Audio Creator", prompt: "Generate speech or sound that follows the run request." },
      { modality: "video" as const, name: "Sample Video Creator", prompt: "Assemble scenes and motion that follow the run request." },
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
