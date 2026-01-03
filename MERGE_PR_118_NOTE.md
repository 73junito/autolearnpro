Merge note for PR #118 (fix/esbuild-upgrade)

This PR applies a targeted mitigation for the esbuild advisory by adding a direct devDependency on `esbuild >= 0.25.0` in `packages/ui` and updating the lockfile.

Why the advisory remains:
- The remaining vulnerable transitive `esbuild` is introduced by older `vite` versions. Resolving it fully requires upgrading `vite` to `^7.3.0`, which is blocked by current Storybook Vite builder peer dependencies. A separate migration is tracked in ISSUE_UPGRADE_STORYBOOK_VITE.md.

Action: merge this PR now to reduce immediate exposure and schedule the Storybook + Vite migration as a follow-up.

Signed-off-by: repo-maintainer
