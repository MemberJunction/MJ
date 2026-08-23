---
"@memberjunction/core-entities-server": patch
---

Scope `MJ: Identity Claims` reads to the requesting user, and decouple redemption from that read grant.

`IdentityClaim` shipped with CodeGen's default permission set (UI read-only; Developer/Integration full CRUD). That default is correct for most entities but too broad here: each row pairs a guest purchaser's email (`NormalizedEmail`) with the record they bought (`EntityID` / `RecordID`), so an unfiltered read grant let any authenticated UI user enumerate every guest email and its purchase linkage.

A new migration keeps `CanRead` and attaches a `ReadRLSFilterID` — the pattern core already uses for `UI: Own AI Agent Runs` / `UI: Own AI Prompt Runs`. The filter matches on `ClaimedByUserID` **or** `NormalizedEmail`, because `ClaimedByUserID` is NULL until redemption and an ID-only filter would hide every pending claim from the user entitled to redeem it. Developer and Integration keep filter-less rows and stay exempt.

`RedeemClaim` now reads the claim (and any associated magic-link invite) under the system user rather than the caller. Row filters are applied to single-record loads and not just `RunView`, so without this the filter would have silently broken the entity's own workflow #3 — redeeming when the purchase email differs from the login email, which is exactly the case the verification token exists to serve. Authorization is unchanged and still enforced in the engine: email match, or a timing-safe comparison against the stored token hash.

Note the `TokenHash` in `MetadataJSON` was not the exposure. The token is `crypto.randomBytes(32)` and is not recoverable from its SHA-256; the issue was PII enumeration.
