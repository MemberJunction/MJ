---
"@memberjunction/record-set-processor": patch
---

Infer's output check now resolves an enum's allowed values from field metadata (`FromFieldMetadata`), so those outputs are no longer failed, nulled or coerced to 'Other' on every record. A confidence is no longer recorded for an output whose value a `null` or `coerce-to-other` policy replaced.
