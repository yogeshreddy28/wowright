CREATE TABLE `commerce_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`event_name` text NOT NULL,
	`order_id` text,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`delivered_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_outbox_status` ON `commerce_outbox` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `delivery_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`delivery_date` text NOT NULL,
	`time_window` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`started_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `delivery_people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_delivery_batch_person` ON `delivery_batches` (`person_id`,`delivery_date`);--> statement-breakpoint
CREATE TABLE `delivery_people` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`mobile` text NOT NULL,
	`password_hash` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_delivery_people_mobile` ON `delivery_people` (`mobile`);--> statement-breakpoint
CREATE TABLE `delivery_proofs` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`person_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`consent_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `delivery_people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_delivery_proof_order` ON `delivery_proofs` (`order_id`);--> statement-breakpoint
CREATE TABLE `delivery_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `delivery_people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_delivery_session_token` ON `delivery_sessions` (`token_hash`);--> statement-breakpoint
CREATE TABLE `delivery_stops` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`order_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`availability_note` text,
	`failure_reason` text,
	`arrived_at` text,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `delivery_batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_delivery_stop_batch_order` ON `delivery_stops` (`batch_id`,`order_id`);--> statement-breakpoint
CREATE INDEX `idx_delivery_stop_order` ON `delivery_stops` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_costs` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`category` text NOT NULL,
	`amount` integer NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_costs_order` ON `order_costs` (`order_id`);--> statement-breakpoint
CREATE TABLE `payment_collections` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`person_id` text,
	`method` text NOT NULL,
	`amount_due` integer NOT NULL,
	`amount_collected` integer NOT NULL,
	`settlement_status` text DEFAULT 'pending' NOT NULL,
	`settled_at` text,
	`collected_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_id`) REFERENCES `delivery_people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_collection_order` ON `payment_collections` (`order_id`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`order_item_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`product_id` text NOT NULL,
	`rating` integer NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`moderation_reason` text,
	`photo_key` text,
	`photo_type` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_review_order_item` ON `reviews` (`order_item_id`);--> statement-breakpoint
CREATE INDEX `idx_review_product_status` ON `reviews` (`product_id`,`status`);--> statement-breakpoint
ALTER TABLE `custom_quote_requests` ADD `product_id` text;--> statement-breakpoint
ALTER TABLE `custom_quote_requests` ADD `specifications` text;--> statement-breakpoint
ALTER TABLE `custom_quote_requests` ADD `quoted_price` integer;--> statement-breakpoint
ALTER TABLE `custom_quote_requests` ADD `delivery_amount` integer;--> statement-breakpoint
ALTER TABLE `custom_quote_requests` ADD `delivery_estimate` text;--> statement-breakpoint
ALTER TABLE `custom_quote_requests` ADD `quote_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `custom_quote_requests` ADD `approved_version` integer;--> statement-breakpoint
ALTER TABLE `custom_quote_requests` ADD `approved_at` text;--> statement-breakpoint
ALTER TABLE `custom_quote_requests` ADD `order_id` text;--> statement-breakpoint
ALTER TABLE `order_items` ADD `estimated_print_minutes` integer;--> statement-breakpoint
ALTER TABLE `order_items` ADD `unit_cost` integer;--> statement-breakpoint
ALTER TABLE `order_items` ADD `production_status` text DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `scheduled_date` text;--> statement-breakpoint
ALTER TABLE `order_items` ADD `qc_checklist` text;--> statement-breakpoint
ALTER TABLE `order_items` ADD `qc_passed_at` text;--> statement-breakpoint
ALTER TABLE `order_items` ADD `packed_at` text;--> statement-breakpoint
ALTER TABLE `order_items` ADD `reprint_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `last_operation_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `is_test` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `order_type` text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `latitude` real;--> statement-breakpoint
ALTER TABLE `orders` ADD `longitude` real;--> statement-breakpoint
ALTER TABLE `orders` ADD `estimated_delivery_date` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `promised_delivery_date` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `delivery_window` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `delivered_at` text;--> statement-breakpoint
ALTER TABLE `products` ADD `product_type` text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `internal_unit_cost` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `source_folder` text;