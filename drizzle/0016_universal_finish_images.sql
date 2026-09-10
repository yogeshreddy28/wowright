CREATE TABLE `product_variant_images` (
	`id` text PRIMARY KEY NOT NULL,
	`variant_id` text NOT NULL,
	`image_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_id`) REFERENCES `product_images`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_product_variant_images_pair` ON `product_variant_images` (`variant_id`,`image_id`);
--> statement-breakpoint
CREATE INDEX `idx_product_variant_images_variant` ON `product_variant_images` (`variant_id`,`sort_order`);
--> statement-breakpoint
INSERT OR IGNORE INTO `product_variant_images` (`id`,`variant_id`,`image_id`,`sort_order`,`created_at`,`updated_at`)
SELECT 'legacy-' || `id` || '-' || `exact_image_id`, `id`, `exact_image_id`, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM `product_variants`
WHERE `exact_image_id` IS NOT NULL;
