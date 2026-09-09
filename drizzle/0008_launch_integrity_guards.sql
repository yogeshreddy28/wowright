CREATE TRIGGER quote_approval_guard BEFORE UPDATE OF approved_version ON custom_quote_requests
WHEN NEW.approved_version IS NOT NULL AND (OLD.quote_version <> NEW.approved_version OR OLD.order_id IS NOT NULL OR OLD.status <> 'quoted')
BEGIN SELECT RAISE(ABORT,'Quote changed. Review the latest quote.'); END;
--> statement-breakpoint
CREATE TRIGGER product_publish_guard BEFORE UPDATE OF publishing_status ON products
WHEN NEW.publishing_status='published' AND OLD.publishing_status<>'published' AND (
 NEW.commercial_license_status IS NOT 'commercial_verified' OR NEW.category_id IS NULL
 OR (json_array_length(NEW.images)=0 AND NOT EXISTS(SELECT 1 FROM product_images WHERE product_id=NEW.id AND role='main')))
BEGIN SELECT RAISE(ABORT,'Verified commercial licence, category and main image required.'); END;
