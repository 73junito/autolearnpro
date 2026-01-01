import SiteHeader from "@/components/home/SiteHeader";
import Hero from "@/components/home/Hero";
import RolePaths from "@/components/home/RolePaths";
import Capabilities from "@/components/home/Capabilities";
import CoursePreview from "@/components/home/CoursePreview";
import HowItWorks from "@/components/home/HowItWorks";
import SiteFooter from "@/components/home/SiteFooter";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />
      <main id="main">
        <Hero />
        <RolePaths />
        <Capabilities />
        <CoursePreview />
        <HowItWorks />
      </main>
      <SiteFooter />
    </div>
  );
}
