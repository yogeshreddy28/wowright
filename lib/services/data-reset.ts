export const resetScopes = [
  'orders',
  'customers',
  'production',
  'delivery',
  'payments',
  'reviews',
  'quotes',
  'conversations',
  'analytics',
  'companion_analytics',
] as const;

export type ResetScope = (typeof resetScopes)[number];

export type ResetPreview = {
  eligible: Record<ResetScope, number>;
  details: {
    orderItems: number;
    productionAllocations: number;
    deliveryStops: number;
    deliveryProofs: number;
    paymentCollections: number;
    orderCosts: number;
    uploadedFiles: number;
    commerceOutbox: number;
  };
  preserved: {
    products: number;
    productImages: number;
    categories: number;
    settings: number;
    adminUsers: number;
    deliveryPeople: number;
    aiSettings: number;
  };
  unclassified: {
    orders: number;
    customers: number;
    conversations: number;
    analytics: number;
    deliveryRuns: number;
    customRequests: number;
  };
};

export type ClassificationPreview = {
  token: string;
  primary: {
    orders: number;
    customers: number;
    conversations: number;
    analytics: number;
    deliveryRuns: number;
    customRequests: number;
    metaOutbox: number;
  };
  related: {
    orderItems: number;
    customizations: number;
    timelines: number;
    productionAllocations: number;
    deliveryStops: number;
    deliveryProofs: number;
    payments: number;
    costs: number;
    reviews: number;
    customerAddresses: number;
    customerSessions: number;
    visitorSessions: number;
    carts: number;
    conversationMessages: number;
    uploadedFiles: number;
  };
};

type ClassificationSnapshot = ClassificationPreview & {
  ids: Record<string, string[]>;
};

async function count(db: D1Database, sql: string) {
  const row = await db.prepare(sql).first<{ count: number }>();
  return Number(row?.count || 0);
}

async function ids(db: D1Database, sql: string) {
  const rows = await db.prepare(sql).all<{ id: string }>();
  return rows.results.map((row) => row.id).sort();
}

async function digest(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function classificationSnapshot(db: D1Database): Promise<ClassificationSnapshot> {
  const [orders, customers, conversations, analytics, deliveryRuns, customRequests, metaOutbox] = await Promise.all([
    ids(db, 'SELECT id FROM orders WHERE is_test=0'),
    ids(db, 'SELECT id FROM customers WHERE is_test=0'),
    ids(db, 'SELECT id FROM conversations WHERE is_test=0'),
    ids(db, 'SELECT id FROM analytics_events WHERE is_test=0'),
    ids(db, 'SELECT id FROM delivery_batches WHERE is_test=0'),
    ids(db, 'SELECT id FROM custom_quote_requests WHERE is_test=0'),
    ids(db, 'SELECT id FROM commerce_outbox WHERE is_test=0'),
  ]);
  const captured = { orders, customers, conversations, analytics, deliveryRuns, customRequests, metaOutbox };
  const token = await digest(JSON.stringify(captured));
  const relatedValues = await Promise.all([
    count(db, 'SELECT COUNT(*) count FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.is_test=0'),
    count(db, 'SELECT COUNT(*) count FROM order_item_customizations c JOIN order_items i ON i.id=c.order_item_id JOIN orders o ON o.id=i.order_id WHERE o.is_test=0'),
    count(db, 'SELECT COUNT(*) count FROM order_timeline t JOIN orders o ON o.id=t.order_id WHERE o.is_test=0'),
    count(db, 'SELECT COUNT(*) count FROM production_allocations a JOIN order_items i ON i.id=a.order_item_id JOIN orders o ON o.id=i.order_id WHERE o.is_test=0'),
    count(db, 'SELECT COUNT(*) count FROM delivery_stops s JOIN delivery_batches b ON b.id=s.batch_id WHERE b.is_test=0'),
    count(db, 'SELECT COUNT(*) count FROM delivery_proofs p JOIN orders o ON o.id=p.order_id WHERE o.is_test=0'),
    count(db, 'SELECT COUNT(*) count FROM payment_collections p JOIN orders o ON o.id=p.order_id WHERE o.is_test=0'),
    count(db, 'SELECT COUNT(*) count FROM order_costs c JOIN orders o ON o.id=c.order_id WHERE o.is_test=0'),
    count(db, 'SELECT COUNT(*) count FROM reviews r JOIN order_items i ON i.id=r.order_item_id JOIN orders o ON o.id=i.order_id WHERE o.is_test=0'),
    count(db, 'SELECT COUNT(*) count FROM customer_addresses a JOIN customers c ON c.id=a.customer_id WHERE c.is_test=0'),
    count(db, 'SELECT COUNT(*) count FROM customer_sessions s JOIN customers c ON c.id=s.customer_id WHERE c.is_test=0'),
    count(db, 'SELECT COUNT(*) count FROM sessions s WHERE s.customer_id IN (SELECT id FROM customers WHERE is_test=0) OR s.id IN (SELECT session_id FROM orders WHERE is_test=0 AND session_id IS NOT NULL) OR s.id IN (SELECT session_id FROM conversations WHERE is_test=0) OR s.id IN (SELECT session_id FROM analytics_events WHERE is_test=0 AND session_id IS NOT NULL)'),
    count(db, 'SELECT COUNT(*) count FROM carts WHERE session_id IN (SELECT s.id FROM sessions s WHERE s.customer_id IN (SELECT id FROM customers WHERE is_test=0) OR s.id IN (SELECT session_id FROM orders WHERE is_test=0 AND session_id IS NOT NULL) OR s.id IN (SELECT session_id FROM conversations WHERE is_test=0) OR s.id IN (SELECT session_id FROM analytics_events WHERE is_test=0 AND session_id IS NOT NULL))'),
    count(db, 'SELECT COUNT(*) count FROM conversation_messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.is_test=0'),
    count(db, 'SELECT COUNT(*) count FROM uploaded_files f JOIN custom_quote_requests q ON q.id=f.quote_request_id WHERE q.is_test=0'),
  ]);
  return {
    token,
    ids: captured,
    primary: {
      orders: orders.length, customers: customers.length, conversations: conversations.length,
      analytics: analytics.length, deliveryRuns: deliveryRuns.length,
      customRequests: customRequests.length, metaOutbox: metaOutbox.length,
    },
    related: {
      orderItems: relatedValues[0], customizations: relatedValues[1], timelines: relatedValues[2],
      productionAllocations: relatedValues[3], deliveryStops: relatedValues[4], deliveryProofs: relatedValues[5],
      payments: relatedValues[6], costs: relatedValues[7], reviews: relatedValues[8],
      customerAddresses: relatedValues[9], customerSessions: relatedValues[10], visitorSessions: relatedValues[11],
      carts: relatedValues[12], conversationMessages: relatedValues[13], uploadedFiles: relatedValues[14],
    },
  };
}

export async function getOperationalClassificationPreview(db: D1Database): Promise<ClassificationPreview> {
  const { ids: _ids, ...preview } = await classificationSnapshot(db);
  return preview;
}

function markStatements(db: D1Database, table: string, values: string[]) {
  const chunks: D1PreparedStatement[] = [];
  for (let offset = 0; offset < values.length; offset += 80) {
    const part = values.slice(offset, offset + 80);
    chunks.push(db.prepare(`UPDATE ${table} SET is_test=1 WHERE id IN (${part.map(() => '?').join(',')})`).bind(...part));
  }
  return chunks;
}

export async function classifyCurrentOperationalData(
  db: D1Database,
  expectedToken: string,
) {
  const snapshot = await classificationSnapshot(db);
  if (!expectedToken || snapshot.token !== expectedToken)
    throw new Error('OPERATIONAL_DATA_CHANGED');
  const statements = [
    ...markStatements(db, 'orders', snapshot.ids.orders),
    ...markStatements(db, 'customers', snapshot.ids.customers),
    ...markStatements(db, 'conversations', snapshot.ids.conversations),
    ...markStatements(db, 'analytics_events', snapshot.ids.analytics),
    ...markStatements(db, 'delivery_batches', snapshot.ids.deliveryRuns),
    ...markStatements(db, 'custom_quote_requests', snapshot.ids.customRequests),
    ...markStatements(db, 'commerce_outbox', snapshot.ids.metaOutbox),
    db.prepare('INSERT INTO admin_audit_events(id,action,metadata,created_at) VALUES(?,?,?,?)').bind(
      crypto.randomUUID(), 'operational_data_classified_as_test',
      JSON.stringify({ primary: snapshot.primary, related: snapshot.related }), new Date().toISOString(),
    ),
  ];
  await db.batch(statements);
  return { classified: snapshot.primary, related: snapshot.related };
}

const testOrder = 'EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id AND o.is_test=1)';

export async function getDataResetPreview(db: D1Database): Promise<ResetPreview> {
  const values = await Promise.all([
    count(db, 'SELECT COUNT(*) count FROM orders WHERE is_test=1'),
    count(db, "SELECT COUNT(*) count FROM customers c WHERE c.is_test=1 AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.customer_id=c.id AND o.is_test=0)"),
    count(db, "SELECT COUNT(*) count FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.is_test=1 AND (i.production_status<>'queued' OR i.scheduled_date IS NOT NULL OR i.qc_checklist IS NOT NULL OR i.qc_passed_at IS NOT NULL OR i.packed_at IS NOT NULL OR i.reprint_count<>0 OR EXISTS(SELECT 1 FROM production_allocations a WHERE a.order_item_id=i.id))"),
    count(db, 'SELECT COUNT(*) count FROM delivery_batches WHERE is_test=1'),
    count(db, `SELECT COUNT(*) count FROM payment_collections WHERE ${testOrder}`),
    count(db, 'SELECT COUNT(*) count FROM reviews r JOIN order_items i ON i.id=r.order_item_id JOIN orders o ON o.id=i.order_id WHERE o.is_test=1'),
    count(db, 'SELECT COUNT(*) count FROM custom_quote_requests WHERE is_test=1'),
    count(db, 'SELECT COUNT(*) count FROM conversations WHERE is_test=1'),
    count(db, "SELECT COUNT(*) count FROM analytics_events WHERE is_test=1 AND name NOT LIKE 'companion_%'"),
    count(db, "SELECT COUNT(*) count FROM analytics_events WHERE is_test=1 AND name LIKE 'companion_%'"),
    count(db, 'SELECT COUNT(*) count FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.is_test=1'),
    count(db, 'SELECT COUNT(*) count FROM production_allocations a JOIN order_items i ON i.id=a.order_item_id JOIN orders o ON o.id=i.order_id WHERE o.is_test=1'),
    count(db, 'SELECT COUNT(*) count FROM delivery_stops s JOIN delivery_batches b ON b.id=s.batch_id WHERE b.is_test=1'),
    count(db, 'SELECT COUNT(*) count FROM delivery_proofs p JOIN orders o ON o.id=p.order_id WHERE o.is_test=1'),
    count(db, `SELECT COUNT(*) count FROM payment_collections WHERE ${testOrder}`),
    count(db, `SELECT COUNT(*) count FROM order_costs WHERE ${testOrder}`),
    count(db, 'SELECT COUNT(*) count FROM uploaded_files f JOIN custom_quote_requests q ON q.id=f.quote_request_id WHERE q.is_test=1'),
    count(db, 'SELECT COUNT(*) count FROM commerce_outbox WHERE is_test=1'),
    count(db, 'SELECT COUNT(*) count FROM products'),
    count(db, 'SELECT (SELECT COUNT(*) FROM product_images)+COALESCE((SELECT SUM(json_array_length(images)) FROM products),0) count'),
    count(db, 'SELECT COUNT(*) count FROM categories'),
    count(db, 'SELECT COUNT(*) count FROM settings'),
    count(db, 'SELECT COUNT(*) count FROM admin_users'),
    count(db, 'SELECT COUNT(*) count FROM delivery_people'),
    count(db, 'SELECT COUNT(*) count FROM ai_provider_settings'),
    count(db, 'SELECT COUNT(*) count FROM orders WHERE is_test=0'),
    count(db, 'SELECT COUNT(*) count FROM customers WHERE is_test=0'),
    count(db, 'SELECT COUNT(*) count FROM conversations WHERE is_test=0'),
    count(db, 'SELECT COUNT(*) count FROM analytics_events WHERE is_test=0'),
    count(db, 'SELECT COUNT(*) count FROM delivery_batches WHERE is_test=0'),
    count(db, 'SELECT COUNT(*) count FROM custom_quote_requests WHERE is_test=0'),
  ]);
  return {
    eligible: {
      orders: values[0], customers: values[1], production: values[2],
      delivery: values[3], payments: values[4], reviews: values[5],
      quotes: values[6], conversations: values[7], analytics: values[8],
      companion_analytics: values[9],
    },
    details: {
      orderItems: values[10], productionAllocations: values[11], deliveryStops: values[12],
      deliveryProofs: values[13], paymentCollections: values[14], orderCosts: values[15],
      uploadedFiles: values[16], commerceOutbox: values[17],
    },
    preserved: {
      products: values[18], productImages: values[19], categories: values[20], settings: values[21],
      adminUsers: values[22], deliveryPeople: values[23], aiSettings: values[24],
    },
    unclassified: {
      orders: values[25], customers: values[26], conversations: values[27], analytics: values[28],
      deliveryRuns: values[29], customRequests: values[30],
    },
  };
}

function statementsForScope(
  db: D1Database,
  scope: ResetScope,
): D1PreparedStatement[] {
  switch (scope) {
    case 'production':
      return [
        db.prepare('DELETE FROM production_allocations WHERE order_item_id IN (SELECT i.id FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.is_test=1)'),
        db.prepare("UPDATE order_items SET production_status='queued',scheduled_date=NULL,qc_checklist=NULL,qc_passed_at=NULL,packed_at=NULL,reprint_count=0,updated_at=? WHERE order_id IN (SELECT id FROM orders WHERE is_test=1)").bind(new Date().toISOString()),
      ];
    case 'delivery':
      return [
        db.prepare('DELETE FROM delivery_proofs WHERE order_id IN (SELECT id FROM orders WHERE is_test=1)'),
        db.prepare('DELETE FROM delivery_stops WHERE batch_id IN (SELECT id FROM delivery_batches WHERE is_test=1) OR order_id IN (SELECT id FROM orders WHERE is_test=1)'),
        db.prepare('DELETE FROM delivery_batches WHERE is_test=1'),
      ];
    case 'payments':
      return [
        db.prepare('DELETE FROM payment_collections WHERE order_id IN (SELECT id FROM orders WHERE is_test=1)'),
        db.prepare('DELETE FROM order_costs WHERE order_id IN (SELECT id FROM orders WHERE is_test=1)'),
        db.prepare("UPDATE orders SET payment_status='unpaid',payment_method=NULL,updated_at=? WHERE is_test=1").bind(new Date().toISOString()),
      ];
    case 'reviews':
      return [db.prepare('DELETE FROM reviews WHERE order_item_id IN (SELECT i.id FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.is_test=1)')];
    case 'quotes':
      return [
        db.prepare('DELETE FROM uploaded_files WHERE quote_request_id IN (SELECT id FROM custom_quote_requests WHERE is_test=1)'),
        db.prepare('DELETE FROM custom_quote_requests WHERE is_test=1'),
      ];
    case 'conversations':
      return [db.prepare('DELETE FROM conversations WHERE is_test=1')];
    case 'analytics':
      return [
        db.prepare('DELETE FROM commerce_outbox WHERE is_test=1'),
        db.prepare("DELETE FROM analytics_events WHERE is_test=1 AND name NOT LIKE 'companion_%'"),
      ];
    case 'companion_analytics':
      return [db.prepare("DELETE FROM analytics_events WHERE is_test=1 AND name LIKE 'companion_%'")];
    case 'customers':
      return [
        db.prepare('DELETE FROM sessions WHERE customer_id IN (SELECT c.id FROM customers c WHERE c.is_test=1 AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.customer_id=c.id))'),
        db.prepare('DELETE FROM customers WHERE is_test=1 AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.customer_id=customers.id)'),
      ];
    case 'orders':
      return [
        ...statementsForScope(db, 'production'), ...statementsForScope(db, 'delivery'), ...statementsForScope(db, 'payments'),
        ...statementsForScope(db, 'reviews'),
        db.prepare('DELETE FROM commerce_outbox WHERE order_id IN (SELECT id FROM orders WHERE is_test=1)'),
        db.prepare('UPDATE custom_quote_requests SET order_id=NULL WHERE order_id IN (SELECT id FROM orders WHERE is_test=1)'),
        db.prepare('DELETE FROM orders WHERE is_test=1'),
      ];
  }
}

export async function resetTestData(db: D1Database, scopes: ResetScope[]) {
  const unique = [...new Set(scopes)];
  if (!unique.length || unique.some((scope) => !resetScopes.includes(scope)))
    throw new Error('Choose at least one valid reset option.');
  const before = await getDataResetPreview(db);
  // When orders are removed their dependent operational records must be removed first.
  const all = resetScopes.every((scope) => unique.includes(scope));
  const effective = unique.includes('orders')
    ? unique.filter((s) => !['production', 'delivery', 'payments', 'reviews'].includes(s))
    : unique;
  const statements = effective.flatMap((scope) => statementsForScope(db, scope));
  if (all) {
    statements.unshift(
      db.prepare(`DELETE FROM sessions
        WHERE (customer_id IN (SELECT id FROM customers WHERE is_test=1)
          OR id IN (SELECT session_id FROM orders WHERE is_test=1 AND session_id IS NOT NULL)
          OR id IN (SELECT session_id FROM conversations WHERE is_test=1)
          OR id IN (SELECT session_id FROM analytics_events WHERE is_test=1 AND session_id IS NOT NULL))
        AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.session_id=sessions.id AND o.is_test=0)
        AND NOT EXISTS(SELECT 1 FROM conversations c WHERE c.session_id=sessions.id AND c.is_test=0)
        AND NOT EXISTS(SELECT 1 FROM analytics_events e WHERE e.session_id=sessions.id AND e.is_test=0)`),
      db.prepare('DELETE FROM abuse_limits'),
    );
  }
  statements.push(
    db.prepare('INSERT INTO admin_audit_events(id,action,metadata,created_at) VALUES(?,?,?,?)').bind(
      crypto.randomUUID(), 'test_data_reset', JSON.stringify({ scopes: unique, eligibleBefore: before.eligible }), new Date().toISOString(),
    ),
  );
  await db.batch(statements);
  return { before, after: await getDataResetPreview(db), scopes: unique };
}
