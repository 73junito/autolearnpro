<!-- Use this template for the Storybook + Vite migration PR -->

## Summary
- What: Upgrade Storybook and `vite` so `vite@^7.x` can be used and the `esbuild` advisory is resolved.
- Why: Remove transitive vulnerable `esbuild` and keep tooling current.

## Changes
- Bump `@storybook/*` packages (list exact packages and versions).
- Bump `vite` to `^7.3.0` and update related dev tooling.
- Update Storybook config (main.js, manager, preview) as required by new Storybook/Vite versions.

## Migration steps
1. Create branch `chore/upgrade-storybook-vite` from `main`.
2. Increment Storybook packages and `vite` together in `packages/ui/package.json`.
3. Run `npm install` and resolve peer dependency issues.
4. Run `npm run build`, `npm run storybook:build`, and all tests; fix failures.

## Testing
- Manual: Run Storybook locally and smoke-test major stories.
- Automated: Ensure CI passes (build, tests, storybook build).

## Rollback plan
- If migration causes unresolvable regressions, revert the branch and restore previous Storybook versions; document failures and next steps.

## Checklist
- [ ] Branch created
- [ ] All Storybook packages updated
- [ ] `vite` updated to `^7.3.0`
- [ ] `npm install` completes cleanly
- [ ] `npm audit` shows `esbuild` advisory resolved
- [ ] Storybook builds and stories pass manual smoke tests
- [ ] CI green

## Reviewers
- @ui-owner, @devops, @security
