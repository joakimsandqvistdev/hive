INSERT INTO "models" ("id", "name", "modality", "sort_order") VALUES
	('anytext2', 'AnyText2', 'image', 14);
--> statement-breakpoint
INSERT INTO "model_data_types" ("model_id", "direction", "port_key", "data_type_id", "label", "transport", "min_count", "max_count", "sort_order") VALUES
	('anytext2', 'input', 'prompt', 'text', 'Image prompt', 'prompt', 1, 1, 0),
	('anytext2', 'input', 'text', 'text', 'Text to render', 'connection', 1, 1, 1),
	('anytext2', 'input', 'image', 'image', 'Source image', 'connection', 1, 1, 2),
	('anytext2', 'input', 'mask', 'image', 'Text placement mask', 'connection', 1, 1, 3),
	('anytext2', 'output', 'image', 'image', 'Image with rendered text', NULL, 1, 1, 0);
