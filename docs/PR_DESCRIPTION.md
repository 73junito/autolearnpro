Title: Catalog Template Baseline — initial lock

Summary:

This PR locks the initial catalog template baseline for the Automotive and Diesel LMS catalog. Changes include fixes for missing public assets, application-layer security headers, a Lighthouse baseline artifact, deployment guidance, and an ops quick-reference.

What I changed:

- Added/fixed public assets: `/favicon.ico`, `images/logo.png`, and `theme/student-dashboard/style.css` (placed under `frontend/web/public/`).
- Added conservative application-layer security headers in `frontend/web/next.config.js` (CSP, HSTS notes, COOP, X-Frame-Options, Referrer-Policy).
- Created and archived an elevated Lighthouse baseline: `outputs/lighthouse-static-3000-baseline.json`.
- Implemented a Next.js homepage and minor accessibility fixes (skip-to-content link, `id="main"`).
- Added deployment guidance: `docs/DEPLOYMENT_APPENDIX.md` (Nginx/Apache/CloudFront/Cloudflare) and CloudFormation helper `infrastructure/cloudfront-response-headers.yaml`.
- Added ops quick-reference: `docs/OPS_QUICK_REFERENCE.md` (one-line verification and reload commands).
- Added final checklist: `docs/FINAL_CHECKLIST.md`.
- Added helper scripts: `scripts/generate_cloudfront_policy.ps1` to create CloudFront response headers JSON.

Audit notes / artifacts:

- Lighthouse baseline (elevated run) is saved as `outputs/lighthouse-static-3000-baseline.json`.
- Verified that `/theme/student-dashboard/style.css` and `/favicon.ico` serve from `frontend/web/public/`.

Optional follow-ups (non-blocking):

- Add a multi-size `.ico` generated from branding assets and link in `layout.tsx` (recommended for legacy clients).
- Produce a one-page PDF hand-off of the appendix + quick reference for offline ops.
- Optionally automate CloudFront policy attachment when distribution IDs are confirmed.

Testing and validation steps:

1. Run `curl -I https://<host>/` to validate headers.
2. Run `npx lighthouse https://127.0.0.1:3000/ --output json --output-path=./tmp/lighthouse-local.json` for a local test.
3. Confirm `docs/DEPLOYMENT_APPENDIX.md` and `docs/OPS_QUICK_REFERENCE.md` are used by ops/security for edge rule application.

Notes for reviewers:

- This PR is intended to be the baseline for catalog approval. Most changes are documentation and minor site assets.
- If you want automation (CloudFormation/Terraform) to attach the CloudFront policy to a distribution, provide the distribution ID and we'll add automation in a follow-up PR.
