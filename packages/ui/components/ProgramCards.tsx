import styles from "../styles/home.module.css";

const programs = [
  { title: "Automotive", desc: "Core systems, diagnostics, and ASE prep.", href: "/content/courses/01-brake-systems-ase-a5/site/index.html?track=automotive" },
  { title: "Diesel", desc: "Heavy-duty engines, fuel systems, emissions, fleet.", href: "/content/courses/07-diesel-fuel-systems/site/index.html?track=diesel" },
  { title: "EV & Hybrid", desc: "High-voltage safety, batteries, charging, service.", href: "/content/courses/09-electric-vehicle-fundamentals/site/index.html?track=ev" },
  { title: "Virtual Labs", desc: "Lab scenarios, safety, procedures, evidence capture.", href: "/labs" },
];

export function ProgramCards() {
  return (
    <section className={styles.section} aria-label="Programs">
      <div className={styles.sectionHead}>
        <h2 className={styles.h2}>Programs</h2>
        <p className={styles.muted}>Structured pathways for CTE, workforce, and military training.</p>
      </div>

      <div className={styles.cardGrid}>
        {programs.map((p) => (
          <a key={p.title} className={styles.card} href={p.href}>
            <div className={styles.cardTitle}>{p.title}</div>
            <div className={styles.cardDesc}>{p.desc}</div>
            <div className={styles.cardLink}>Explore →</div>
          </a>
        ))}
      </div>
    </section>
  );
}
