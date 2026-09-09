ALTER TABLE `orders` ADD `companion_engaged` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `companion_assisted_cart` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `companion_assisted_checkout` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `campaign_attribution` text;--> statement-breakpoint
CREATE INDEX `idx_orders_companion` ON `orders` (`companion_engaged`,`created_at`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `companion_context` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `intent_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `intent_stage` text DEFAULT 'explorer' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `companion_dismissals` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `companion_engaged` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `source` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `campaign` text;--> statement-breakpoint
CREATE INDEX `idx_sessions_intent` ON `sessions` (`intent_stage`,`last_activity`);