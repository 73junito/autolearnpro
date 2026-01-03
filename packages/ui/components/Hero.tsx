import styles from "../styles/home.module.css";
import { Brand } from "./Brand";

export function Hero() {
  return (
    <section className={styles.hero} aria-label="Homepage hero">
      <div className={styles.heroInner}>
        <div className={styles.heroLeft}>
          <h1 className={styles.h1}>
            Train Technicians. Validate Skills. Certify Competency.
          </h1>
          <p className={styles.lead}>
            Competency-based automotive, diesel, and EV training aligned to industry and federal standards,
            with Canvas-style modules and evidence-based labs.
          </p>

          <div className={styles.heroButtons}>
            <a className={styles.primaryBtn} href="/catalog">Browse Course Catalog</a>
            <a className={styles.secondaryBtn} href="/demo">View Demo Course</a>
          </div>

          <div className={styles.heroMeta}>
            <span>ASE-aligned</span>
            <span>•</span>
            <span>Skills evidence</span>
            <span>•</span>
            <span>Workforce-ready</span>
          </div>
        </div>

        <div className={styles.heroRight}>
          <div className={styles.heroCard}>
            <Brand variant="mark" size="lg" />
          </div>
        </div>
      </div>
    </section>
  );
}
