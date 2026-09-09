import { AppShell } from '@/components/app-shell';
export default function Terms() {
  return (
    <AppShell>
      <article className="legal-page">
        <p className="eyebrow">Last updated 1 September 2026</p>
        <h1>Terms</h1>
        <h2>Orders and confirmation</h2>
        <p>
          Submitting checkout saves an order request; it does not confirm
          payment or production. Your order becomes confirmed only after we
          agree the payment or COD method with you on WhatsApp and update the
          order status.
        </p>
        <h2>Custom products</h2>
        <p>
          Personalized and custom-made products are manufactured from
          customer-approved details. You are responsible for reviewing names,
          spelling, dimensions and reference material before production.
        </p>
        <h2>Timelines and delivery</h2>
        <p>
          Lead times are estimates and may change after design review. We will
          communicate material changes before confirming production.
        </p>
        <h2>Files and rights</h2>
        <p>
          You must have permission to use files, brands and artwork you submit.
          We may decline requests that appear unsafe, unlawful or technically
          unsuitable.
        </p>
      </article>
    </AppShell>
  );
}
