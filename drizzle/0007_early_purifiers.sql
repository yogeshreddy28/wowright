CREATE TABLE `production_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`order_item_id` text NOT NULL,
	`production_date` text NOT NULL,
	`minutes` integer NOT NULL,
	FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_allocations_date` ON `production_allocations` (`production_date`);--> statement-breakpoint
CREATE INDEX `idx_allocations_item` ON `production_allocations` (`order_item_id`);--> statement-breakpoint
ALTER TABLE `orders` ADD `checkout_fingerprint` text;
--> statement-breakpoint
CREATE TRIGGER production_capacity_guard BEFORE INSERT ON production_allocations
WHEN NEW.minutes <= 0 OR NEW.minutes > 600 OR COALESCE((SELECT SUM(minutes) FROM production_allocations WHERE production_date=NEW.production_date),0)+NEW.minutes > 600
BEGIN SELECT RAISE(ABORT,'Production capacity changed. Retry scheduling.'); END;
--> statement-breakpoint
CREATE TRIGGER delivery_assignment_guard BEFORE INSERT ON delivery_stops
WHEN (SELECT status FROM orders WHERE id=NEW.order_id) NOT IN ('ready','packed','reschedule_required')
 OR EXISTS(SELECT 1 FROM order_items WHERE order_id=NEW.order_id AND (qc_passed_at IS NULL OR packed_at IS NULL))
 OR NOT EXISTS(SELECT 1 FROM order_items WHERE order_id=NEW.order_id)
 OR EXISTS(SELECT 1 FROM delivery_stops WHERE order_id=NEW.order_id AND status NOT IN ('failed','delivered'))
BEGIN SELECT RAISE(ABORT,'Order is not ready or already assigned.'); END;
