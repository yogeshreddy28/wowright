# WOW RIGHT product import

Use Admin → Products → Bulk import. Always run **Validate & Preview** before committing. A committed import is created as Draft regardless of the source file, so no imported product becomes customer-visible without the normal publish checks.

## Formats

- `product-import-template.csv` contains headers only. Separate tags with `|`. Put variants in the `variants` cell as a JSON array.
- `product-import-template.json` is the preferred format for products with several finishes.

`category` must match an active controlled category. `sku` and `slug` are optional; the server generates unique values when they are blank. If either supplied value already exists, the complete batch is rejected. Prices are whole rupees, and dimensions/filament may contain decimals.

Example variant shape (structure only):

```json
{
  "name": "",
  "finish_id": "",
  "price": null,
  "original_price": null,
  "enabled": true
}
```

Global finishes should be created in Admin before importing `finish_id` values. Do not put image binaries or base64 values in import files; upload product and finish-reference images through Admin so they are stored in R2.
