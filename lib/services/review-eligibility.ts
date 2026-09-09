export type ReviewPromptItem = { item_id: string; product_name: string; order_number: string; image?: string };
export function nextReviewPrompt(items: ReviewPromptItem[], dismissedAt: (id: string) => number, now = Date.now()) {
  return items.find((item) => dismissedAt(item.item_id) < now - 3 * 86400000) || null;
}

export function deliveredOrderReviewPrompt({
  status,
  previousStatus,
  items,
  dismissedAt,
  now = Date.now(),
}: {
  status: string;
  previousStatus?: string;
  items: ReviewPromptItem[];
  dismissedAt: (id: string) => number;
  now?: number;
}) {
  if (status !== 'delivered') return null;
  if (previousStatus && previousStatus !== 'delivered') return items[0] || null;
  return nextReviewPrompt(items, dismissedAt, now);
}
