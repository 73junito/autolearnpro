import styles from "../styles/home.module.css";
import { Header } from "../components/Header";
import { Hero } from "../components/Hero";
import { ProgramCards } from "../components/ProgramCards";
import { HowItWorks } from "../components/HowItWorks";
import { FeaturedCourses } from "../components/FeaturedCourses";

export default function HomePage() {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main">Skip to content</a>

      <Header />

      <main id="main" className={styles.main}>
        <Hero />
        <ProgramCards />
        <HowItWorks />
        <FeaturedCourses />
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerLeft}>
            <strong>AutoLearnPro</strong>
            <div className={styles.muted}>Built for CTE • Workforce • DoD pipelines</div>
          </div>
          <nav className={styles.footerNav} aria-label="Footer">
            <a href="/docs">Docs</a>
            <a href="/accessibility">Accessibility</a>
            <a href="/privacy">Privacy</a>
            <a href="/contact">Contact</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
