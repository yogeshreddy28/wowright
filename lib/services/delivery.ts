import { LAUNCH_COMMERCE } from './launch-rules';
export type DeliveryConfig = {
  baseCharge: number;
  freeThreshold: number | null;
  localAreas: string[];
};
export const defaultDeliveryConfig: DeliveryConfig = {
  baseCharge: LAUNCH_COMMERCE.deliveryCharge,
  freeThreshold: LAUNCH_COMMERCE.freeDeliveryThreshold,
  localAreas: ['Bangalore', 'Bengaluru'],
};
export function getDeliveryAmount(
  subtotal: number,
  config = defaultDeliveryConfig,
  override?: number,
) {
  if (override !== undefined) return Math.max(0, override);
  return config.freeThreshold && subtotal >= config.freeThreshold
    ? 0
    : config.baseCharge;
}
export async function getDeliveryConfig(
  _db: D1Database,
): Promise<DeliveryConfig> {
  // Preserve legacy settings rows; approved V1 policy takes precedence.
  return { ...defaultDeliveryConfig };
}
export async function getPaymentConfig(db: D1Database) {
  try {
    const rows = await db
      .prepare(
        "SELECT key,value FROM settings WHERE key IN ('codEnabled','upiEnabled')",
      )
      .all<{ key: string; value: string }>();
    const values = Object.fromEntries(
      rows.results.map((row) => {
        try {
          return [row.key, JSON.parse(row.value)];
        } catch {
          return [row.key, row.value];
        }
      }),
    );
    return {
      codEnabled: values.codEnabled !== false,
      upiEnabled: values.upiEnabled !== false,
    };
  } catch {
    return { codEnabled: true, upiEnabled: true };
  }
}
