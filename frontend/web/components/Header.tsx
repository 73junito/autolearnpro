import styles from "../styles/home.module.css";
import { Brand } from "./Brand";

export function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <a className={styles.brandLink} href="/" aria-label="AutoLearnPro Home">
          <Brand variant="full" size="sm" />
        </a>

        <nav className={styles.nav} aria-label="Primary">
          <a href="/catalog">Courses</a>
          <a href="/dashboard">Dashboard</a>
          <a href="/admin">Admin</a>
          <a href="/docs">Docs</a>
          <a className={styles.navCta} href="/login">Sign In</a>
        </nav>
      </div>
    </header>
  );
}
