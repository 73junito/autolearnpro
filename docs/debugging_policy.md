Adaptive Debugging Policy — Automotive & Diesel LMS

Purpose

This policy defines safe, privacy-preserving procedures for adaptive debugging in the LMS: how debugging is triggered, what data can be collected, retention and access controls, and responsibilities.

Scope

Applies to backend services, CI/CD pipelines, content ingestion and processing. Excludes student-facing telemetry and frontend developer-only logs.

Principles

- Privacy-first: redact or avoid PII in all debug artifacts.
- Least data necessary: collect only what is required to troubleshoot the issue.
- Time-bounded: debug captures have short TTLs and auto-expire.
- Audit and approval for forensic-level debugging.

Roles & Responsibilities

- Backend Owners: implement redaction middleware, adaptive debug controller, and ensure CI gates exist.
- DevOps/SRE: enforce CI scanning (Trivy/Scout), artifact encryption, retention policies, and backup procedures.
- Security Team: approve forensic mode requests, manage KMS keys and audit logs.

Data Classification & Handling

- Never collect or store: names, emails, grades, quiz answers, payment data.
- Sanitize/hash: user IDs, session IDs, IP addresses (mask first two octets), filenames.
- Allowed operational data: course IDs, error codes, service names, timing metrics.

Debugging Levels

- Level 0 (Info): default, INFO logs and metrics only.
- Level 1 (Soft Debug): selective DEBUG logs, sanitized metadata, 1–6 hour TTL.
- Level 2 (Deep Debug): traces, stack traces (with no PII), encrypted artifacts, auto-expiry (24–72 hours).
- Level 3 (Forensic): manual approval, encrypted artifact export, strict retention (7 days or less), auditing.

Triggers

- Elevated error rates (configurable threshold)
- Persistent timeouts or repeated failures for same endpoint/request pattern
- CI pipeline failure during release process
- Manual operator request with justification

Redaction & Sanitization

- Centralized Redactor library used by request plugs, exporters and AI prompt sanitizers.
- Blocklist-based redaction + schema-driven sanitization for known payloads.
- Exporters must call Redactor.sanitize/1 before storing or sending artifacts externally.

Encryption & Key Management

- All debug artifacts and CI artifacts containing sensitive metadata must be encrypted at rest using KMS-managed keys.
- Rotate keys per org policy and enforce access control via IAM roles.

Retention & Deletion

- INFO logs: 90 days
- DEBUG logs: 24–72 hours by default, configurable per incident
- Traces/Artifacts: 24–72 hours unless forensic-approved
- Forensic artifacts: TTL ? 7 days, strict access control and audit trail

Access Control & Auditing

- Role-based access; require Just-In-Time approval for forensic access
- All access to debug artifacts logged to a centralized audit log
- Periodic review (quarterly) of debug escalations and artifact access

CI/CD Integration

- Enforce image scanning (Trivy or Docker Scout) as required PR checks
- On pipeline failures, create ephemeral debug captures with sanitized context
- Encrypt artifacts uploaded from CI and set lifecycle policies on storage

Incident & Abuse Handling

- If a debug capture contains sensitive data unexpectedly, rotate any exposed secrets and notify Security.
- Misuse of debugging (excessive forensic captures without approval) triggers review and potential access revocation.

Governance

- Review this policy annually or after major incidents.
- Update thresholds, TTLs, and procedures based on operational experience.

Appendix

- Reference: implementation checklist in docs/ci_cleanup.md
- Redaction utility: `backend/lms_api/lib/lms_api/redactor.ex`

