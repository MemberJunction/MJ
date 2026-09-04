---
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/server": patch
"@memberjunction/ng-explorer-core": patch
---

Identity Claims: ship the redemption surface and close the trust gaps.

- New `IdentityClaimRedemptionResolver` (MJServer): `RedeemIdentityClaim` /
  `AutoClaimPendingIdentityClaims` mutations and `GetMyPendingIdentityClaims` query, with an
  in-memory per-user rate limit on redemption attempts.
- New Explorer `/claims/redeem` page (explorer-core) — the landing target of claim emails'
  `?id=..&token=..` links, previously a dead URL.
- Automatic claim-on-login: `getUserPayload` now fires `AutoClaimForUser` once per issued
  token (deduped alongside the session audit), so pending claims addressed to a user's email
  attach at sign-in.
- Email-verification gate: the OIDC `email_verified` claim is read off the verified JWT onto
  `UserPayload.emailVerified` and threaded into redemption — an IdP that explicitly asserts
  an unverified email can no longer redeem by email match (the token path still works).
- `IdentityClaimType.Configuration` is now read: `RequireVerifiedEmail`, `RequireToken`, and
  `AutoClaim` gates (typed as `IdentityClaimTypeConfiguration` on the client engine).
- `IdentityClaimType.IsActive` is now enforced on both create and redeem.
- `GetPendingClaimsForEmail` uses `EscapeSQLString` and a platform-neutral expiry literal
  (was `GETUTCDATE()`, SQL Server-only); `RevokeClaim` checks its save result and skips the
  driver's `OnRevoke` when the revocation did not persist.
