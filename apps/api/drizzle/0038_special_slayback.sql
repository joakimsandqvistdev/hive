CREATE TABLE "instagram_publication_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"container_id" text
);
--> statement-breakpoint
ALTER TABLE "instagram_publications" ALTER COLUMN "run_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "instagram_publications" ALTER COLUMN "node_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "instagram_publication_media" ADD CONSTRAINT "instagram_publication_media_publication_id_instagram_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."instagram_publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_publication_media" ADD CONSTRAINT "instagram_publication_media_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "instagram_publication_media_position_unique" ON "instagram_publication_media" USING btree ("publication_id","position");--> statement-breakpoint
CREATE INDEX "instagram_publication_media_artifact_idx" ON "instagram_publication_media" USING btree ("artifact_id");
