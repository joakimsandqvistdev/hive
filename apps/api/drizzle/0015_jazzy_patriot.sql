CREATE TYPE "public"."model_data_direction" AS ENUM('input', 'output');--> statement-breakpoint
CREATE TYPE "public"."model_input_transport" AS ENUM('prompt', 'connection');--> statement-breakpoint
CREATE TABLE "data_types" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"media_type" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_data_types" (
	"model_id" text NOT NULL,
	"direction" "model_data_direction" NOT NULL,
	"port_key" text NOT NULL,
	"data_type_id" text NOT NULL,
	"label" text NOT NULL,
	"transport" "model_input_transport",
	"min_count" integer DEFAULT 1 NOT NULL,
	"max_count" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "model_data_types_pk" PRIMARY KEY("model_id","direction","port_key"),
	CONSTRAINT "model_data_types_count_check" CHECK (min_count >= 0 and max_count >= min_count),
	CONSTRAINT "model_data_types_transport_check" CHECK ((direction = 'input' and transport is not null) or (direction = 'output' and transport is null))
);
--> statement-breakpoint
CREATE TABLE "model_input_group_ports" (
	"model_id" text NOT NULL,
	"group_key" text NOT NULL,
	"direction" "model_data_direction" DEFAULT 'input' NOT NULL,
	"port_key" text NOT NULL,
	CONSTRAINT "model_input_group_ports_pk" PRIMARY KEY("model_id","group_key","port_key"),
	CONSTRAINT "model_input_group_ports_input_only_check" CHECK (direction = 'input')
);
--> statement-breakpoint
CREATE TABLE "model_input_groups" (
	"model_id" text NOT NULL,
	"group_key" text NOT NULL,
	"label" text NOT NULL,
	"min_count" integer DEFAULT 1 NOT NULL,
	"max_count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "model_input_groups_pk" PRIMARY KEY("model_id","group_key"),
	CONSTRAINT "model_input_groups_count_check" CHECK (min_count >= 0 and max_count >= min_count)
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"modality" "agent_modality" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_edges" ADD COLUMN "source_handle" text;--> statement-breakpoint
ALTER TABLE "workflow_edges" ADD COLUMN "target_handle" text;--> statement-breakpoint
ALTER TABLE "model_data_types" ADD CONSTRAINT "model_data_types_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_data_types" ADD CONSTRAINT "model_data_types_data_type_id_data_types_id_fk" FOREIGN KEY ("data_type_id") REFERENCES "public"."data_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_input_group_ports" ADD CONSTRAINT "model_input_group_ports_group_fk" FOREIGN KEY ("model_id","group_key") REFERENCES "public"."model_input_groups"("model_id","group_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_input_group_ports" ADD CONSTRAINT "model_input_group_ports_port_fk" FOREIGN KEY ("model_id","direction","port_key") REFERENCES "public"."model_data_types"("model_id","direction","port_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_input_groups" ADD CONSTRAINT "model_input_groups_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "data_types" ("id", "label", "description", "media_type") VALUES
	('text', 'Text', 'Text prompts and other textual model inputs.', 'text/plain'),
	('image', 'Image', 'Raster image data, including masks provided through named image ports.', 'image/*'),
	('video', 'Video', 'Generated or supplied video content.', 'video/*');--> statement-breakpoint
INSERT INTO "models" ("id", "name", "modality", "sort_order") VALUES
	('z-image-turbo', 'Z-Image-Turbo', 'image', 0),
	('qwen-image-edit-2511', 'Qwen-Image-Edit-2511', 'image', 1),
	('instruct-pix2pix', 'InstructPix2Pix', 'image', 2),
	('sd15-inpainting', 'Stable Diffusion 1.5 Inpainting', 'image', 3),
	('longcat-image-edit-turbo', 'LongCat-Image-Edit-Turbo', 'image', 4),
	('flux2-klein-4b', 'FLUX.2 Klein 4B', 'image', 5),
	('sd15-base', 'Stable Diffusion 1.5', 'image', 6),
	('sdxl-base-1.0', 'SDXL Base 1.0', 'image', 7),
	('sd35-medium', 'Stable Diffusion 3.5 Medium', 'image', 8),
	('sdxl-turbo', 'SDXL-Turbo', 'image', 9),
	('sana-sprint-06b', 'Sana Sprint 0.6B', 'image', 10),
	('wan2.1-t2v-1.3b', 'Wan2.1 T2V 1.3B', 'video', 11),
	('cogvideox-2b', 'CogVideoX-2B', 'video', 12);--> statement-breakpoint
INSERT INTO "model_data_types" ("model_id", "direction", "port_key", "data_type_id", "label", "transport", "min_count", "max_count", "sort_order") VALUES
	('z-image-turbo', 'input', 'prompt', 'text', 'Prompt', 'prompt', 1, 1, 0),
	('z-image-turbo', 'output', 'image', 'image', 'Generated image', NULL, 1, 1, 0),
	('qwen-image-edit-2511', 'input', 'prompt', 'text', 'Prompt', 'prompt', 1, 1, 0),
	('qwen-image-edit-2511', 'input', 'image', 'image', 'Image reference', 'connection', 1, 10, 1),
	('qwen-image-edit-2511', 'output', 'image', 'image', 'Generated image', NULL, 1, 1, 0),
	('instruct-pix2pix', 'input', 'prompt', 'text', 'Prompt', 'prompt', 1, 1, 0),
	('instruct-pix2pix', 'input', 'image', 'image', 'Source image', 'connection', 1, 1, 1),
	('instruct-pix2pix', 'output', 'image', 'image', 'Generated image', NULL, 1, 1, 0),
	('sd15-inpainting', 'input', 'prompt', 'text', 'Prompt', 'prompt', 1, 1, 0),
	('sd15-inpainting', 'input', 'image', 'image', 'Image', 'connection', 1, 1, 1),
	('sd15-inpainting', 'input', 'mask', 'image', 'Mask', 'connection', 1, 1, 2),
	('sd15-inpainting', 'output', 'image', 'image', 'Generated image', NULL, 1, 1, 0),
	('longcat-image-edit-turbo', 'input', 'prompt', 'text', 'Prompt', 'prompt', 1, 1, 0),
	('longcat-image-edit-turbo', 'input', 'image', 'image', 'Source image', 'connection', 1, 1, 1),
	('longcat-image-edit-turbo', 'output', 'image', 'image', 'Generated image', NULL, 1, 1, 0),
	('flux2-klein-4b', 'input', 'prompt', 'text', 'Prompt', 'prompt', 1, 1, 0),
	('flux2-klein-4b', 'input', 'image', 'image', 'Reference image', 'connection', 0, 4, 1),
	('flux2-klein-4b', 'output', 'image', 'image', 'Generated image', NULL, 1, 1, 0),
	('sd15-base', 'input', 'prompt', 'text', 'Prompt', 'prompt', 1, 1, 0),
	('sd15-base', 'output', 'image', 'image', 'Generated image', NULL, 1, 1, 0),
	('sdxl-base-1.0', 'input', 'prompt', 'text', 'Prompt', 'prompt', 1, 1, 0),
	('sdxl-base-1.0', 'output', 'image', 'image', 'Generated image', NULL, 1, 1, 0),
	('sd35-medium', 'input', 'prompt', 'text', 'Prompt', 'prompt', 1, 1, 0),
	('sd35-medium', 'output', 'image', 'image', 'Generated image', NULL, 1, 1, 0),
	('sdxl-turbo', 'input', 'prompt', 'text', 'Prompt', 'prompt', 1, 1, 0),
	('sdxl-turbo', 'output', 'image', 'image', 'Generated image', NULL, 1, 1, 0),
	('sana-sprint-06b', 'input', 'prompt', 'text', 'Prompt', 'prompt', 1, 1, 0),
	('sana-sprint-06b', 'output', 'image', 'image', 'Generated image', NULL, 1, 1, 0),
	('wan2.1-t2v-1.3b', 'input', 'prompt', 'text', 'Prompt', 'prompt', 1, 1, 0),
	('wan2.1-t2v-1.3b', 'output', 'video', 'video', 'Generated video', NULL, 1, 1, 0),
	('cogvideox-2b', 'input', 'prompt', 'text', 'Prompt', 'prompt', 1, 1, 0),
	('cogvideox-2b', 'output', 'video', 'video', 'Generated video', NULL, 1, 1, 0);
