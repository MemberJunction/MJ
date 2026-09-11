---
"@memberjunction/core-entities": minor
---

fix(metadata): the retired GLM-4.7 Cerebras cost record uses a Status its entity actually allows

`MJ: AI Model Costs.Status` is a value list of `Active | Expired | Invalid | Pending`. The GLM-4.7 Cerebras cost record was set to `Inactive` — which is valid on `MJ: AI Model Vendors` (33 rows legitimately use it) but not on `MJ: AI Model Costs` — so `mj sync push --ci` failed validation and took the deterministic integration tier red on `next`.

The record now reads `Status: "Expired"` (the ORM defines it as "no longer valid", which is what the 2026-08-17 Cerebras retirement means) and carries `EndedAt: "2026-08-17"`. `EndedAt` is documented as "when this pricing expired… NULL indicates currently active pricing", so an expired row without it would contradict itself. The sibling `MJ: AI Model Vendors` row keeps `Inactive`, which is correct there.
