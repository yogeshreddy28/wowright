CREATE TABLE `admin_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`metadata` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_admin_audit_action_created` ON `admin_audit_events` (`action`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_provider_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'openai' NOT NULL,
	`model` text DEFAULT 'gpt-5.6-luna' NOT NULL,
	`api_key_ciphertext` text,
	`api_key_iv` text,
	`secret_version` integer DEFAULT 1 NOT NULL,
	`connection_status` text DEFAULT 'not_configured' NOT NULL,
	`last_tested_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
