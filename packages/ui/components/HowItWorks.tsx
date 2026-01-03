import styles from "../styles/home.module.css";

const steps = [
  { title: "Learn", desc: "Canvas-style modules: overview, lecture, activities, knowledge checks." },
  { title: "Practice", desc: "Guided labs, safety callouts, and real-world procedures." },
  { title: "Assess", desc: "Quizzes + performance checks with clear criteria and rubrics." },
  { title: "Certify", desc: "Evidence-based competency records for reporting and audits." },
];

export function HowItWorks() {
  return (
    <section className={styles.section} aria-label="How it works">
      <div className={styles.sectionHead}>
        <h2 className={styles.h2}>How it works</h2>
        <p className={styles.muted}>A repeatable learning loop that scales across every course.</p>
      </div>

      <div className={styles.stepGrid}>
        {steps.map((s, idx) => (
          <div key={s.title} className={styles.step}>
            <div className={styles.stepNum}>{idx + 1}</div>
            <div>
              <div className={styles.stepTitle}>{s.title}</div>
              <div className={styles.stepDesc}>{s.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
