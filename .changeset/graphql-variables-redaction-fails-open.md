---
"@memberjunction/server": patch
---

Close a fail-open gap in GraphQL variables logging, and mark the credential field it was missing.

The variables-logging redactor binds a GraphQL input type to an entity by name — `/^(Create|Update|Delete)(?<name>.+)Input$/`, then `Entities.find(e => e.ClassName === name)`. Codegen inputs embed the entity ClassName (`CreateMJCredentialInput` → `MJCredential`), so the lookup succeeds and `Encrypt=true` columns are redacted. Hand-written resolver inputs do not: `CreateConnectionInput` captures `Connection`, which is no entity, so no encrypted-field names are contributed and — absent any `@NoLog` — the argument falls through to `shortenForLog` with its values intact. `shortenForLog` truncates whole-object JSON but returns string leaves untruncated, so a long value is emitted in full.

The boot audit tests only the *name* pattern, so it classifies these inputs as metadata-bound and stays silent. Every hand-written `Create*Input` in the resolvers is therefore both unredacted and unwarned — the two mechanisms use the same regex, but only the redactor performs the lookup that decides whether redaction can actually apply.

Two changes:

- `CreateConnectionInput.CredentialValues` is now marked `@NoLog`. This field does not map to an entity column — the resolver assigns it onto `MJ: Credentials`.`Values` (which is `Encrypt=true`) in procedural code — so the metadata-driven half of the redactor cannot see it. `@NoLog` is exactly the escape hatch the design documents for this case.
- When an input name matches the CRUD convention but resolves to no entity, the redactor now reports it once per input type, naming the type and what to do about it, rather than silently falling through.

Both are scoped to verbose mode (`loggingSettings.graphql.logVariables`), which remains off by default. No behaviour change in the default configuration.
