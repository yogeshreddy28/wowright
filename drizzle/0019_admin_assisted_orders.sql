ALTER TABLE `orders` ADD `source` text DEFAULT 'website' NOT NULL;
--> statement-breakpoint
ALTER TABLE `customers` ADD `account_claim_pending` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `created_by` text;
--> statement-breakpoint
ALTER TABLE `orders` ADD `admin_discount` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `override_reason` text;
--> statement-breakpoint
CREATE INDEX `idx_orders_source_created` ON `orders` (`source`,`created_at`);
--> statement-breakpoint
CREATE TABLE `order_tracking_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_order_tracking_token_hash` ON `order_tracking_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `idx_order_tracking_order` ON `order_tracking_tokens` (`order_id`);
--> statement-breakpoint
CREATE TABLE `order_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`metadata` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_order_audit_order_created` ON `order_audit_log` (`order_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `order_milestone_media` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`timeline_id` text,
	`storage_key` text NOT NULL,
	`content_type` text NOT NULL,
	`caption` text,
	`customer_visible` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`timeline_id`) REFERENCES `order_timeline`(`id`) ON UPDATE no action ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `idx_order_milestone_media_order` ON `order_milestone_media` (`order_id`,`customer_visible`,`created_at`);
