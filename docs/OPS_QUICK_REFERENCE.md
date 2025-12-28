OPS Quick Reference — Catalog Template

Purpose: Fast, one-line commands for on-call and hand-offs. Use staging first.

Verify headers (quick):

```bash
curl -I https://example.com/ | egrep -i 'strict-transport-security|content-security-policy|x-frame-options|referrer-policy|cross-origin-opener-policy'
```

Nginx (reload + check):

```bash
# Test config
sudo nginx -t
# Reload gracefully
sudo systemctl reload nginx
# Verify headers
curl -I https://example.com/
```

Apache (reload + check):

```bash
# Test config
sudo apachectl configtest
# Reload gracefully
sudo systemctl reload apache2
# Verify headers
curl -I https://example.com/
```

Deploy static assets (examples):

```bash
# rsync to web root (ssh)
rsync -avz build/ user@webhost:/var/www/html/

# or S3 static site
aws s3 sync build/ s3://your-bucket --delete
```

Lighthouse (local lab):

```bash
# quick run (install Node & lighthouse)
npx -y lighthouse https://127.0.0.1:3000/ --output json --output-path=./tmp/lighthouse-local.json --chrome-flags='--headless'
```

CloudFront (policy creation / attach quick commands):

```bash
# Create response headers policy via CloudFormation (if using the infra template)
aws cloudformation deploy --template-file infrastructure/cloudfront-response-headers.yaml --stack-name catalog-response-headers

# Create policy from generated JSON
aws cloudfront create-response-headers-policy --response-headers-policy-config file://response-headers-policy.json

# Attach policy: fetch config and ETag
aws cloudfront get-distribution-config --id <DISTRIBUTION_ID> > dist-config.json
ETAG=$(aws cloudfront get-distribution-config --id <DISTRIBUTION_ID> --query 'ETag' --output text)
# Edit dist-config.json to set DefaultCacheBehavior.ResponseHeadersPolicyId
aws cloudfront update-distribution --id <DISTRIBUTION_ID> --distribution-config file://dist-config.json --if-match $ETAG
```

Cloudflare (quick UI/CLI checks):

```bash
# Verify headers after adding a Response Headers Rule in the dashboard
curl -I https://autolearnpro.com/ | egrep -i 'content-security-policy|strict-transport-security|x-frame-options|referrer-policy|cross-origin-opener-policy'
```

Quick troubleshooting checklist:

- If headers missing: check edge (Cloudflare/CloudFront) rules before origin.
- If duplicate/conflicting headers: remove duplicate at edge or set override in policy.
- If LCP/FCP regressions: confirm static assets (images/fonts) served from intended CDN and not blocked by CSP.

Notes:

- Replace `example.com` / `autolearnpro.com` with the real host.
- Always test in staging before applying to production. HSTS should be enabled only when HTTPS is confirmed.
