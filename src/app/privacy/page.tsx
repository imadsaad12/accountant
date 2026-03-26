import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Cashent",
  description: "How Cashent collects, uses, and protects your business data.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-dark-bg text-text-primary">
      {/* Header */}
      <div className="border-b border-dark-border bg-dark-card">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/login" className="font-bold text-lg text-accent tracking-tight">
            Cashent
          </Link>
          <Link href="/login" className="text-sm text-text-muted hover:text-text-primary transition-colors">
            ← Back to Login
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-text-primary mb-2">Privacy Policy</h1>
          <p className="text-text-muted text-sm">Last updated: March 26, 2026</p>
        </div>

        <div className="space-y-10 text-text-secondary leading-relaxed">

          {/* 1 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">1. Introduction</h2>
            <p>
              Cashent (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;the platform&rdquo;) is a cloud-based business management application
              that helps organizations manage invoices, expenses, clients, employees, inventory, and financial reporting.
              This Privacy Policy explains what data we collect, how we use it, and your rights regarding your information.
            </p>
            <p className="mt-3">
              By creating an account or using Cashent, you agree to this policy.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">2. Who This Applies To</h2>
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-accent mt-1">•</span>
                <span><strong className="text-text-primary">Organization administrators</strong> — who create and manage an organization account</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-1">•</span>
                <span><strong className="text-text-primary">Team members (employees)</strong> — who are added to an organization by an administrator</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent mt-1">•</span>
                <span><strong className="text-text-primary">Visitors</strong> — who access the platform without an account</span>
              </li>
            </ul>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">3. What Data We Collect</h2>

            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">3.1 Account &amp; Organization Data</h3>
                <ul className="space-y-1.5 text-sm">
                  {["Organization name", "Administrator name, email address, and password (stored as a bcrypt hash — never in plain text)", "Team member names, usernames, and passwords (hashed)", "Organization settings (default currency, timezone, phone country, default tax rate)"].map(item => (
                    <li key={item} className="flex items-start gap-2"><span className="text-accent mt-1 shrink-0">•</span><span>{item}</span></li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">3.2 Business Data You Enter</h3>
                <p className="text-sm mb-2">This is data you actively input into the platform:</p>
                <ul className="space-y-1.5 text-sm">
                  {[
                    "Clients: names, emails, phone numbers, addresses, tax IDs",
                    "Suppliers: names, contact details, payment terms, billing records",
                    "Invoices: line items, amounts, tax rates, discounts, payment records, notes",
                    "Expenses: descriptions, amounts, categories, vendors, recurrence settings",
                    "Employees: names, positions, departments, salaries, hire dates, employment status",
                    "Salary advances: amounts, dates, repayment status",
                    "Products / Inventory: names, SKUs, prices, costs, stock quantities",
                    "Financial reports: profit & loss, balance sheet, aging data (computed from the above)",
                  ].map(item => (
                    <li key={item} className="flex items-start gap-2"><span className="text-accent mt-1 shrink-0">•</span><span>{item}</span></li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">3.3 Activity &amp; Audit Data</h3>
                <p className="text-sm">
                  A log of all create, edit, and delete actions performed within your organization, including which user
                  performed the action and when. This is used for accountability and audit trails.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">3.4 AI Assistant Data</h3>
                <p className="text-sm">
                  When you use the AI Assistant feature, your message <strong className="text-text-primary">and a snapshot of your
                  organization&apos;s business data</strong> (clients, invoices, employees, expenses, products) is sent to{" "}
                  <strong className="text-text-primary">Anthropic&apos;s API</strong> to generate a response. This includes names,
                  amounts, and identifiers from your account. See Section 6 for details.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">3.5 Technical Data</h3>
                <ul className="space-y-1.5 text-sm">
                  {["IP address and browser information (for security and session management)", "Session tokens stored in encrypted HTTP-only cookies", "Error logs (no personal data, used for debugging)"].map(item => (
                    <li key={item} className="flex items-start gap-2"><span className="text-accent mt-1 shrink-0">•</span><span>{item}</span></li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">4. How We Use Your Data</h2>
            <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden text-sm">
              <table className="w-full">
                <thead className="bg-dark-bg/60">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Purpose</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Data Used</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-border/50">
                  {[
                    ["Providing the service (invoices, reports, etc.)", "All business data you enter"],
                    ["Authentication and security", "Email, hashed password, session token"],
                    ["AI assistant responses", "Business data snapshot + your message"],
                    ["Audit trail / accountability", "Action logs per user"],
                    ["Improving the platform", "Anonymized usage patterns"],
                  ].map(([purpose, data]) => (
                    <tr key={purpose}>
                      <td className="px-4 py-3 text-text-secondary">{purpose}</td>
                      <td className="px-4 py-3 text-text-muted">{data}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm mt-3">
              We do <strong className="text-text-primary">not</strong> use your financial data for advertising, profiling,
              or any purpose outside of operating the service.
            </p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">5. Data Storage &amp; Security</h2>
            <ul className="space-y-2 text-sm">
              {[
                "All data is stored in a secured cloud database with encrypted connections (TLS/SSL)",
                "Passwords are hashed using bcrypt and are never stored or transmitted in plain text",
                "All communication between your browser and our servers uses HTTPS",
                "Session tokens expire after 6 months of inactivity and are invalidated on logout",
                "Access to your organization's data is strictly isolated — no other organization can access your data",
              ].map(item => (
                <li key={item} className="flex items-start gap-2"><span className="text-accent mt-1 shrink-0">•</span><span>{item}</span></li>
              ))}
            </ul>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">6. Third-Party Services</h2>

            <div className="space-y-5">
              <div className="bg-dark-card border border-dark-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-text-primary mb-2">Anthropic (AI Assistant)</h3>
                <p className="text-sm mb-3">
                  When you use the AI Assistant, your query and a context snapshot of your business data is sent to{" "}
                  <strong className="text-text-primary">Anthropic</strong> to power responses. This may include client names,
                  invoice amounts, employee salaries, and expense records.
                </p>
                <ul className="space-y-1.5 text-sm">
                  <li className="flex items-start gap-2"><span className="text-accent mt-1 shrink-0">•</span><span>Anthropic&apos;s privacy policy: <span className="text-accent">anthropic.com/privacy</span></span></li>
                  <li className="flex items-start gap-2"><span className="text-accent mt-1 shrink-0">•</span><span>You can avoid sharing data with Anthropic by not using the AI Assistant feature</span></li>
                  <li className="flex items-start gap-2"><span className="text-accent mt-1 shrink-0">•</span><span>AI-generated action requests (e.g., bulk updates) are only executed after your explicit confirmation</span></li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">Database Hosting</h3>
                <p className="text-sm">
                  Your data is stored with a cloud database provider. Data is encrypted at rest and in transit.
                  We do not authorize the hosting provider to use your data for any purpose other than storage.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">No Other Third Parties</h3>
                <p className="text-sm">
                  We do not sell, rent, or share your data with advertisers, analytics platforms, or any other
                  third parties beyond those listed above.
                </p>
              </div>
            </div>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">7. Data Retention</h2>
            <ul className="space-y-2 text-sm">
              {[
                "Your data is retained for as long as your account is active",
                "If you request account deletion, your organization's data (clients, invoices, employees, expenses, etc.) will be permanently deleted within 30 days",
                "Activity logs are retained for 12 months for security purposes, then deleted",
                "Backups may retain data for up to 30 additional days after deletion before being fully purged",
              ].map(item => (
                <li key={item} className="flex items-start gap-2"><span className="text-accent mt-1 shrink-0">•</span><span>{item}</span></li>
              ))}
            </ul>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">8. Employee Data &amp; Admin Responsibility</h2>
            <p className="text-sm mb-3">
              Organization administrators have full access to all data within their organization, including employee
              salaries, advances, and personal details. Administrators are responsible for:
            </p>
            <ul className="space-y-2 text-sm mb-3">
              {[
                "Informing their employees that their data is managed within Cashent",
                "Ensuring they have the right to enter and process employee personal data",
                "Managing team member access levels appropriately",
              ].map(item => (
                <li key={item} className="flex items-start gap-2"><span className="text-accent mt-1 shrink-0">•</span><span>{item}</span></li>
              ))}
            </ul>
            <p className="text-sm">
              Team members (non-admin users) do not have visibility into other employees&apos; personal or financial
              data unless granted permission by an administrator.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">9. Your Rights</h2>
            <p className="text-sm mb-3">Depending on your location, you may have the following rights:</p>
            <ul className="space-y-2 text-sm">
              {[
                ["Access", "Request a copy of the data we hold about you"],
                ["Correction", "Request correction of inaccurate data"],
                ["Deletion", "Request deletion of your account and all associated data"],
              ].map(([right, desc]) => (
                <li key={right} className="flex items-start gap-2">
                  <span className="text-accent mt-1 shrink-0">•</span>
                  <span><strong className="text-text-primary">{right}:</strong> {desc}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm mt-3">
              To exercise any of these rights, contact us at{" "}
              <a href="mailto:privacy@cashent.com" className="text-accent hover:underline">privacy@cashent.com</a>.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">10. Cookies</h2>
            <p className="text-sm mb-3">
              Cashent uses a single session cookie to keep you logged in. This cookie is:
            </p>
            <ul className="space-y-2 text-sm">
              {[
                ["HTTP-only", "not accessible by JavaScript"],
                ["Secure", "only sent over HTTPS"],
                ["Session-based", "with a 6-month expiry"],
              ].map(([attr, desc]) => (
                <li key={attr} className="flex items-start gap-2">
                  <span className="text-accent mt-1 shrink-0">•</span>
                  <span><strong className="text-text-primary">{attr}</strong> — {desc}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm mt-3">
              We do not use tracking cookies, advertising cookies, or third-party analytics cookies.
            </p>
          </section>

          {/* 12 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">12. Changes to This Policy</h2>
            <p className="text-sm">
              We may update this policy as the platform evolves. When we make significant changes, we will notify
              administrators by email or via an in-app notice. Continued use of the platform after changes constitutes
              acceptance of the updated policy.
            </p>
          </section>

          {/* 13 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">13. Contact</h2>
            <p className="text-sm mb-3">For privacy-related questions, data requests, or concerns:</p>
            <div className="bg-dark-card border border-dark-border rounded-xl p-4 text-sm space-y-1">
              <p><strong className="text-text-primary">Email:</strong> <a href="mailto:privacy@cashent.com" className="text-accent hover:underline">privacy@cashent.com</a></p>
              <p><strong className="text-text-primary">Platform:</strong> Cashent</p>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-dark-border text-center text-xs text-text-muted">
          <p>This policy was last reviewed on March 26, 2026.</p>
          <p className="mt-2">
            <Link href="/login" className="text-accent hover:underline">Back to Login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
