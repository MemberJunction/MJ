---
"@memberjunction/codegen-lib": patch
"@memberjunction/server": patch
"@memberjunction/graphql-dataprovider": patch
---

Stop emitting GraphQL child-array FieldResolvers (`Foo_BarIDArray`). Load children via RunView or a hand-written mutation result type. CurrentUser now returns a first-class Roles field; query create/update return Fields/Parameters/Entities/Permissions on the mutation result.

CurrentUser is an intentional schema break for the first 6.x LTS (no deprecated MJUserRoles_UserIDArray alias). Role load now throws on a missing user or a failed RunView instead of presenting an empty role set.
