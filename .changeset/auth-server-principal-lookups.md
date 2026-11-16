---
"@memberjunction/server": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/metadata-sync": patch
"@memberjunction/cli": patch
"@memberjunction/testing-cli": patch
"@memberjunction/testing-integration": patch
"@memberjunction/integration-test-suite": patch
"@memberjunction/core-entities-server": patch
---

Server principal lookups go through one ladder (active system user, else lowest-ID active Owner, else none) instead of "first Owner, else the first cached user" or an untrimmed `Type === 'Owner'` comparison against the padded column. New `GetServerPrincipal` / `ResolveServerPrincipalFrom` in `@memberjunction/generic-database-provider` and `ResolveServerPrincipal` in `@memberjunction/server`; in-process CodeGen and RSU processing skip with an error when there is no principal. MJAPI logs at startup when a provisioning setting resolves to a non-Owner. The `newUserRoles` templates are tested against the shipped default, and an integration check asserts `User.Email` is unique.
