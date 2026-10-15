INSERT INTO "models" ("id", "name", "modality", "sort_order", "enabled") VALUES
('qwen3-0.6b', 'Qwen3-0.6B', 'text', 14, true),
('qwen3-1.7b', 'Qwen3-1.7B', 'text', 15, true)
ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "modality" = EXCLUDED."modality", "enabled" = EXCLUDED."enabled";
--> statement-breakpoint
INSERT INTO "model_data_types" ("model_id", "direction", "port_key", "data_type_id", "label", "transport", "min_count", "max_count", "sort_order") VALUES
('qwen3-0.6b', 'input', 'prompt', 'text', 'Text input', 'connection', 1, 1, 0),
('qwen3-0.6b', 'output', 'text', 'text', 'Generated text', NULL, 1, 1, 0),
('qwen3-1.7b', 'input', 'prompt', 'text', 'Text input', 'connection', 1, 1, 0),
('qwen3-1.7b', 'output', 'text', 'text', 'Generated text', NULL, 1, 1, 0)
ON CONFLICT ("model_id", "direction", "port_key") DO UPDATE SET "data_type_id" = EXCLUDED."data_type_id", "label" = EXCLUDED."label", "transport" = EXCLUDED."transport", "min_count" = EXCLUDED."min_count", "max_count" = EXCLUDED."max_count", "sort_order" = EXCLUDED."sort_order";
