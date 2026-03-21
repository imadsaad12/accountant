export default function CashentLogo({ className = "" }: { className?: string }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-outfit), 'Helvetica Neue', Arial, sans-serif",
        fontWeight: 700,
        letterSpacing: "-0.02em",
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
