Title: Upgrade Storybook to unblock Vite 7 and resolve esbuild advisory

Description
-----------
The current Dependabot advisory for `esbuild` traces to a transitive dependency from `vite@^5.x` used by our UI dev tooling. Upgrading `vite` to `^7.3.0` will remove the vulnerable transitive `esbuild`, but Storybook's Vite builder packages currently declare a peer dependency limited to `vite@^4|^5|^6`, blocking the upgrade.

This issue tracks the work to upgrade Storybook and Vite together so we can fully remediate the `esbuild` advisory.

Acceptance criteria
-------------------
- Storybook and its Vite builder packages are upgraded to versions compatible with `vite@^7.x`.
- `packages/ui` installs successfully with `vite@^7.3.0` and no vulnerable `esbuild` remains according to `npm audit`.
- Storybook builds and the app runs in dev and production modes without regressions.
- CI passes (build, tests, storybook) for the migration branch.
- A rollback plan is documented and tests added where relevant.

Steps
-----
1. Create a draft branch `chore/upgrade-storybook-vite` and bump Storybook packages and `vite` together.
2. Resolve any Storybook-breaking changes (API or config) and update Storybook configs.
3. Run and fix failing tests and Storybook stories; update docs as needed.
4. Run `npm audit` and verify `esbuild` advisory is resolved.
5. Open a migration PR using the migration PR template and request reviewers from the UI/tooling owners.

Labels: security, maintenance, dependency-upgrade

Estimated effort: 2-4 engineer-days (depends on regressions and Storybook internal changes)

Notes
-----
- If we cannot complete the Storybook upgrade quickly, we should merge the partial `esbuild` mitigation PR and schedule this issue for a maintenance window.
