Merge catalog template baseline

- Locked baseline Lighthouse metrics and security headers
- Added DEPLOYMENT_APPENDIX.md with server/CDN headers and Cloudflare guidance for autolearnpro.com
- Added OPS_QUICK_REFERENCE.md for quick on-call verification and common commands
- Added infrastructure helper for CloudFront response-headers policy and a CloudFormation template
- Added FINAL_CHECKLIST.md confirming catalog readiness

Notes:
- CI/smoke checks should pass and all reviewers must approve before merging.
- Optional follow-ups (post-merge): generate multi-size `.ico` and produce a one-page PDF hand-off from the appendix.
