export function metaConfig() {
  const pixelId = process.env.META_PIXEL_ID || '',
    accessToken = process.env.META_CAPI_ACCESS_TOKEN || '',
    version = process.env.META_API_VERSION || '';
  return {
    pixelId,
    accessToken,
    version,
    configured:
      /^\d{5,30}$/.test(pixelId) &&
      Boolean(accessToken) &&
      /^v\d+\.\d+$/.test(version),
  };
}
export async function flushMetaOutbox(
  db: D1Database,
  transport: typeof fetch = fetch,
  limit = 20,
) {
  const config = metaConfig();
  if (!config.configured) return { status: 'not_configured', sent: 0 };
  const rows = await db
    .prepare(
      "SELECT id,payload,event_name FROM commerce_outbox WHERE status='pending' AND attempts<8 ORDER BY created_at LIMIT ?",
    )
    .bind(Math.max(1, Math.min(20, limit)))
    .all<{ id: string; payload: string; event_name: string }>();
  let sent = 0;
  for (const row of rows.results) {
    // Several storefront requests may flush concurrently. Claim each row with
    // a conditional update before contacting Meta so only one worker can send
    // a given event_id.
    const claim = await db
      .prepare(
        "UPDATE commerce_outbox SET status='processing' WHERE id=? AND status='pending'",
      )
      .bind(row.id)
      .run();
    if ((claim.meta?.changes || 0) !== 1) continue;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(row.payload);
    } catch {
      await db
        .prepare(
          "UPDATE commerce_outbox SET status='failed',attempts=attempts+1,last_error='invalid_payload' WHERE id=?",
        )
        .bind(row.id)
        .run();
      continue;
    }
    if (payload.consent !== true) {
      await db
        .prepare("UPDATE commerce_outbox SET status='not_consented' WHERE id=?")
        .bind(row.id)
        .run();
      continue;
    }
    delete payload.consent;
    try {
      const response = await transport(
        `https://graph.facebook.com/${config.version}/${config.pixelId}/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: [payload],
            ...(process.env.META_TEST_EVENT_CODE
              ? { test_event_code: process.env.META_TEST_EVENT_CODE }
              : {}),
          }),
          signal: AbortSignal.timeout(4000),
        },
      );
      // Never persist raw vendor error bodies or credentials.
      if (!response.ok)
        throw new Error(
          response.status === 429 ? 'rate_limited' : 'provider_rejected',
        );
      const body = (await response.json()) as { events_received?: number };
      if (body.events_received !== 1) throw new Error('receipt_unverified');
      await db
        .prepare(
          "UPDATE commerce_outbox SET status='sent',attempts=attempts+1,last_error=NULL,delivered_at=? WHERE id=?",
        )
        .bind(new Date().toISOString(), row.id)
        .run();
      sent++;
    } catch (error) {
      const reason =
        error instanceof Error &&
        ['rate_limited', 'provider_rejected', 'receipt_unverified'].includes(
          error.message,
        )
          ? error.message
          : 'network_error';
      await db
        .prepare(
          "UPDATE commerce_outbox SET status='pending',attempts=attempts+1,last_error=? WHERE id=?",
        )
        .bind(reason, row.id)
        .run();
    }
  }
  return { status: 'processed', sent };
}
