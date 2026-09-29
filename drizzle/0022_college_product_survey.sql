CREATE TABLE `survey_responses` (
  `id` text PRIMARY KEY NOT NULL,
  `claim_code` text NOT NULL,
  `age` text NOT NULL,
  `college` text NOT NULL,
  `course` text,
  `year` text,
  `interests` text NOT NULL,
  `top_interest` text NOT NULL,
  `budget` text NOT NULL,
  `buying_driver` text NOT NULL,
  `purchase_intent` text NOT NULL,
  `product_idea` text,
  `fandom` text,
  `name` text NOT NULL,
  `phone` text NOT NULL,
  `marketing_consent` integer DEFAULT 0 NOT NULL,
  `marketing_consent_timestamp` text,
  `submitted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `redeemed` integer DEFAULT 0 NOT NULL,
  `redeemed_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_survey_claim_code` ON `survey_responses` (`claim_code`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_survey_phone` ON `survey_responses` (`phone`);
--> statement-breakpoint
CREATE INDEX `idx_survey_submitted_at` ON `survey_responses` (`submitted_at`);
--> statement-breakpoint
CREATE INDEX `idx_survey_redeemed` ON `survey_responses` (`redeemed`);
--> statement-breakpoint
CREATE INDEX `idx_survey_segments` ON `survey_responses` (`top_interest`,`budget`,`purchase_intent`,`marketing_consent`);
