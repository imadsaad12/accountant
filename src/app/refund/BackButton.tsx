"use client";

export function BackButton({ label }: { label: string }) {
  return (
    <button
      onClick={() => window.history.back()}
      className="text-sm text-text-muted hover:text-text-primary transition-colors"
    >
      {label}
    </button>
  );
}
