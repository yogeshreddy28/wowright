import type { Objection } from './types';
const rules: [Objection, RegExp][] = [
  ['PRICE', /price|cost|expensive|discount|budget/i],
  ['DELIVERY', /deliver|shipping|arrive|how long/i],
  ['TRUST', /trust|real|legit|scam|safe/i],
  ['QUALITY', /quality|finish|durable|strong/i],
  ['CUSTOMIZATION', /custom|personal|change|colour|color|text/i],
  ['PAYMENT', /payment|upi|cod|cash|pay/i],
  ['SIZE', /size|dimension|cm|inch/i],
  ['MATERIAL', /material|pla|plastic|resin/i],
  ['GIFT_CHOICE', /gift|birthday|anniversary|present/i],
  ['NOT_READY', /later|not ready|just looking|think about/i],
];
export function classifyObjection(message: string): Objection {
  return rules.find(([, rule]) => rule.test(message))?.[0] || 'OTHER';
}
