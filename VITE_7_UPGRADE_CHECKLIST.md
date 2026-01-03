# Vite 7 Upgrade: Checklist & Breaking Changes Notes

Summary
- Purpose: upgrade `vite` in `packages/ui` to `^7.3.0` to ensure the transitive `esbuild` advisory is fully resolved.
- Scope: dependency bump and plugin validation, `vite.config.*` review, Storybook compatibility, build/test validation, and audit verification.

Blocking dependency
- Storybook packages (`@storybook/react-vite`, `@storybook/builder-vite` at `8.6.15`) declare a peer dependency of `vite` compatible with `^4 || ^5 || ^6`. Attempting to install `vite@^7.3.0` results in an ERESOLVE peer-dependency conflict. Upgrading to Vite 7 therefore requires a Storybook upgrade (and likely plugin updates); treat that as a separate, approvable workstream.

1) Dependency changes
- Update `packages/ui/package.json`:
  - `vite` -> `^7.3.0`
  - Review and bump Vite-related plugins (examples to check): `@vitejs/plugin-react`, `@vitejs/plugin-legacy`, `vite-plugin-svgr`, `vite-plugin-env-compatible`.
- Run:
  cd "packages/ui"
  npm install --save-dev vite@^7.3.0
  npm install --save-dev @vitejs/plugin-react@latest  # adjust if used
  npm install

2) Config review (vite.config.*)
- Compare `vite.config.*` against Vite 7 docs; look for:
  - Deprecated options removed between Vite 6 -> 7
  - Renamed config keys or moved defaults (e.g., `optimizeDeps`, `build.rollupOptions`, `server` options)
  - Plugin API surface changes (hook names or options)
- Actionable: run a `git diff` of `vite.config.*` after bump and update settings where warnings appear.

3) Plugin compatibility
- For each Vite plugin used, verify the plugin supports Vite 7. If not, find replacements or bump plugin major versions.
- Key checks:
  - `@vitejs/plugin-react` — ensure React plugin supports current React tooling (SWC/fast refresh changes may require config).
  - Storybook-related plugins and builder integration (see next section).

4) Storybook
- Confirm Storybook version and builder compatibility with Vite 7. If Storybook uses the Vite builder, test Storybook locally:
  cd packages/ui
  npm run storybook
- If Storybook uses a pinned builder version that is incompatible, upgrade Storybook or adjust the builder config in a separate PR if needed.

5) Build + dev validation
- Commands to run locally (from repo root or package):
  # dev server
  cd packages/ui
  npm run dev

  # build
  npm run build

  # preview (if available)
  npm run preview

- Verify app and Storybook load without console errors, HMR works, and production build outputs expected assets.

6) Audit verification
- After successful install and lockfile update run:
  cd packages/ui
  npm audit --json > audit-after-vite7.json
  npm ls esbuild --all
- Confirm `esbuild` dependency no longer exists in `node_modules/vite/node_modules` at vulnerable versions (<=0.24.2) and that `npm audit` no longer reports the advisory.

7) Tests and CI
- Run unit/integration tests and the repo CI locally where feasible. Ensure the PR triggers CI pipelines and that they pass.

8) Rollback plan
- If CI or production builds fail, revert the Vite change commit and open a follow-up issue with failing logs. Keep the esbuild partial mitigation PR merged if it reduces immediate risk.

9) Communication & PR notes
- In the PR body mention:
  - Security motivation (Dependabot advisory)
  - High-level changes made (vite & plugins bumped, config changes)
  - What was tested and how to reproduce locally
  - Any remaining manual steps for reviewers (e.g., Storybook checks)

10) Post-merge housekeeping
- Monitor CI and error reports for 24–72 hours after merge.
- Update any internal docs referencing Vite-specific behavior.

---

Potential Breaking Changes / Early Warnings (likely impact areas)
- Config API changes: keys renamed or defaults changed — expect warnings printed by Vite when starting.
- Plugin compatibility: some plugins may require major updates or new init/config options.
- Dev server behavior: stricter host/port handling, proxy changes, or altered middleware ordering.
- Dependency optimization: `optimizeDeps` behavior or pre-bundling semantics can change causing different dependency resolution.
- Asset handling & public dir semantics: verify static asset resolution and hashed filenames remain consistent.
- SSR / node integration: if repo uses SSR or server-side bundling, verify `ssr` options and ESM/CJS interop.

---

Follow-up PR skeleton (suggested)
- Title: `chore(deps): upgrade vite to ^7.3.0 and update plugins/config to resolve esbuild advisory`
- Body sections:
  - **Summary**: one-line security motivation and what changed.
  - **Changes**: list of package.json changes and key config edits.
  - **Testing**: exact commands run (dev/build/storybook/tests) and their outcomes.
  - **Review focus**: areas reviewers should eyeball (Storybook, plugin updates, rollupOptions, SSR).
  - **Rollback**: how to revert and quick troubleshooting pointers.

---

If you want, I can now:
- open a draft branch/PR with `vite@^7.3.0` bumped and run the local validation commands to collect test results and any required config edits, or
- leave this as a ready checklist and draft the exact PR body text for you to open when ready.
