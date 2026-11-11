---
"@memberjunction/integration-test-suite": patch
"@memberjunction/sqlserver-dataprovider": patch
---

Tests only: field-level security integration checks for related rows, constraint-error redaction and the enable snapshot (#5981, #5982, #5988), and a provider-level test that a failed save hides the SQL and quoted values from a caller denied a field.
