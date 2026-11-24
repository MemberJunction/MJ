---
"@memberjunction/generic-database-provider": patch
"@memberjunction/react-linter": patch
"@memberjunction/server": patch
"@memberjunction/ai-mcp-server": patch
"@memberjunction/esignature": patch
"@memberjunction/export-engine": patch
"@memberjunction/ng-ai-test-harness": patch
"@memberjunction/ng-artifacts": patch
---

Security hardening across the server boundary and untrusted-content handling.

- `BuildPrimaryKeyWhereClause` refuses non-numeric values for unquoted (numeric/boolean) primary keys instead of splicing them into SQL text raw (SQL injection via a client-supplied composite key).
- The React linter's `required-when` validator evaluates its ComponentSpec-supplied condition through `SafeExpressionEvaluator` instead of `eval` (server-side RCE).
- `CheckEntityPermissionsSystemUser` now requires the system user (`@RequireSystemUser`), closing a user/permission enumeration path.
- The REST transport (`/api/v1/*`) now enforces API-key scopes (entity:read/create/update/delete, view:run/view:batch, query:run, transaction:execute) just as GraphQL does; JWT/OAuth callers are unaffected.
- MCP Server: the system API key is compared in constant time; API keys in query parameters are no longer accepted; OAuth user-resolution failures return a generic 403 without echoing the probed email.
- Local dev auth: Docker bridge source IPs are trusted only with an explicit `MJ_DEV_AUTH_ALLOW_DOCKER_BRIDGE=true`, never inferred from `/.dockerenv`.
- eSignature webhooks with no HMAC key configured are refused by default (opt back in with `MJ_ESIGNATURE_ALLOW_UNVERIFIED_WEBHOOKS=true`).
- CSV exports prefix formula-leading strings (`=`, `+`, `-`, `@`, tab, CR) with a quote to neutralize spreadsheet formula injection.
- Media streaming serves only passive media types inline (never SVG/HTML), adds `Referrer-Policy: no-referrer`, and keeps `Cache-Control: private, no-store`.
- The AI test harness markdown renderer only emits anchors for http/https/mailto URLs (with `rel="noopener noreferrer"`); user favorites can only be read/set for the caller's own UserID (system user excepted); the SQL-logging path check uses `path.relative` containment; the JSON artifact viewer iframe drops `allow-popups-to-escape-sandbox`.
