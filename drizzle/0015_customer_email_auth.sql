ALTER TABLE `customers` ADD `email_normalized` text;
ALTER TABLE `customers` ADD `email_verified_at` text;
ALTER TABLE `customers` ADD `auth_method` text DEFAULT 'legacy' NOT NULL;
ALTER TABLE `customers` ADD `google_subject` text;
UPDATE `customers`
SET `email_normalized` = lower(trim(`email`)),
    `auth_method` = CASE WHEN `password_hash` IS NOT NULL THEN 'email' ELSE 'legacy' END
WHERE `email` IS NOT NULL
  AND trim(`email`) <> ''
  AND lower(trim(`email`)) IN (
    SELECT lower(trim(`email`)) FROM `customers`
    WHERE `email` IS NOT NULL AND trim(`email`) <> ''
    GROUP BY lower(trim(`email`)) HAVING count(*) = 1
  );
CREATE UNIQUE INDEX `idx_customers_email_normalized` ON `customers` (`email_normalized`);
CREATE UNIQUE INDEX `idx_customers_google_subject` ON `customers` (`google_subject`);
ALTER TABLE `orders` ADD `customer_email` text;
UPDATE `orders`
SET `customer_email` = (SELECT `email` FROM `customers` WHERE `customers`.`id` = `orders`.`customer_id`)
WHERE `customer_email` IS NULL;
CREATE TABLE `customer_auth_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `customer_id` text NOT NULL REFERENCES `customers`(`id`) ON DELETE CASCADE,
  `purpose` text NOT NULL,
  `token_hash` text NOT NULL,
  `expires_at` text NOT NULL,
  `used_at` text,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX `idx_customer_auth_token_hash` ON `customer_auth_tokens` (`token_hash`);
CREATE INDEX `idx_customer_auth_token_customer` ON `customer_auth_tokens` (`customer_id`,`purpose`);
CREATE TABLE `google_oauth_states` (
  `id` text PRIMARY KEY NOT NULL,
  `state_hash` text NOT NULL,
  `nonce` text NOT NULL,
  `code_verifier` text NOT NULL,
  `return_to` text DEFAULT '/account' NOT NULL,
  `pending_email` text,
  `pending_name` text,
  `pending_subject` text,
  `completed_at` text,
  `expires_at` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX `idx_google_oauth_state_hash` ON `google_oauth_states` (`state_hash`);
