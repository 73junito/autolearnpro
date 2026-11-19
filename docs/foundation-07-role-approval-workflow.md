# Foundation 7: Private role approval workflow (local only)

Migration: `20261026022554_role_approval_workflow.sql`.

- Private role requests record target, requested role, requester, reason, state, decision actor/time and decision reason.
- Tables use forced RLS and have no ordinary client privileges. `submit_role_request` and `decide_role_request` are `SECURITY INVOKER` and executable only by `service_role`.
- Approval requires an administrator assignment for a distinct reviewer. Requester and target cannot approve their own request. Administrator grants are blocked pending a stronger independent approval gate.
- Approval locks a pending request row, prevents repeated decisions, and calls the private role-change/audit function within the same transaction. Rejection records a decision but does not grant a role.
- `tests/foundation-07-approval.sql` verifies ordinary-client denial, self-approval prevention, authorized instructor approval and audit record, duplicate-decision denial. Test uses rollback; no test users/roles remain.
- Clean local Supabase reset replayed five migrations including this one; migration history verified and approval test reran successfully.

**Security limit:** Neither private SQL function validates the supplied actor UUID against an independently verified JWT. These functions must ONLY be called from trusted backend code that authenticates the actor and enforces separation of duties. `service_role` can still invoke the lower-level `manage_role` directly, so the backend key must never be exposed. The HTTP approval endpoint, JWT validation, secure reviewer identity binding, and approval-rate controls remain unimplemented. This baseline is NOT authorized for cloud deployment.
