**Title**: fix(deps): upgrade esbuild to >=0.25.0 to address Dependabot alert

**Summary**
- Adds a direct devDependency of `esbuild: >=0.25.0` in `packages/ui/package.json` and updates `packages/ui/package-lock.json` so npm resolves a patched `esbuild` (patched version: 0.25.0). This addresses a Dependabot alert for transitive `esbuild` <= 0.24.2 introduced via `vite@5.4.21`.

**Changes in this branch**
- `packages/ui/package.json` — added `esbuild: >=0.25.0` as a `devDependency`.
- `packages/ui/package-lock.json` — updated by running `npm install` in `packages/ui` so the lockfile resolves `esbuild` to a patched version.
- Other generated/added files from the `npm install` run are included in the commit (verify the diff in the PR).

**Why**
- Dependabot reported a vulnerability caused by transitive `esbuild` <= 0.24.2. Upgrading to `esbuild >= 0.25.0` resolves the advisory.

**Verification / How to test locally**
1. Checkout this branch locally:
```
git fetch origin
git checkout fix/esbuild-upgrade
```
2. Install and verify the lockfile in `packages/ui`:
```
cd packages/ui
npm install
npm ls esbuild
```
Confirm `esbuild` resolves to `0.25.0` or later.

3. Run storybook/build/tests used by CI to validate no regressions:
```
# from repo root (adjust workspace commands to your setup)
npm run storybook --workspace=@lms/ui
# or run any project tests
```

**CI / Merge notes**
- CI should run the normal test/build workflows; please ensure the lockfile changes are accepted by CI and any package registry caching is cleared if required.
- If CI fails due to unrelated issues, revert or open a follow-up PR only for CI fixes.

**PR Body (one-line)**
Fix: ensure `esbuild >= 0.25.0` in `packages/ui` to address Dependabot advisory (transitive `esbuild` via `vite`).

**Open the PR on GitHub**
You can open the PR using the GitHub suggestion printed when pushing the branch, for example:

https://github.com/73junito/autolearnpro/pull/new/fix/esbuild-upgrade

**Audit results (verification run)**
- `npm ls esbuild` shows multiple resolved versions: `esbuild@0.27.2` (top-level) and `esbuild@0.21.5` nested under `vite` (`node_modules/vite/node_modules/esbuild`).
- `npm audit` still reports 2 moderate vulnerabilities related to `esbuild` (range `<=0.24.2`) originating from the `vite` dependency.

**Recommended next steps**
- To fully resolve the advisory you must upgrade `vite` to a version that depends on a patched `esbuild`. `npm audit` indicates a fix is available by upgrading `vite` to `7.3.0` (this is a SemVer major upgrade and may include breaking changes).
- Options:
	- Upgrade `vite` to `^7.3.0` (preferred for full fix). Run tests and Storybook to validate and address breaking changes.
	- If upgrading `vite` is not feasible now, merge this PR to partially mitigate risk (top-level `esbuild >=0.25.0`), then open a follow-up PR to upgrade `vite` and resolve the remaining advisory.

If you want, I can attempt an upgrade of `vite` in `packages/ui` now, run the tests locally, and update this branch with the necessary changes.
