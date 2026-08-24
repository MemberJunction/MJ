---
"@memberjunction/core-entities-server": patch
---

Scope `MJ: Identity Claims` reads to the requesting user, and decouple redemption from that read grant.

`IdentityClaim` shipped with CodeGen's default permission set (UI read-only; Developer/Integration full CRUD). That default is correct for most entities but too broad here: each row pairs a guest purchaser's email (`NormalizedEmail`) with the record they bought (`EntityID` / `RecordID`), so an unfiltered read grant let any authenticated UI user enumerate every guest email and its purchase linkage.

A new migration keeps `CanRead` and attaches a `ReadRLSFilterID` — the pattern core already uses for `UI: Own AI Agent Runs` / `UI: Own AI Prompt Runs`. The filter matches on `ClaimedByUserID` **or** `NormalizedEmail`, because `ClaimedByUserID` is NULL until redemption and an ID-only filter would hide every pending claim from the user entitled to redeem it. Developer and Integration keep filter-less rows and stay exempt.

`RedeemClaim` now reads the claim (and any associated magic-link invite) under the system user rather than the caller. Row filters are applied to single-record loads and not just `RunView`, so without this the filter would have silently broken the entity's own workflow #3 — redeeming when the purchase email differs from the login email, which is exactly the case the verification token exists to serve. Authorization is unchanged and still enforced in the engine: email match, or a timing-safe comparison against the stored token hash.

Note the `TokenHash` in `MetadataJSON` was not the exposure. The token is `crypto.randomBytes(32)` and is not recoverable from its SHA-256; the issue was PII enumeration.

---

Also threads metadata providers through the identity-claim engines instead of reaching for the process-global default, removing all 8 `global-provider-ok` suppressions across the two files.

`IdentityClaimEngineServer.RedeemClaim` now **requires** an `IMetadataProvider` (breaking, deliberately). Redemption reads a claim, reads a magic-link invite, and executes a raw CAS `UPDATE` — three operations that must hit the same database. An optional provider would let a caller thread one into the entity reads while the CAS silently fell back to the global, which is the failure this signature makes impossible. `CreateClaim`, `RevokeClaim` and `GetPendingClaimsForEmail` take an optional trailing `provider?` instead, so they stay source-compatible.

The CAS helpers previously resolved schema and table names from the passed `md` but took `ExecuteSQL` from the global — identical objects in a single-provider process, but the statement would have been built for one database and run against another the moment anyone threaded a provider. Both now use a single provider.

`IdentityClaimEngine` (client) extends `BaseEngine` and so already owns a provider; its three `new Metadata()` calls are replaced with `this.ProviderToUse` per the repo's data-access rule. Two bare `new RunView()` calls — which resolve a *separate* global RunView provider slot that the compliance scanner does not cover — now receive the engine's provider.

`IdentityClaimEngineServer` gains a settable `Provider` accessor with a `?? new Metadata()` fallback, matching `AIEngine` (the pattern `QueryEngineServer` and `ComponentMetadataEngineServer` both cite) and structurally exempt from the compliance scanner.

---

**Breaking:** the claim lifecycle is removed from `IdentityClaimEngine` (`@memberjunction/core-entities`) and now lives only on `IdentityClaimEngineServer`.

`CreateClaim`, `RedeemClaim`, `RevokeClaim`, `GetPendingClaimsForEmail` and `AutoClaimForUser` are gone from the client+server class. It retains what is safe and useful in any host — the `IdentityClaimType` cache, type lookups, `ClassFactory` driver resolution, `NormalizeEmail`, and the `BaseIdentityClaimDriver` contract — and the server engine contains an instance of it, proxying those cached members. Same split as `AIEngineBase` / `AIEngine`.

The two copies had diverged. The client's `RedeemClaim` was the pre-hardening implementation: no email match, no token verification of any kind (it accepted a `token` and handed it to the driver unchecked), check-then-set instead of an atomic CAS, and the driver invoked before the status transition with no error handling. Those defects were fixed on the server copy only, leaving a weaker implementation of a security-critical operation exported from a package server code also imports — where `IdentityClaimEngine` and `IdentityClaimEngineServer` differ by one word.

Nothing outside the engines called the removed methods. `AutoClaimForUser` moves to the server engine and now runs each redemption through the hardened `RedeemClaim`, so the email lookup that finds pending claims is a convenience rather than the security boundary.
