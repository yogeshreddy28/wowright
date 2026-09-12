import type { CheckoutCustomer } from '../domain';
import { formatMoney } from './pricing';
export type WhatsAppOrder = {
  orderNumber: string;
  customer: CheckoutCustomer;
  items: {
    name: string;
    quantity: number;
    selections: Record<string, string | number | boolean>;
    unitPrice: number;
  }[];
  subtotal: number;
  deliveryAmount: number;
  total: number;
  paymentStatus: string;
};
export function createWhatsAppOrderMessage(order: WhatsAppOrder) {
  const itemLines = order.items
    .map((item, i) => {
      const options = Object.entries(item.selections)
        .filter(([k]) => k !== 'quantity')
        .map(([k, v]) => `${k[0].toUpperCase() + k.slice(1)}: ${String(v)}`)
        .join('\n');
      return `${i ? '\n' : ''}Product: ${item.name}\n${options}${options ? '\n' : ''}Quantity: ${item.quantity}\nAmount: ${formatMoney(item.unitPrice * item.quantity)}`;
    })
    .join('\n');
  return `Hi WOW RIGHT, I'd like to confirm my order.\n\nOrder: #${order.orderNumber}\nCustomer: ${order.customer.name}\n\n${itemLines}\n\nProduct subtotal: ${formatMoney(order.subtotal)}\nDelivery: ${formatMoney(order.deliveryAmount)}\nTotal: ${formatMoney(order.total)}\n\nDelivery area: ${order.customer.locality}\nPayment status: Awaiting confirmation\n\nI'd like to confirm my payment/delivery option.`;
}
export function createWhatsAppOrderURL(
  order: WhatsAppOrder,
  number = process.env.WHATSAPP_BUSINESS_NUMBER || '919353193080',
) {
  const normalized = number.replace(/\D/g, '');
  if (!/^\d{10,15}$/.test(normalized))
    throw new Error('WhatsApp number is not configured');
  return `https://wa.me/${normalized}?text=${encodeURIComponent(createWhatsAppOrderMessage(order))}`;
}
export function createUPIPaymentURL(
  order: { orderNumber: string; total: number },
  number = process.env.WHATSAPP_BUSINESS_NUMBER || '919353193080',
) {
  const normalized = number.replace(/\D/g, '');
  if (!/^\d{10,15}$/.test(normalized))
    throw new Error('WhatsApp number is not configured');
  const message = `Hi, I want to complete UPI payment for WOW RIGHT order ${order.orderNumber}. Order total: ${formatMoney(order.total)}.`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function createWhatsAppInterestURL(
  context: { productName?: string; productURL?: string } = {},
  number = process.env.WHATSAPP_BUSINESS_NUMBER || '919353193080',
) {
  const normalized = number.replace(/\D/g, '');
  if (!/^\d{10,15}$/.test(normalized))
    throw new Error('WhatsApp number is not configured');
  const message = context.productName
    ? `Hi WOW RIGHT, I'm interested in ${context.productName}.${context.productURL ? ` ${context.productURL}` : ''}`
    : 'Hi WOW RIGHT, I visited your website and would like some help.';
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function createOrderUpdateURL(
  order: {
    orderNumber: string;
    status: string;
    mobile: string;
    deliveryDate?: string;
    deliveryWindow?: string;
  },
  siteURL = process.env.SITE_URL || 'http://localhost:3000',
) {
  const labels: Record<string, string> = {
    confirmed: 'Confirmed',
    scheduled: 'Scheduled for Delivery',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
  };
  if (!labels[order.status]) return null;
  const phone = order.mobile.replace(/\D/g, '');
  if (!/^91[6-9]\d{9}$/.test(phone)) return null;
  const tracking = new URL(
    '/order/' + encodeURIComponent(order.orderNumber),
    siteURL,
  ).toString();
  const schedule =
    order.status === 'scheduled' && order.deliveryDate
      ? `\nScheduled date: ${order.deliveryDate}${order.deliveryWindow ? ' · ' + order.deliveryWindow : ''}`
      : '';
  return `https://wa.me/${phone}?text=${encodeURIComponent(`WOW RIGHT order ${order.orderNumber}: ${labels[order.status]}.${schedule}\nTrack your order (sign-in required): ${tracking}`)}`;
}
export function createHumanHandoffURL(
  context: {
    sessionId: string;
    product?: string;
    selections?: Record<string, unknown>;
    summary?: string;
  },
  number = process.env.WHATSAPP_BUSINESS_NUMBER || '919353193080',
) {
  const safeSession = context.sessionId.slice(0, 8).toUpperCase();
  const selections = Object.entries(context.selections || {})
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join('\n');
  const message = `Hi WOW RIGHT, I need help with my order.\n\nReference: ${safeSession}${context.product ? `\nProduct: ${context.product}` : ''}${selections ? `\n${selections}` : ''}${context.summary ? `\n\n${context.summary}` : ''}\n\nI would like to talk to someone.`;
  return `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}
