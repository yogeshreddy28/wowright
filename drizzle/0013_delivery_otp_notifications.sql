ALTER TABLE `delivery_stops` ADD `open_box_accepted_at` text;
ALTER TABLE `delivery_stops` ADD `payment_recorded_at` text;
ALTER TABLE `delivery_stops` ADD `proof_id` text;
CREATE TABLE `delivery_otps` (
  `id` text PRIMARY KEY NOT NULL,
  `stop_id` text NOT NULL REFERENCES `delivery_stops`(`id`) ON DELETE CASCADE,
  `order_id` text NOT NULL REFERENCES `orders`(`id`) ON DELETE CASCADE,
  `person_id` text NOT NULL REFERENCES `delivery_people`(`id`),
  `nonce` text NOT NULL,
  `salt` text NOT NULL,
  `code_hash` text NOT NULL,
  `attempts` integer DEFAULT 0 NOT NULL,
  `generation_number` integer DEFAULT 1 NOT NULL,
  `expires_at` text NOT NULL,
  `verified_at` text,
  `consumed_at` text,
  `invalidated_at` text,
  `override_reason` text,
  `override_actor` text,
  `generated_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE INDEX `idx_delivery_otps_stop_generated` ON `delivery_otps` (`stop_id`,`generated_at`);
CREATE INDEX `idx_delivery_otps_order` ON `delivery_otps` (`order_id`);
CREATE TABLE `admin_order_acknowledgements` (
  `order_id` text PRIMARY KEY NOT NULL REFERENCES `orders`(`id`) ON DELETE CASCADE,
  `acknowledged_at` text NOT NULL,
  `actor` text DEFAULT 'admin' NOT NULL
);
