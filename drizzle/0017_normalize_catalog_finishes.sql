INSERT OR IGNORE INTO `global_finishes`
  (`id`, `slug`, `name`, `swatch`, `active`, `internal_notes`, `sort_order`, `created_at`, `updated_at`)
VALUES
  ('finish-black', 'black', 'Black', NULL, 1, 'Migrated from existing catalogue finish names.', 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('finish-copper-silky', 'copper-silky', 'Copper Silky', NULL, 1, 'Migrated from existing catalogue finish names.', 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('finish-white', 'white', 'White', NULL, 1, 'Migrated from existing catalogue finish names.', 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
--> statement-breakpoint
UPDATE `product_variants`
SET `finish_id` = 'finish-black'
WHERE `finish_id` IS NULL AND lower(trim(`name`)) = 'black';
--> statement-breakpoint
UPDATE `product_variants`
SET `finish_id` = 'finish-copper-silky'
WHERE `finish_id` IS NULL AND lower(trim(`name`)) = 'copper silky';
--> statement-breakpoint
UPDATE `product_variants`
SET `finish_id` = 'finish-white'
WHERE `finish_id` IS NULL AND lower(trim(`name`)) = 'white';
