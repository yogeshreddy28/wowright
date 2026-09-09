CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`image` text,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_categories_slug` ON `categories` (`slug`);--> statement-breakpoint
CREATE TABLE `customer_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_used_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_customer_session_token` ON `customer_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_customer_session_customer` ON `customer_sessions` (`customer_id`);--> statement-breakpoint
CREATE TABLE `order_access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_order_access_token` ON `order_access_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_order_access_order` ON `order_access_tokens` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_sequences` (
	`date_key` text PRIMARY KEY NOT NULL,
	`value` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `related_products` (
	`product_id` text NOT NULL,
	`related_product_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`related_product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_related_product_pair` ON `related_products` (`product_id`,`related_product_id`);--> statement-breakpoint
ALTER TABLE `customer_addresses` ADD `label` text;--> statement-breakpoint
ALTER TABLE `customer_addresses` ADD `is_default` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `products` ADD `sku` text;--> statement-breakpoint
ALTER TABLE `products` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `dimensions` text;--> statement-breakpoint
ALTER TABLE `products` ADD `material` text;--> statement-breakpoint
ALTER TABLE `products` ADD `delivery_notes` text;--> statement-breakpoint
ALTER TABLE `products` ADD `care_instructions` text;--> statement-breakpoint
ALTER TABLE `products` ADD `commercial_license_status` text;--> statement-breakpoint
ALTER TABLE `products` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `finish_reference_images` text DEFAULT '{}' NOT NULL;