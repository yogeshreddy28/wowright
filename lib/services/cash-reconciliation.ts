import { CommerceError } from './launch-rules';

export type CashSummary = { collected: number; handedOver: number; held: number };
export function calculateCashHeld(collected: number, handedOver: number): CashSummary {
  if (![collected, handedOver].every(Number.isSafeInteger) || collected < 0 || handedOver < 0 || handedOver > collected)
    throw new CommerceError('Invalid cash reconciliation amount.');
  return { collected, handedOver, held: collected - handedOver };
}

export async function getCashSummary(db: D1Database, personId: string) {
  const row = await db.prepare(`SELECT
    COALESCE((SELECT SUM(pc.amount_collected) FROM payment_collections pc JOIN orders o ON o.id=pc.order_id WHERE pc.person_id=? AND pc.method='cash' AND o.is_test=0),0) collected,
    COALESCE((SELECT SUM(cs.amount) FROM cash_settlements cs WHERE cs.person_id=?),0) handed_over`).bind(personId, personId).first<{ collected: number; handed_over: number }>();
  return calculateCashHeld(Number(row?.collected || 0), Number(row?.handed_over || 0));
}

export async function recordCashSettlement(db: D1Database, personId: string, amount: number, note = '') {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new CommerceError('Enter a valid cash handover amount.');
  const person = await db.prepare('SELECT id FROM delivery_people WHERE id=?').bind(personId).first();
  if (!person) throw new CommerceError('Delivery person not found.', 404);
  const now = new Date().toISOString();
  const inserted = await db.prepare(`INSERT INTO cash_settlements(id,person_id,amount,note,actor,created_at)
    SELECT ?,?,?,?,?,?
    WHERE ? <= (
      COALESCE((SELECT SUM(pc.amount_collected) FROM payment_collections pc JOIN orders o ON o.id=pc.order_id WHERE pc.person_id=? AND pc.method='cash' AND o.is_test=0),0)
      - COALESCE((SELECT SUM(cs.amount) FROM cash_settlements cs WHERE cs.person_id=?),0)
    )`).bind(crypto.randomUUID(), personId, amount, note || null, 'admin', now, amount, personId, personId).run();
  if (!inserted.meta.changes) throw new CommerceError('Handover cannot exceed the cash currently held.');
  await db.prepare('INSERT INTO admin_audit_events(id,action,metadata,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(), 'delivery_cash_handover_recorded', JSON.stringify({ personId, amount }), now).run();
  return getCashSummary(db, personId);
}
