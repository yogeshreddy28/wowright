CREATE TABLE `abuse_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_abuse_reset` ON `abuse_limits` (`reset_at`);