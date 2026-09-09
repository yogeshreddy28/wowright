CREATE TABLE `global_finishes` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`swatch` text,
	`reference_image_id` text,
	`active` integer DEFAULT true NOT NULL,
	`internal_notes` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_global_finishes_slug` ON `global_finishes` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_global_finishes_name` ON `global_finishes` (`name`);--> statement-breakpoint
CREATE TABLE `product_images` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text,
	`global_finish_id` text,
	`storage_key` text NOT NULL,
	`original_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`role` text DEFAULT 'gallery' NOT NULL,
	`alt_text` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`global_finish_id`) REFERENCES `global_finishes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_product_images_product` ON `product_images` (`product_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_product_images_finish` ON `product_images` (`global_finish_id`);--> statement-breakpoint
CREATE TABLE `product_tags` (
	`product_id` text NOT NULL,
	`tag_id` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_product_tag_pair` ON `product_tags` (`product_id`,`tag_id`);--> statement-breakpoint
CREATE TABLE `sku_sequences` (
	`prefix` text PRIMARY KEY NOT NULL,
	`value` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tags_slug` ON `tags` (`slug`);--> statement-breakpoint
ALTER TABLE `product_variants` ADD `finish_id` text;--> statement-breakpoint
ALTER TABLE `product_variants` ADD `selling_price` integer;--> statement-breakpoint
ALTER TABLE `product_variants` ADD `original_price` integer;--> statement-breakpoint
ALTER TABLE `product_variants` ADD `exact_image_id` text;--> statement-breakpoint
ALTER TABLE `product_variants` ADD `availability` text DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE `product_variants` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `category_id` text;--> statement-breakpoint
ALTER TABLE `products` ADD `publishing_status` text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `availability` text DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `width` real;--> statement-breakpoint
ALTER TABLE `products` ADD `depth` real;--> statement-breakpoint
ALTER TABLE `products` ADD `height` real;--> statement-breakpoint
ALTER TABLE `products` ADD `dimension_unit` text DEFAULT 'cm' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `dimension_display_override` text;--> statement-breakpoint
ALTER TABLE `products` ADD `estimated_print_minutes` integer;--> statement-breakpoint
ALTER TABLE `products` ADD `filament_grams` real;--> statement-breakpoint
ALTER TABLE `products` ADD `support_difficulty` text;--> statement-breakpoint
ALTER TABLE `products` ADD `print_profile_notes` text;--> statement-breakpoint
ALTER TABLE `products` ADD `internal_production_notes` text;--> statement-breakpoint
ALTER TABLE `products` ADD `seo_title` text;--> statement-breakpoint
ALTER TABLE `products` ADD `seo_description` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_products_sku` ON `products` (`sku`);--> statement-breakpoint
CREATE INDEX `idx_products_category_publish` ON `products` (`category_id`,`publishing_status`,`availability`);--> statement-breakpoint
INSERT OR IGNORE INTO `categories` (`id`,`slug`,`name`,`active`,`sort_order`,`created_at`,`updated_at`) VALUES
('cat_devotional','devotional','Devotional',1,10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('cat_personalized_gifts','personalized-gifts','Personalized Gifts',1,20,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('cat_home_decor','home-decor','Home Decor',1,30,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('cat_desk_utility','desk-utility','Desk & Utility',1,40,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('cat_toys_fidgets','toys-fidgets','Toys & Fidgets',1,50,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('cat_seasonal','seasonal','Seasonal',1,60,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);--> statement-breakpoint
UPDATE `products` SET `publishing_status`=CASE WHEN COALESCE(`status`,'active')='draft' THEN 'draft' ELSE 'published' END,
`availability`=CASE WHEN COALESCE(`status`,'active')='unavailable' THEN 'temporarily_unavailable' ELSE 'available' END;--> statement-breakpoint
UPDATE `products` SET `category_id`='cat_home_decor',`category`='Home Decor' WHERE lower(`category`) IN ('decor','home','home decor','home décor');--> statement-breakpoint
UPDATE `products` SET `category_id`='cat_personalized_gifts',`category`='Personalized Gifts' WHERE lower(`category`) IN ('gift','gifts','personalized gift','personalized gifts');--> statement-breakpoint
INSERT OR IGNORE INTO `settings` (`key`,`value`,`updated_at`) VALUES
('productDefaultMaterial','"PLA"',CURRENT_TIMESTAMP),
('productDefaultStockMode','"made_to_order"',CURRENT_TIMESTAMP),
('productDefaultLeadTime','""',CURRENT_TIMESTAMP),
('productMadeToOrderNotice','"Made to order for you."',CURRENT_TIMESTAMP),
('productDefaultDeliveryNotes','""',CURRENT_TIMESTAMP),
('productDefaultCareInstructions','""',CURRENT_TIMESTAMP),
('productDefaultOpenBoxInfo','""',CURRENT_TIMESTAMP);
