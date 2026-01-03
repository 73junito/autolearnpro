Summary: I attempted to upgrade Vite to `^7.3.0` to address the Dependabot/esbuild advisory. This is currently blocked: `@storybook/react-vite` and `@storybook/builder-vite@8.6.15` declare a peer dependency of `vite ^4 || ^5 || ^6`, causing `npm` to fail with ERESOLVE when installing Vite 7.

Impact: To complete this remediation we must upgrade Storybook (and related builder/addon packages), which is a non-trivial, likely major upgrade that can affect `main.ts`/`preview.ts`, addons, MDX/docs, and Storybook builder behavior.

Request: approval to proceed with a dedicated Storybook+Vite migration. Plan: create a draft branch, bump Storybook + Vite together, apply incremental config/plugin fixes (one commit per change), run Storybook/dev/build/tests/audit, and open a single follow-up PR with test results and reviewer checklist.

Note: This PR remains intentionally scoped to documentation/analysis; no Storybook changes are included without approval.
