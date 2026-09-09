ALTER TABLE `analytics_events` ADD `is_test` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `is_test` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `custom_quote_requests` ADD `is_test` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `is_test` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `delivery_batches` ADD `is_test` integer DEFAULT false NOT NULL;