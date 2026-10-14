-- Recreate the enum instead of ADD VALUE: Drizzle applies the full pending
-- migration batch transactionally, and PostgreSQL cannot use an enum value
-- added by ALTER TYPE until the transaction commits.
ALTER TYPE "public"."model_modality" RENAME TO "model_modality_old";
--> statement-breakpoint
CREATE TYPE "public"."model_modality" AS ENUM ('image', 'video', 'audio');
--> statement-breakpoint
ALTER TABLE "public"."models" ALTER COLUMN "modality" TYPE "public"."model_modality"
USING "modality"::text::"public"."model_modality";
--> statement-breakpoint
DROP TYPE "public"."model_modality_old";
