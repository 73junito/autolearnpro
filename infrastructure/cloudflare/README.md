# AutoLearnPro — isolated Cloudflare scaffold

This is an isolated, **non-deployed** Cloudflare Worker scaffold for the new `F:\autolearnpro` project. It is not the old AutoLearnPro Cloudflare Workers application and does not modify `autolearnpro-public`, `autolearnpro-app`, `autolearnpro-exam`, or DNS.

- Worker base name: `autolearnpro-foundation`.
- Named environment: `staging` (a separate Worker named `autolearnpro-foundation-staging` if ever deployed).
- No production routes, domains, KV, R2, Hyperdrive bindings, secrets, or Supabase connections.
- Both `workers_dev` and `preview_urls` are disabled; health-only code refuses all other routes.
- To check configuration without deployment, from this folder run `wrangler deploy --dry-run --env staging` using a pinned, validated Wrangler version. **Do not run `wrangler deploy` without explicit authorization.**
- To use PostgreSQL later, migrate the approval service to a Worker-compatible handler and configure a reviewed Hyperdrive binding and server-only secrets. A Node `node:http` server cannot be deployed unchanged as a Worker.
- No account-level Cloudflare or DNS modifications have been made by creating this scaffold.
