import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";
import { Comparison } from "@/components/Comparison";
import { TranslationDemo } from "@/components/TranslationDemo";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-primary-soft">
      <Hero />
      <Features />
      <TranslationDemo />
      <Comparison />
      <Footer />
    </main>
  );
}
