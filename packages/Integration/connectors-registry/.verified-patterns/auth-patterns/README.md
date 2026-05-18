# Auth patterns

Proven authentication-flow patterns that have been verified across ≥3 connectors.

Each entry describes:
- The wire-format pattern (what headers + body + flow)
- The vendor classification (OAuth2AuthCode / OAuth2ClientCredentials / JWTBearer / APIKey / BasicAuth / HMAC)
- Token lifecycle (TTL, refresh strategy, idempotency)
- Known caveats (e.g., FP-001 refresh-token rotation)
- Applicable vendors (≥3 required)

Entries land in phase C after vendor rebuilds surface them.
