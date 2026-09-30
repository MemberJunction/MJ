---
"@memberjunction/codegen-lib": patch
---

GraphQL CodeGen marks a nullable `__mj_` column nullable on the output type (#4603). `isNonNullableServerField` declared every `__mj_` column non-nullable, including the geocoding pair `__mj_Latitude` / `__mj_Longitude`, which are NULL until a record is geocoded. A single-record load of such an entity then failed with "Cannot return null for non-nullable field", and a save reported failure after its write had committed. A field is now non-nullable only when field-level security cannot strip it and the database column is NOT NULL. Primary keys and `__mj_CreatedAt` / `__mj_UpdatedAt` are unchanged. Hosts and apps pick this up by re-running `mj codegen` and rebuilding.
