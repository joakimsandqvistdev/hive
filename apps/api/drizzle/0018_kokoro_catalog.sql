INSERT INTO "models" ("id", "name", "modality", "sort_order", "enabled")
VALUES ('kokoro-82m', 'Kokoro-82M', 'audio', 13, true)
ON CONFLICT ("id") DO UPDATE SET "name"=EXCLUDED."name", "modality"=EXCLUDED."modality", "enabled"=EXCLUDED."enabled";
--> statement-breakpoint
INSERT INTO "model_data_types" ("model_id", "direction", "port_key", "data_type_id", "label", "transport", "min_count", "max_count", "sort_order") VALUES
('kokoro-82m','input','prompt','text','Prompt','prompt',1,1,0),
('kokoro-82m','output','audio','audio','Generated audio',NULL,1,1,0)
ON CONFLICT ("model_id", "direction", "port_key") DO UPDATE SET "data_type_id"=EXCLUDED."data_type_id", "label"=EXCLUDED."label", "transport"=EXCLUDED."transport", "min_count"=EXCLUDED."min_count", "max_count"=EXCLUDED."max_count", "sort_order"=EXCLUDED."sort_order";
