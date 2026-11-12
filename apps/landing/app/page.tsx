import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { SecurityExplained } from "@/components/SecurityExplained";
import { Features } from "@/components/Features";
import { HowToStart } from "@/components/HowToStart";
import { Comparison } from "@/components/Comparison";
import { Pricing } from "@/components/Pricing";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-primary-soft">
      <Nav />
      <Hero />
      <HowItWorks />
      <SecurityExplained />
      <Features />
      <HowToStart />
      <Comparison />
      <Pricing />
      <Footer />
    </main>
  );
}
