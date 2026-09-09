ALTER TABLE `customer_addresses` ADD `latitude` real;
ALTER TABLE `customer_addresses` ADD `longitude` real;
CREATE TABLE `cash_settlements` (
  `id` text PRIMARY KEY NOT NULL,
  `person_id` text NOT NULL,
  `amount` integer NOT NULL,
  `note` text,
  `actor` text DEFAULT 'admin' NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`person_id`) REFERENCES `delivery_people`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE INDEX `idx_cash_settlements_person_created` ON `cash_settlements` (`person_id`,`created_at`);
INSERT INTO `cash_settlements` (`id`,`person_id`,`amount`,`note`,`actor`,`created_at`)
SELECT 'legacy-'||`id`,`person_id`,`amount_collected`,'Migrated from a previously reconciled cash collection','migration',COALESCE(`settled_at`,`collected_at`)
FROM `payment_collections`
WHERE `method`='cash' AND `settlement_status`='settled' AND `person_id` IS NOT NULL;
