import Link from "next/link";
import type { Metadata } from "next";
import { BackButton } from "./BackButton";

export const metadata: Metadata = {
  title: "Refund Policy — Cashent",
  description: "Refund policy for Cashent subscriptions — eligible refunds within 7 days.",
};

export default function RefundPage() {
  return (
    <div className="min-h-screen bg-dark-bg text-text-primary">
      {/* Header */}
      <div className="border-b border-dark-border bg-dark-card">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/login" className="font-bold text-lg text-accent tracking-tight">
            Cashent
          </Link>
          <BackButton label="← Back" />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-text-primary mb-2">Refund Policy</h1>
          <p className="text-text-muted text-sm">Last updated: June 10, 2026</p>
        </div>

        <div className="space-y-10 text-text-secondary leading-relaxed">

          {/* Highlight */}
          <div className="p-4 bg-accent/10 border border-accent/20 rounded-lg">
            <p className="text-text-primary font-medium">
              You can request a full refund within <strong>7 days</strong> of your payment.
            </p>
            <p className="mt-1 text-sm">
              If Cashent isn&rsquo;t the right fit, just reach out within a week of being charged and we&rsquo;ll refund you — no hard feelings.
            </p>
          </div>

          {/* 1 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">1. 7-Day Refund Window</h2>
            <p>
              We want you to be confident in Cashent (&ldquo;the platform&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;). If you are
              not satisfied with a paid subscription, you may request a <strong>full refund within 7 days</strong> of the date the
              payment was made. Requests made after the 7-day window has passed are not eligible for a refund.
            </p>
            <p className="mt-3">
              The 7-day period is calculated from the date and time of the original charge for the current billing cycle.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">2. Eligibility</h2>
            <p>To be eligible for a refund:</p>
            <ul className="mt-3 list-disc list-inside space-y-1.5">
              <li>The refund must be requested within 7 days of the payment.</li>
              <li>The request must come from the account holder or an organization administrator.</li>
              <li>The payment must not have already been refunded or charged back.</li>
            </ul>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">3. How to Request a Refund</h2>
            <p>
              To request a refund, email us at{" "}
              <a href="mailto:info@cashent.app" className="text-accent hover:underline">info@cashent.app</a>{" "}
              from the email address associated with your account. Please include:
            </p>
            <ul className="mt-3 list-disc list-inside space-y-1.5">
              <li>Your account / organization name.</li>
              <li>The email used to sign up.</li>
              <li>The date of the payment you&rsquo;d like refunded.</li>
            </ul>
            <p className="mt-3">
              We&rsquo;ll confirm your request and, once approved, process the refund promptly.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">4. Processing Time</h2>
            <p>
              Approved refunds are issued to the original payment method. Depending on your bank or payment provider, it may
              take several business days for the funds to appear in your account after the refund is processed.
            </p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">5. Free Trial</h2>
            <p>
              Cashent offers a free trial so you can evaluate the platform before paying. During the free trial no charge is
              made, so no refund is necessary. The 7-day refund policy applies only to paid subscription charges.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">6. Cancellations</h2>
            <p>
              You may cancel your subscription at any time to stop future charges. Cancelling stops renewals going forward; it
              does not automatically trigger a refund for a past charge. Refunds for a past charge are governed by the 7-day
              window described above.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">7. Contact</h2>
            <p>If you have any questions about this Refund Policy, please contact us:</p>
            <div className="mt-3 p-4 bg-dark-card border border-dark-border rounded-lg text-sm space-y-1">
              <p><strong className="text-text-primary">Email:</strong>{" "}
                <a href="mailto:info@cashent.app" className="text-accent hover:underline">info@cashent.app</a>
              </p>
              <p><strong className="text-text-primary">Platform:</strong> Cashent</p>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-dark-border text-center text-xs text-text-muted">
          <p>This refund policy was last reviewed on June 10, 2026.</p>
          <p className="mt-2">
            <BackButton label="← Go back" />
          </p>
        </div>
      </div>
    </div>
  );
}
