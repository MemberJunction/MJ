---
'@memberjunction/server': patch
---

Fix magic-link redemption on hosts whose MJAPI login is not db_owner (#4753). The single-use consume now runs through a new `spConsumeMagicLinkInvite` procedure granted to `cdp_Developer`/`cdp_Integration` instead of a raw UPDATE on the `MagicLinkInvite` base table, which those roles cannot touch. PostgreSQL is unchanged: its runtime roles hold table DML, so it keeps the direct guarded `UPDATE … RETURNING`. A database failure during the consume is now reported as `server_error` (HTTP 500) instead of `consumed` (HTTP 410 "Invite already redeemed or expired.").
