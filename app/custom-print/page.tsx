import type { Metadata } from 'next';
import { AppShell } from '@/components/app-shell';
import { CustomQuoteForm } from '@/components/custom-quote-form';
import { CheckCircle2, FileSearch, MessagesSquare } from 'lucide-react';
export const metadata: Metadata = {
  title: 'Create something custom',
  description:
    'Upload a reference, model or photo—or simply describe what you want WOW RIGHT to make.',
};
export default function CustomPrint() {
  return (
    <AppShell>
      <section className="custom-hero">
        <div>
          <p className="eyebrow">Custom 3D print</p>
          <h1>
            Have an idea?
            <br />
            <em>Let’s make it real.</em>
          </h1>
          <p>
            Upload a reference, model or photo — or simply describe what you
            want.
          </p>
          <a className="button primary" href="#custom-request">
            Describe your idea
          </a>
          <div className="custom-mini-steps">
            <span>
              <FileSearch />
              <b>Share</b> your idea
            </span>
            <span>
              <MessagesSquare />
              <b>Review</b> your quote
            </span>
            <span>
              <CheckCircle2 />
              <b>Approve</b> then pay by UPI
            </span>
          </div>
        </div>
        <img
          src="/demo-products/custom-workflow-wide.webp"
          alt="A concept sketch becoming a digital model and finished product"
        />
      </section>
      <section className="custom-form-section" id="custom-request">
        <div className="custom-form-intro">
          <p className="eyebrow">Tell us what you have in mind</p>
          <h2>A useful brief starts here.</h2>
          <p>
            Share the essentials now. We’ll review the idea, references and
            practical details before discussing the quote with you.
          </p>
        </div>
        <CustomQuoteForm />
      </section>
    </AppShell>
  );
}
