---
"@memberjunction/core": minor
---

Fix non-idempotent metadata sync for `.your-membership.json`: three Integration Object Field records each shared a `primaryKey.ID` with another field in the same file (`OrderID`/`InvoiceID`, and two `Id`/`CampaignId` pairs), so `mj sync push` routed two distinct records to the same DB row and their sync blocks ping-ponged on every run. Reassigned a fresh unique `primaryKey.ID` to the duplicate (`IsPrimaryKey:false`) record in each pair so every field has its own identity. `mj sync push` matches records to rows solely by `primaryKey` (no natural-key fallback), so each record must carry a unique key to be idempotent.
