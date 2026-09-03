---
"@memberjunction/core-entities": minor
---

fix(metadata): the retired Kimi K2.5 Moonshot cost record uses a Status its entity actually allows

`MJ: AI Model Costs.Status` is a value list of `Active | Expired | Invalid | Pending`. The Kimi K2.5 / Moonshot AI cost record was set to `Inactive` — valid on `MJ: AI Model Vendors`, where 34 rows legitimately use it, but not on `MJ: AI Model Costs` — so `mj sync push --ci` failed validation and took the deterministic integration tier red on `next`:

```
Field "Status" has invalid value "Inactive"
  → Allowed values are: Pending, Expired, Invalid, Active
```

This is the same defect as the GLM-4.7 Cerebras record fixed in `1fa6f6b08b`, reintroduced by the AI-model research routine in #4110. The research pass writes `Inactive` for a retired cost row because that is the word a human would reach for, and nothing in the authoring path rejects it — the value list is only enforced at push time, on a branch nobody validates until CI runs.

The record now reads `Status: "Expired"` and carries `EndedAt: "2026-08-31T00:00:00.000Z"`. `EndedAt` is documented as "when this pricing expired… NULL indicates currently active pricing", so an expired row without it would contradict itself — the same pairing the GLM-4.7 fix used. The date is the one the record's own `Comments` already gave for Moonshot's sunset of `moonshotai/Kimi-K2.5`. That comment said "STATUS FLIPPED TO INACTIVE", which would have described a value the row no longer holds, so it now reads "STATUS SET TO EXPIRED, ENDEDAT".

The sibling `MJ: AI Model Vendors` rows keep `Inactive`, which is correct there.
