import { config } from "dotenv";
config({ path: "../../.env" });
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://hive:hive_dev_password@localhost:5432/hive" },
});
