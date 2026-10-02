---
"@memberjunction/core-entities": minor
---

Per-connection integration catalog: two new core tables, `CompanyIntegrationObject` and
`CompanyIntegrationObjectField`, give each CompanyIntegration its own copy of the connector's
object and field definitions (with provenance, observed widths, and selection as an axis separate
from Status), so two connections of the same connector stop overwriting each other's discovery.
Schema only; the engine reads them behind a per-connection flag in a following change.
