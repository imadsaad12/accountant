"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import CashentLogo from "@/components/CashentLogo";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  BarChart3, FileText, Package, TrendingUp,
  Bot, Shield, Globe, ChevronRight, ArrowRight,
  Receipt, UserCog, Activity, Zap, CheckCircle, X, TriangleAlert, Menu, Mail, MessageCircle,
  Truck, Banknote,
} from "lucide-react";

// ─── Intersection observer fade-in ───────────────────────────────────────────
function useFadeIn(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, visible };
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ images, startIndex, onClose }: {
  images: { src: string; alt: string }[];
  startIndex: number;
  onClose: () => void;
}) {
  const [active, setActive] = useState(startIndex);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    // Blur the page content directly
    const root = document.getElementById("landing-root");
    if (root) {
      root.style.transition = "filter 250ms ease";
      root.style.filter = "blur(8px)";
    }

    // Lock scroll without layout shift
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "ArrowRight") setActive(i => (i + 1) % images.length);
      if (e.key === "ArrowLeft")  setActive(i => (i - 1 + images.length) % images.length);
    };
    document.addEventListener("keydown", onKey);

    return () => {
      // Unblur page
      if (root) root.style.filter = "";

      // Restore scroll position
      const y = parseInt(document.body.style.top || "0") * -1;
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      window.scrollTo(0, y);

      document.removeEventListener("keydown", onKey);
    };
  }, [images.length]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
      style={{ animation: "lbOverlay 250ms ease forwards" }}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        className="absolute top-5 right-5 z-10 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        onClick={onClose}
      >
        <X size={18} className="text-white" />
      </button>

      {/* Image + dots */}
      <div
        className="flex flex-col items-center gap-5 px-4"
        style={{ animation: "lbContent 280ms ease forwards" }}
        onClick={e => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={active}
          src={images[active].src}
          alt={images[active].alt}
          className="rounded-xl border border-white/10 shadow-2xl object-contain"
          style={{
            maxWidth: "min(85vw, 1100px)",
            maxHeight: "75vh",
            display: "block",
            animation: "lbImg 200ms ease forwards",
          }}
        />

        {/* Dots */}
        {images.length > 1 && (
          <div className="flex gap-2.5">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={`rounded-full transition-all duration-300 ${i === active ? "bg-white w-5 h-2.5" : "bg-white/35 hover:bg-white/60 w-2.5 h-2.5"}`}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes lbOverlay  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes lbContent  { from { opacity: 0; transform: scale(0.93) translateY(14px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes lbImg      { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>,
    document.body
  );
}

// ─── Dot Carousel ────────────────────────────────────────────────────────────
function Carousel({ images }: { images: { src: string; alt: string }[] }) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const next = useCallback(() => setActive(i => (i + 1) % images.length), [images.length]);

  useEffect(() => {
    if (lightbox !== null) return; // pause auto-cycle while lightbox is open
    const t = setInterval(next, 3500);
    return () => clearInterval(t);
  }, [next, lightbox]);

  return (
    <>
      <div
        className="group relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/60 transition-all duration-500 ease-out cursor-zoom-in hover:shadow-indigo-500/20 hover:shadow-2xl hover:border-indigo-500/30"
        onClick={() => setLightbox(active)}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent z-10 pointer-events-none" />
        {/* Image stack — all absolute, cross-fade via opacity + scale */}
        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
          {images.map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={img.src}
              src={img.src}
              alt={img.alt}
              className="absolute inset-0 w-full h-full object-contain"
              style={{
                opacity: i === active ? 1 : 0,
                transition: "opacity 700ms ease-in-out",
              }}
            />
          ))}
        </div>
        {/* Dots */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); setActive(i); }}
              className={`rounded-full transition-all duration-300 ${i === active ? "bg-white w-4 h-2" : "bg-white/40 hover:bg-white/70 w-2 h-2"}`}
            />
          ))}
        </div>
      </div>

      {lightbox !== null && (
        <Lightbox images={images} startIndex={lightbox} onClose={() => setLightbox(null)} />
      )}
    </>
  );
}

// ─── Single screenshot ────────────────────────────────────────────────────────
function Screenshot({ src, alt }: { src: string; alt: string }) {
  const [lightbox, setLightbox] = useState(false);

  return (
    <>
      <div
        className="group relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/60 transition-all duration-500 ease-out cursor-zoom-in hover:shadow-indigo-500/20 hover:shadow-2xl hover:border-indigo-500/30"
        onClick={() => setLightbox(true)}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent z-10 pointer-events-none" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="w-full h-auto"
        />
      </div>

      {lightbox && (
        <Lightbox images={[{ src, alt }]} startIndex={0} onClose={() => setLightbox(false)} />
      )}
    </>
  );
}

// ─── Feature card ────────────────────────────────────────────────────────────
function FeatureCard({ icon: Icon, title, desc, color }: { icon: React.ElementType; title: string; desc: string; color: string }) {
  return (
    <div className="group p-4 sm:p-6 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:border-indigo-500/40 hover:bg-white/[0.06] transition-all duration-300">
      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center mb-3 sm:mb-4 ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <h3 className="text-white font-semibold mb-1.5 text-sm sm:text-base">{title}</h3>
      <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

// ─── Showcase section (text + single or carousel) ─────────────────────────────
function ShowcaseSection({
  badge, title, subtitle, description, images, reverse = false,
}: {
  badge: string; title: string; subtitle: string; description: string;
  images: { src: string; alt: string }[];
  reverse?: boolean;
}) {
  const { ref, visible } = useFadeIn();
  return (
    <div
      ref={ref}
      className={`flex flex-col ${reverse ? "lg:flex-row-reverse" : "lg:flex-row"} gap-12 lg:gap-20 items-center transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
    >
      <div className="flex-1 space-y-6">
        <span className="inline-block text-xs font-semibold tracking-widest text-indigo-400 uppercase bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full">
          {badge}
        </span>
        <h2 className="text-3xl lg:text-4xl font-bold text-white leading-tight">{title}</h2>
        <p className="text-lg text-indigo-300 font-medium">{subtitle}</p>
        <p className="text-slate-400 leading-relaxed">{description}</p>
      </div>
      <div className="flex-1 w-full">
        {images.length > 1
          ? <Carousel images={images} />
          : <Screenshot src={images[0].src} alt={images[0].alt} />
        }
      </div>
    </div>
  );
}

// ─── Language section ─────────────────────────────────────────────────────────
function LanguageSection() {
  const { ref, visible } = useFadeIn();
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
      <div ref={ref} className={`rounded-3xl bg-gradient-to-br from-indigo-600/20 via-purple-600/10 to-transparent border border-indigo-500/20 p-6 sm:p-12 text-center transition-all duration-700 ${visible ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}>
        <Globe size={36} className="text-indigo-400 mx-auto mb-6" />
        <h2 className="text-3xl font-bold text-white mb-4">Works in 3 languages</h2>
        <p className="text-slate-400 text-lg max-w-xl mx-auto mb-8">
          Switch between English, French, and Arabic per user. The AI assistant auto-detects your language and responds naturally.
        </p>
        <div className="flex justify-center gap-6 flex-wrap">
          {["🇬🇧 English", "🇫🇷 Français", "🇱🇧 العربية"].map((lang) => (
            <span key={lang} className="px-4 py-2 bg-white/[0.06] border border-white/10 rounded-lg text-slate-300 text-sm font-medium">{lang}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [scrollY, setScrollY] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showContact, setShowContact] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const heroFade     = useFadeIn(0.05);
  const featuresFade = useFadeIn();
  const statsFade    = useFadeIn();
  const pricingFade  = useFadeIn();

  // Image map — matching exact filenames in public/screenshots/
  const S = (name: string) => `/screenshots/${encodeURIComponent(name)}`;

  return (
    <div id="landing-root" className="min-h-screen bg-[#080b12] text-white overflow-x-hidden">

      {/* Navbar */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrollY > 20 || mobileMenuOpen ? "bg-[#080b12]/95 backdrop-blur-xl border-b border-white/[0.06]" : ""}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CashentLogo className="text-4xl" />
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
            <a href="#features" onClick={e => { e.preventDefault(); document.getElementById("features")?.scrollIntoView({ behavior: "smooth" }); }} className="hover:text-white transition-colors cursor-pointer">Features</a>
            <a href="#showcase" onClick={e => { e.preventDefault(); document.getElementById("showcase")?.scrollIntoView({ behavior: "smooth" }); }} className="hover:text-white transition-colors cursor-pointer">See it in action</a>
            <a href="#pricing"  onClick={e => { e.preventDefault(); document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" }); }} className="hover:text-white transition-colors cursor-pointer">Pricing</a>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="hidden sm:block text-sm text-slate-400 hover:text-white transition-colors px-3 py-2">Sign In</Link>
            <Link href="/register" className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-3 sm:px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap">
              Free Trial
            </Link>
            <button
              className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              onClick={() => setMobileMenuOpen(o => !o)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/[0.06] bg-[#080b12]/95 backdrop-blur-xl">
            <div className="px-4 py-3 space-y-1">
              {[
                { label: "Features",        id: "features"  },
                { label: "See it in action", id: "showcase"  },
                { label: "Pricing",          id: "pricing"   },
              ].map(({ label, id }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  onClick={e => {
                    e.preventDefault();
                    setMobileMenuOpen(false);
                    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="block px-3 py-3 text-slate-300 hover:text-white hover:bg-white/[0.06] rounded-lg text-sm font-medium transition-colors"
                >
                  {label}
                </a>
              ))}
              <div className="pt-2 border-t border-white/[0.06]">
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-3 py-3 text-slate-400 hover:text-white text-sm transition-colors"
                >
                  Sign In
                </Link>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative pt-24 sm:pt-32 pb-16 sm:pb-20 px-4 sm:px-6">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px]" />
          <div className="absolute top-40 left-1/4 w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[100px]" />
          <div className="absolute top-40 right-1/4 w-[400px] h-[400px] bg-cyan-600/10 rounded-full blur-[100px]" />
        </div>

        <div ref={heroFade.ref} className={`relative max-w-5xl mx-auto text-center space-y-8 transition-all duration-1000 ${heroFade.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm px-4 py-1.5 rounded-full">
            <Zap size={13} className="text-indigo-400" />
            AI-Powered Business Management
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold leading-tight tracking-tight">
            Run your business
            <br />
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              with clarity
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Invoices, expenses, inventory, payroll, suppliers, salary advances and AI-powered insights. All in one platform.
            Built for SMBs. Works in English, French, and Arabic.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register" className="group flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3.5 rounded-xl font-semibold text-base transition-all duration-200 shadow-lg shadow-indigo-600/30 hover:-translate-y-0.5">
              Start 15-day free trial
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
          <p className="text-slate-500 text-sm">No credit card required · Cancel anytime</p>
        </div>

        {/* Hero carousel — Dashboard1 + Dashboard2 */}
        <div className="relative max-w-6xl mx-auto mt-16">
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-[#080b12] z-10 pointer-events-none" />
          <div
            className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/80 transition-shadow duration-500 hover:shadow-indigo-500/10 hover:border-indigo-500/20"
            style={{ transform: `perspective(1200px) rotateX(${Math.min(scrollY * 0.015, 6)}deg)`, transition: "transform 0.1s ease-out, box-shadow 0.5s ease, border-color 0.5s ease" }}
          >
            <Carousel images={[
              { src: S("Dashboard1.png"), alt: "Dashboard overview" },
              { src: S("Dashboard2.png"), alt: "Dashboard charts" },
            ]} />
          </div>
        </div>
      </section>

      {/* Stats */}
      <div ref={statsFade.ref} className={`max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16 transition-all duration-700 ${statsFade.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center border-y border-white/[0.06] py-10">
          {[
            { value: "15 min", label: "Setup time" },
            { value: "3",      label: "Languages supported" },
            { value: "99.9%",  label: "Uptime" },
            { value: "100%",   label: "Data accuracy" },
          ].map(s => (
            <div key={s.label}>
              <div className="text-3xl font-bold text-white mb-1">{s.value}</div>
              <div className="text-slate-500 text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <div ref={featuresFade.ref} className={`text-center mb-16 transition-all duration-700 ${featuresFade.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <p className="text-indigo-400 text-sm font-semibold tracking-widest uppercase mb-4">Everything you need</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">One platform, zero spreadsheets</h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">Replace 6 different tools with one connected system that keeps every number consistent.</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <FeatureCard icon={FileText}   title="Smart Invoicing"    color="bg-indigo-500/20"  desc="Live preview, payment tracking, overpayment to client credit, and auto status updates." />
          <FeatureCard icon={TrendingUp} title="Financial Reports"  color="bg-emerald-500/20" desc="P&L, balance sheet and receivables aging from live data. Export to PDF in one click." />
          <FeatureCard icon={Bot}        title="AI Assistant"       color="bg-purple-500/20"  desc="Ask questions or give commands in English, French, or Arabic. The AI reads and acts on your data." />
          <FeatureCard icon={Package}    title="Stock & Inventory"  color="bg-amber-500/20"   desc="Simple and composite products, low-stock alerts, auto deduction on invoice, and PDF export." />
          <FeatureCard icon={Truck}      title="Supplier Management" color="bg-teal-500/20"   desc="Track supplier bills, record payments, monitor outstanding balances and export to PDF." />
          <FeatureCard icon={Banknote}   title="Salary Advances"    color="bg-pink-500/20"    desc="Record advances, auto-deduct from salary, track pending vs returned vs paid status." />
          <FeatureCard icon={Receipt}    title="Expense Tracking"   color="bg-red-500/20"     desc="One-time and recurring expenses with pro-rata calculations feed into P&L automatically." />
          <FeatureCard icon={UserCog}    title="Employee Payroll"   color="bg-cyan-500/20"    desc="Salary records with weekly or monthly periods that flow into financial calculations." />
          <FeatureCard icon={Shield}     title="Role Permissions"   color="bg-sky-500/20"     desc="Per feature view and edit permissions enforced at the API level." />
          <FeatureCard icon={Activity}   title="Activity Log"       color="bg-orange-500/20"  desc="Full audit trail of who did what, when, across every module." />
        </div>
      </section>

      {/* Showcase */}
      <section id="showcase" className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-20 space-y-16 md:space-y-32">
        <div className="text-center">
          <p className="text-indigo-400 text-sm font-semibold tracking-widest uppercase mb-4">See it in action</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white">Built for how you actually work</h2>
        </div>

        <ShowcaseSection
          badge="Invoicing"
          title="Full invoice lifecycle in one place"
          subtitle="From draft to paid, automatically."
          description="Create invoices with live preview, add line items, apply tax rates and record payments. Overpayments automatically convert to client credit. Status moves from Sent to Partially Paid to Paid as payments come in."
          images={[
            { src: S("Screenshot 2026-04-02 at 7.49.52 PM.png"), alt: "Invoice list with stat cards" },
            { src: S("Screenshot 2026-04-02 at 7.50.07 PM.png"), alt: "Invoice detail with payment history" },
          ]}
        />

        <ShowcaseSection
          badge="Clients"
          title="Your entire client directory with financials"
          subtitle="Invoice history, balances and credit — per client."
          description="Manage clients with full contact details, filter by city, and drill into each client to see their invoices, total billed, paid, pending amounts and credit balance. Export to PDF or record payments directly."
          images={[
            { src: S("new-Clients1.png"), alt: "Clients list with pending amounts" },
            { src: S("new-Clients2.png"), alt: "Client detail with invoice history" },
          ]}
          reverse
        />

        <ShowcaseSection
          badge="Suppliers"
          title="Track every supplier bill and payment"
          subtitle="Total billed, paid and remaining at a glance."
          description="Add suppliers with contact details, create bills with due dates, and record partial or full payments. See total billed, amount paid and remaining balance across all suppliers with PDF export."
          images={[
            { src: S("new-suppliers1.png"), alt: "Supplier list with stat cards" },
            { src: S("new-suplliers2.png"), alt: "Supplier bill detail with payments" },
          ]}
        />

        <ShowcaseSection
          badge="Stock & Inventory"
          title="Simple and composite products in one place"
          subtitle="Auto deduction, low-stock alerts, PDF export."
          description="Create simple products or composite products built from other items. Stock auto-decrements when invoices are created. Track cost vs price, set low-stock thresholds, filter by category or type, and export to PDF."
          images={[
            { src: S("new-stock1.png"), alt: "Stock list with composite products" },
            { src: S("new-stock2.png"), alt: "Add product form" },
          ]}
          reverse
        />

        <ShowcaseSection
          badge="Financial Reports"
          title="Profit & Loss in seconds, not hours"
          subtitle="Real numbers, not estimates."
          description="Select a date range and generate P&L or comprehensive reports covering revenue, COGS, tax, operating expenses, salaries and net profit — all from live data. Exclude categories, see examples inline, and export to PDF."
          images={[{ src: S("new-report.png"), alt: "Financial Reports with P&L and comprehensive view" }]}
        />

        <ShowcaseSection
          badge="Salary Advances"
          title="Advance tracking with auto salary deduction"
          subtitle="Pending, deducted, or returned — always clear."
          description="Record salary advances given to employees. Advances are automatically deducted from their next salary calculation. Track total advanced, returned and outstanding amounts. Three statuses: Pending, Deducted from Salary, and Returned."
          images={[{ src: S("new-salaryadvance.png"), alt: "Salary advances with status tracking" }]}
          reverse
        />

        <ShowcaseSection
          badge="AI Assistant"
          title="Ask your AI anything about your business"
          subtitle="English, French and Arabic. Fully supported."
          description="Your AI assistant has full context of your live business data. Ask about revenue, check overdue clients, or tell it to create invoices, add expenses and update records. It can also export PDFs for clients, stock, employees and suppliers."
          images={[{ src: S("Ai assistance.png"), alt: "AI Assistant" }]}
        />

        <ShowcaseSection
          badge="Expenses"
          title="Every expense tracked, categorized, reported"
          subtitle="One-time and recurring, with pro-rata calculations."
          description="Log expenses with categories like rent, salaries, software and marketing. Set recurring expenses (weekly, monthly, quarterly, yearly) and they auto-calculate pro-rata for any report period."
          images={[{ src: S("Expenses.png"), alt: "Expenses" }]}
          reverse
        />

        <ShowcaseSection
          badge="Team & Tax"
          title="Control access and stay compliant"
          subtitle="Permissions and tax visibility in one place."
          description="Set granular view and edit permissions per feature for each team member. Monitor tax collected across all invoices regardless of payment status, broken down by invoice, rate and amount."
          images={[
            { src: S("Team.png"), alt: "Team management" },
            { src: S("Tax.png"),  alt: "Tax overview" },
          ]}
        />

        <ShowcaseSection
          badge="Employees & Activity"
          title="Your team and a full audit trail"
          subtitle="Know who did what, and manage payroll in one place."
          description="Store employee records with weekly or monthly salary periods. Salary data feeds into expense calculations and P&L automatically. Every action across the platform is logged with user, timestamp and description."
          images={[
            { src: S("Employee.png"),     alt: "Employees" },
            { src: S("Activity Log.png"), alt: "Activity Log" },
          ]}
          reverse
        />
      </section>

      <LanguageSection />

      {/* Pricing */}
      <section id="pricing" className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <div ref={pricingFade.ref} className={`transition-all duration-700 ${pricingFade.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <div className="text-center mb-16">
            <p className="text-indigo-400 text-sm font-semibold tracking-widest uppercase mb-4">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Simple, transparent pricing</h2>
            <p className="text-slate-400">Start free for 15 days. No credit card required.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {/* Trial card */}
            <div className="relative rounded-2xl border border-white/10 p-8 bg-white/[0.02]">
              <div className="mb-6">
                <p className="text-slate-400 text-sm mb-1">Trial</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white">Free</span>
                  <span className="text-slate-400">15 days</span>
                </div>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  { t: "Core features included", ok: true },
                  { t: "Up to 2 users", ok: false },
                  { t: "50,000 AI tokens", ok: false },
                  { t: "15 days validity", ok: false },
                ].map(f => (
                  <li key={f.t} className="flex items-center gap-2 text-sm">
                    {f.ok ? <CheckCircle size={14} className="text-indigo-400 shrink-0" /> : <TriangleAlert size={14} className="text-amber-400 shrink-0" />}
                    <span className={f.ok ? "text-slate-300" : "text-amber-200/80"}>{f.t}</span>
                  </li>
                ))}
              </ul>
              <Link href="/register" className="block text-center py-2.5 rounded-xl text-sm font-semibold transition-colors border border-white/10 hover:border-white/20 text-slate-300 hover:text-white">
                Start free trial
              </Link>
            </div>

            {/* Basic card */}
            <div className="relative rounded-2xl border border-white/10 p-8 bg-white/[0.02]">
              <div className="mb-6">
                <p className="text-slate-400 text-sm mb-1">Basic</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold text-white">$49.99</span>
                  <span className="text-slate-400">/month</span>
                </div>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  { t: "Core features included", ok: true },
                  { t: "1–3 users", ok: true },
                  { t: "1,000,000 AI tokens", ok: true },
                  { t: "Priority support", ok: true },
                ].map(f => (
                  <li key={f.t} className="flex items-center gap-2 text-sm">
                    {f.ok ? <CheckCircle size={14} className="text-indigo-400 shrink-0" /> : <X size={14} className="text-red-400 shrink-0" />}
                    <span className={f.ok ? "text-slate-300" : "text-slate-500"}>{f.t}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setShowContact(true)}
                className="block w-full text-center py-2.5 rounded-xl text-sm font-semibold transition-colors border border-white/10 hover:border-white/20 text-slate-300 hover:text-white"
              >
                Contact us
              </button>
            </div>

            {/* Pro card */}
            <div className="relative rounded-2xl border border-indigo-500/50 p-8 bg-indigo-600/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-xs font-bold px-3 py-1 rounded-full">Most Popular</div>
              <div className="mb-6">
                <p className="text-slate-400 text-sm mb-1">Pro</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold text-white">$79.99</span>
                  <span className="text-slate-400">/month</span>
                </div>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  { t: "Core features included", ok: true },
                  { t: "Audit log", ok: true },
                  { t: "Salary advances", ok: true },
                  { t: "Unlimited users", ok: true },
                  { t: "2,000,000 AI tokens", ok: true },
                  { t: "Priority support", ok: true },
                ].map(f => (
                  <li key={f.t} className="flex items-center gap-2 text-sm">
                    <CheckCircle size={14} className="text-indigo-400 shrink-0" />
                    <span className="text-slate-300">{f.t}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setShowContact(true)}
                className="block w-full text-center py-2.5 rounded-xl text-sm font-semibold transition-colors bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                Contact us
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-20 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">Ready to take control of your finances?</h2>
        <p className="text-slate-400 text-lg mb-10 max-w-xl mx-auto">
          Join businesses that use Cashent to manage invoices, track expenses and get AI-powered insights. Get started in minutes.
        </p>
        <Link href="/register" className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-10 py-4 rounded-xl font-semibold text-lg transition-all duration-200 shadow-xl shadow-indigo-600/30 hover:-translate-y-0.5">
          Start your free trial <ChevronRight size={18} />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <CashentLogo className="text-3xl" />
          </div>
          <p className="text-slate-500 text-sm">© 2026 Cashent. All rights reserved.</p>
          <div className="flex gap-6 text-sm text-slate-500 flex-wrap justify-center md:justify-end">
            <a href="/how-it-works" className="hover:text-white transition-colors">How It Works</a>
            <a href="/privacy" className="hover:text-white transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-white transition-colors">Terms</a>
            <Link href="/login" className="hover:text-white transition-colors">Sign In</Link>
          </div>
        </div>
      </footer>

      {/* Contact Popup */}
      {showContact && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowContact(false)}>
          <div className="bg-[#0f1623] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-white">Get in touch</h3>
              <button onClick={() => setShowContact(false)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                <X size={16} className="text-white" />
              </button>
            </div>
            <p className="text-slate-400 text-sm mb-5">Choose how you'd like to reach us — we typically respond within a few hours.</p>
            <div className="flex flex-col gap-3">
              <a
                href="mailto:imad.alhaj.saad@gmail.com?subject=Interested%20in%20Cashent%20Pro&body=Hi%2C%0A%0AI%27m%20interested%20in%20the%20Pro%20plan.%20Could%20you%20please%20send%20me%20more%20details%3F%0A%0AThanks"
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-indigo-600/20 border border-indigo-500/30 hover:bg-indigo-600/30 transition-colors group"
              >
                <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
                  <Mail size={17} className="text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Email us</div>
                  <div className="text-xs text-slate-400">imad.alhaj.saad@gmail.com</div>
                </div>
              </a>
              <a
                href="https://wa.me/96181360613?text=Hi%2C%0A%0AI%27m%20interested%20in%20Cashent%20Pro.%20Could%20you%20please%20send%20me%20more%20details%3F%0A%0AThanks"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600/30 transition-colors group"
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
                  <MessageCircle size={17} className="text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">WhatsApp</div>
                  <div className="text-xs text-slate-400">+961 81 360 613</div>
                </div>
              </a>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
