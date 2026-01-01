Storybook migration

Storybook has been migrated to Storybook v8 using the Vite builder and is consolidated under `packages/ui`.

- Run locally: `pnpm -w -F packages/ui storybook`
- Build: `pnpm -w -F packages/ui storybook build` (produces `packages/ui/storybook-static`)

CI: `.github/workflows/storybook.yml` builds and uploads the `packages/ui/storybook-static` artifact.

If you see esbuild advisories in dependency scans, prefer upgrading Storybook or using pnpm overrides only after careful review.
