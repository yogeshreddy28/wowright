import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
export const metadata: Metadata = {
  title: 'Order & Delivery Policies',
  description:
    'Cancellation, made-to-order, transit damage and inspection information for WOW RIGHT orders.',
};
export default function PoliciesPage() {
  return (
    <AppShell>
      <section className="legal-page">
        <p className="eyebrow">Clear before you order</p>
        <h1>Order & delivery policies</h1>
        <section>
          <h2>Made-to-order products</h2>
          <p>
            WOW RIGHT products are made after an order is confirmed. Production
            and delivery estimates shown on a product or order are estimates,
            not a promise of same-day completion.
          </p>
        </section>
        <section>
          <h2>Cancellation</h2>
          <p>
            Normal orders can be cancelled from My Orders while confirmed and
            not yet printing. Once printing begins, contact support. For custom
            products, review and approve the specification and price before full
            UPI payment. After approval, payment and production start, ordinary
            cancellation is not offered. Any payment adjustment is confirmed by the owner.
          </p>
        </section>
        <section>
          <h2>Transit damage</h2>
          <p>
            If an item arrives damaged, keep the product and packaging and
            contact WOW RIGHT promptly with the order number and clear photos.
            We will review the order and condition before confirming the
            available resolution.
          </p>
        </section>
        <section>
          <h2>Open-box inspection</h2>
          <p>
            At WOW RIGHT delivery, inspect the correct item, selected finish and
            visible condition before accepting it. Our delivery person asks for
            consent before taking a private proof-of-delivery photo. If you do
            not consent, contact the owner to arrange an alternative record.
          </p>
        </section>
        <section><h2>After acceptance & your rights</h2><p>Ordinary change-of-mind returns are not offered after accepted open-box delivery. This does not limit applicable statutory rights for defective, deficient, incorrect, misrepresented or otherwise legally protected goods. Contact WOW RIGHT for an appropriate remedy.</p></section>
        <section><h2>Bengaluru launch delivery</h2><p>Minimum product subtotal: ₹499. Delivery is ₹49 below ₹999 and free from ₹999. Checkout validates your written address, Bengaluru PIN and location pin. Delivery dates depend on actual production capacity; same-day delivery is not standard.</p></section>
        <section>
          <h2>Replacement review</h2>
          <p>
            Replacement requests are assessed using the order record,
            personalization, package condition and evidence supplied. A
            replacement is not considered approved until WOW RIGHT confirms it.
          </p>
        </section>
      </section>
    </AppShell>
  );
}
