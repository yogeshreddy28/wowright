import { AppShell } from '@/components/app-shell';
export default function Privacy() {
  return (
    <AppShell>
      <article className="legal-page">
        <p className="eyebrow">Last updated 1 September 2026</p>
        <h1>Privacy</h1>
        <h2>What we collect</h2>
        <p>
          We collect the contact, delivery, customization, conversation and
          order information you provide so we can respond, manufacture and
          deliver your products. Custom reference files are private by default.
        </p>
        <h2>How we use it</h2>
        <p>
          We use this information to provide quotes, save carts and sessions,
          fulfill orders, provide customer support, prevent abuse and understand
          non-invasive site funnel events. We do not sell personal information.
        </p>
        <h2>Storage and access</h2>
        <p>
          Customer and order records are stored in our application database.
          Uploaded files are stored in private object storage. Only authorized
          administrators access these records. Delivery personnel see only
          their assigned stops, contact details, address, location pin and amount due.
        </p>
        <h2>Delivery location and proof</h2><p>Your precise delivery location is stored with the order for navigation. We ask for consent before a delivery-proof photo is taken; the proof is private and accessible to the owner, not displayed publicly. Optional review photos are public only when you choose to publish them.</p>
        <h2>Optional advertising measurement</h2><p>With your permission, Meta receives limited ecommerce events and a hashed session identifier to measure advertising. The optional measurement choice does not affect checkout. Internal order and operational records remain necessary to fulfill orders. We do not infer sensitive personal characteristics.</p>
        <h2>Your choices</h2>
        <p>
          You can request access, correction or deletion by contacting us. Some
          order records may need to be retained for legal or operational
          reasons.
        </p>
      </article>
    </AppShell>
  );
}
