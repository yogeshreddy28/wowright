import { waitUntil } from 'cloudflare:workers';
import { flushMetaOutbox, metaConfig } from './meta';

// Dispatch after the database commit. A vendor outage must never fail checkout.
// Unacknowledged events stay in D1 for the next request or an owner-triggered retry.
export function dispatchMetaInBackground(db: D1Database) {
  if (!metaConfig().configured) return;
  waitUntil(flushMetaOutbox(db, fetch, 5).catch(() => undefined));
}
