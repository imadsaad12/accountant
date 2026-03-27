import Link from "next/link";
import type { Metadata } from "next";
import { BackButton } from "./BackButton";

export const metadata: Metadata = {
  title: "Terms of Service — Cashent",
  description: "Terms and conditions for using the Cashent platform.",
};

export default function TermsPage() {
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
          <h1 className="text-3xl font-bold text-text-primary mb-2">Terms of Service</h1>
          <p className="text-text-muted text-sm">Last updated: March 27, 2026</p>
        </div>

        <div className="space-y-10 text-text-secondary leading-relaxed">

          {/* 1 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Cashent (&ldquo;the platform&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;), you agree to be bound by
              these Terms of Service and our Privacy Policy. If you do not agree to these terms, you may not use the platform.
            </p>
            <p className="mt-3">
              These terms apply to all users, including organization administrators and team members accessing the platform
              under an organization account.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">2. Description of Service</h2>
            <p>
              Cashent is a cloud-based business management platform that provides tools for invoicing, expense tracking,
              client and supplier management, employee management, inventory, financial reporting, and related features.
            </p>
            <p className="mt-3">
              We reserve the right to modify, suspend, or discontinue any part of the service at any time with reasonable
              notice. We will not be liable to you or any third party for any modification, suspension, or discontinuation.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">3. Account Registration</h2>
            <p>
              To use Cashent, you must register for an account and provide accurate, complete, and up-to-date information.
              You are responsible for maintaining the confidentiality of your login credentials and for all activity that
              occurs under your account.
            </p>
            <p className="mt-3">
              You must notify us immediately if you suspect unauthorized access to your account. We are not liable for any
              loss resulting from unauthorized use of your account.
            </p>
            <p className="mt-3">
              One organization account may have multiple team members. The organization administrator is responsible for
              managing team access and permissions.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">4. Acceptable Use</h2>
            <p>You agree not to use Cashent to:</p>
            <ul className="list-disc list-inside mt-3 space-y-1.5 text-text-secondary">
              <li>Violate any applicable law or regulation</li>
              <li>Upload or transmit fraudulent, misleading, or illegal financial data</li>
              <li>Attempt to gain unauthorized access to any part of the platform or another user&apos;s account</li>
              <li>Reverse-engineer, decompile, or otherwise attempt to extract the source code of the platform</li>
              <li>Use the platform in any way that could damage, disable, or impair its operation</li>
              <li>Resell or sublicense access to the platform without our written consent</li>
            </ul>
            <p className="mt-3">
              We reserve the right to suspend or terminate accounts that violate these terms without prior notice.
            </p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">5. Your Data</h2>
            <p>
              You retain full ownership of all data you enter into Cashent, including clients, invoices, employees,
              expenses, and financial records. We do not claim any ownership rights over your data.
            </p>
            <p className="mt-3">
              By using the platform, you grant us a limited license to store, process, and display your data solely
              for the purpose of providing the service to you.
            </p>
            <p className="mt-3">
              You are responsible for ensuring that the data you enter complies with applicable laws, including data
              protection regulations in your jurisdiction.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">6. Data Security</h2>
            <p>
              We implement reasonable technical and organizational measures to protect your data against unauthorized
              access, loss, or destruction. However, no system is completely secure and we cannot guarantee absolute security.
            </p>
            <p className="mt-3">
              In the event of a data breach that affects your account, we will notify you in accordance with applicable law.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">7. Intellectual Property</h2>
            <p>
              All intellectual property rights in the Cashent platform — including software, design, logos, and content
              created by us — are owned by or licensed to Cashent. Nothing in these terms transfers any of those rights to you.
            </p>
            <p className="mt-3">
              You may not copy, reproduce, distribute, or create derivative works from any part of the platform without
              our prior written consent.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">8. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Cashent shall not be liable for any indirect, incidental, special,
              consequential, or punitive damages arising from your use of, or inability to use, the platform.
            </p>
            <p className="mt-3">
              Cashent is a tool to assist with business management. It does not provide legal, financial, tax, or accounting
              advice. You are solely responsible for the accuracy of the data you enter and any decisions made based on
              information generated by the platform.
            </p>
            <p className="mt-3">
              Our total liability to you for any claim arising from these terms or your use of the platform shall not
              exceed the amount you paid us in the three months preceding the claim.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">9. Account Termination</h2>
            <p>
              You may request deletion of your organization account at any time through the Settings page. Upon a deletion
              request, your account will be marked for deletion and permanently removed after 30 days.
            </p>
            <p className="mt-3">
              Within that 30-day window, you may contact us to cancel the deletion. After 30 days, all data associated
              with your organization will be permanently and irreversibly deleted.
            </p>
            <p className="mt-3">
              We reserve the right to terminate accounts that violate these terms, with or without notice.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">10. Changes to These Terms</h2>
            <p>
              We may update these Terms of Service from time to time. When we do, we will update the &ldquo;Last updated&rdquo; date
              at the top of this page. Continued use of the platform after changes are posted constitutes your acceptance
              of the updated terms.
            </p>
            <p className="mt-3">
              For material changes, we will make reasonable efforts to notify you in advance.
            </p>
          </section>

          {/* 11 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">11. Governing Law</h2>
            <p>
              These terms are governed by and construed in accordance with applicable law. Any disputes arising from these
              terms or your use of the platform shall be resolved through good-faith negotiation before resorting to
              formal legal proceedings.
            </p>
          </section>

          {/* 12 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">12. Contact</h2>
            <p>If you have any questions about these Terms of Service, please contact us:</p>
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
          <p>These terms were last reviewed on March 27, 2026.</p>
          <p className="mt-2">
            <BackButton label="← Go back" />
          </p>
        </div>
      </div>
    </div>
  );
}
