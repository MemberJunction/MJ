# User-provided context for path-lms build

- Invocation: `/build-connector path-lms --context https://data-api.pathlms.com/`
- Credential mode chosen: **[B] NO CREDENTIAL** (credential-free, full non-live suite).
- Sandbox/isolation: host (not container; no broker mailbox).

## Context pointer (Tier-1 starting point — trusted where it speaks, NOT exhaustive)
- Base URL: https://data-api.pathlms.com/
- Path LMS is the Thought Industries learning platform; "data-api" is its data/reporting API surface.
- No additional docs/payloads/quirks supplied by the user beyond the base URL.

NOTE (PropFuel lesson): this pointer scopes a starting surface; the pipeline must independently
study the connector's full nature from public discovery and reconcile, not treat the base URL as
the whole system.
