import styles from "../styles/home.module.css";

const featured = [
  { title: "Brake Systems (ASE A5)", meta: "Diagnostics • Hydraulics • ABS", href: "/content/courses/01-brake-systems-ase-a5/site/index.html" },
  { title: "Diesel Fuel Systems", meta: "Injection • Common rail • Testing", href: "/content/courses/07-diesel-fuel-systems/site/index.html" },
  { title: "EV Fundamentals", meta: "Safety • Basics • Service workflow", href: "/content/courses/09-electric-vehicle-fundamentals/site/index.html" },
  { title: "Advanced Engine Diagnostics", meta: "Scan tools • Data • Strategy", href: "/content/courses/14-advanced-engine-diagnostics/site/index.html" },
];

export function FeaturedCourses() {
  return (
    <section className={styles.section} aria-label="Featured courses">
      <div className={styles.sectionHeadRow}>
        <div>
          <h2 className={styles.h2}>Featured courses</h2>
          <p className={styles.muted}>Jump into a course page, or browse the full catalog.</p>
        </div>
        <a className={styles.textBtn} href="/catalog">View full catalog →</a>
      </div>

      <div className={styles.cardGrid}>
        {featured.map((c) => (
          <a key={c.title} className={styles.card} href={c.href}>
            <div className={styles.cardTitle}>{c.title}</div>
            <div className={styles.cardDesc}>{c.meta}</div>
            <div className={styles.cardLink}>Open →</div>
          </a>
        ))}
      </div>
    </section>
  );
}
