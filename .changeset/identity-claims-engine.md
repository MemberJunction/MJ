---
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/server": minor
---

Introduces Identity Claims infrastructure in MemberJunction core for guest record claiming, account linking, and invite verification workflows (#4012).

- Schema & Entities: Adds `IdentityClaimType` and `IdentityClaim` entities with lifecycle state transitions (`Pending`, `Claimed`, `Expired`, `Revoked`).
- Pluggable Driver Substrate: Supports custom claim handler implementations via `BaseIdentityClaimDriver` and `@RegisterClass`.
- Server Engine: `IdentityClaimEngineServer` handles cryptographic claim creation, SHA-256 token hashing at rest, timing-safe token verification, email notifications via MJ Communications framework with HTML escaping, configurable email providers, polymorphic entity resolution, and atomic claim redemption.
