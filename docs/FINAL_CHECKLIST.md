# Catalog Template — Final Checklist

Use this checklist to mark the template as ready for catalog publishing. Copy this file into the repo root or link to it from your release notes.

| Item | Status | Notes |
|---|:---:|---|
| Fix missing assets (`/favicon.ico`, `/theme/student-dashboard/style.css`) | ✅ | Files copied to `frontend/web/public/` |
| Baseline security headers added (`next.config.js`) | ✅ | CSP, HSTS, COOP, X-Frame-Options, Referrer-Policy set at app layer |
| Lighthouse baseline archived | ✅ | `outputs/lighthouse-static-3000-baseline.json` (elevated run) |
| DEPLOYMENT_APPENDIX.md (Nginx/Apache/CloudFront/Cloudflare) | ✅ | Includes attach/update commands and Cloudflare section for autolearnpro.com |
| OPS_QUICK_REFERENCE.md created and linked | ✅ | One-line verification and reload commands included |
| Catalog reviewer note added | ✅ | Confirms edge header coverage and review steps |

## Optional / Nice-to-have

| Item | Status | Notes |
|---|:---:|---|
| Generate multi-size `.ico` from branding assets | ☐ | Can be added to `frontend/web/public/` and linked in `layout.tsx` |
| Produce one-page PDF hand-off | ☐ | Formatted version of Deployment Appendix + Quick Reference |
| Open a PR / merge baseline | ☐ | Recommended to lock baseline and enable reviews |

## Sign-off

- Owner: ____________________
- Date: ____________________

**Notes:** After any app-layer header changes update `docs/DEPLOYMENT_APPENDIX.md` and `docs/OPS_QUICK_REFERENCE.md` to keep edge rules in sync.
