# WOW RIGHT product import format

Use `product-import-template.csv` as the header for a future bulk import. It intentionally contains no invented products.

- Money fields use whole rupees.
- `gallery_images`, `available_finishes`, `finish_reference_images`, and `tags` use JSON values when imported.
- `status` is `draft`, `active`, or `unavailable`. New rows should normally start as `draft`.
- `commercial_license_status` is internal and must never be displayed in the storefront.
- Finish-reference images must be real samples and are labelled as references, not exact product renders.
- The importer must validate every row and use the existing product, option, and image service rather than writing unverified prices directly to a cart or order.
