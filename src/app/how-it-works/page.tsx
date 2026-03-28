import { Metadata } from "next";
import HowItWorksPage from "@/components/HowItWorksPage";

export const metadata: Metadata = {
  title: "How It Works — Cashent",
  description: "Learn how Cashent's accounting features work with detailed explanations, formulas, and examples.",
};

export default function Page() {
  return <HowItWorksPage />;
}
