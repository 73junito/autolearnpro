# AutoLearnPro - Clean Unified Architecture

This is a new isolated project scaffold. No legacy application code, secrets, databases, Docker volumes or deployment settings have been migrated.

## Stabilization gates

1. Establish reproducible, pinned workspace tooling and isolated local services.
2. Validate runtime health, authentication, migrations, backups and automated tests.
3. Inventory and selectively migrate reviewed assets and source files from F:\TorqueMind.
4. Verify production surfaces and cutover only after acceptance testing.

## Guardrails

- Never blindly copy node_modules, build outputs, caches, environment secrets, backup archives or Docker volumes.
- Preserve F:\TorqueMind and its existing Docker/Supabase state.
- Review migrations, RLS, API contracts and licensing before transfer.
- Keep test and deployment resources isolated from the old stack.
