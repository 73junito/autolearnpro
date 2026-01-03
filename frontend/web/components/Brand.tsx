import styles from "../styles/home.module.css";

type BrandProps = {
  variant?: "full" | "mark";
  size?: "sm" | "md" | "lg";
};

export function Brand({ variant = "mark", size = "md" }: BrandProps) {
  const px =
    size === "sm" ? 40 :
    size === "md" ? 48 : 112;

  const showWordmark = variant === "full";

  return (
    <div className={styles.brand}>
      <img
        src="/assets/logo-alp.png"
        alt="AutoLearnPro LMS logo"
        width={px}
        height={px}
        className={styles.brandLogo}
      />
      {showWordmark ? (
        <div className={styles.brandText}>
          <div className={styles.brandName}>AutoLearnPro</div>
          <div className={styles.brandTag}>Competency-based training platform</div>
        </div>
      ) : null}
    </div>
  );
}
