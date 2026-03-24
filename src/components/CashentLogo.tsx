export default function CashentLogo({ className = "" }: { className?: string }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-oooh-baby), cursive",
        fontWeight: 400,
        background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}
      className={className}
    >
      Cashent
    </span>
  );
}
