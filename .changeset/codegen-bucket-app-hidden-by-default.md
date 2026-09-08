---
"@memberjunction/codegen-lib": patch
---

Auto-created schema "bucket" Applications are now hidden from new users. `createNewApplication`'s
INSERT omitted `DefaultForNewUser`, so the DB default of `1` won — every schema-named bucket app
(`__mj_MySchema`, "Generated for schema") landed visible in each new user's app switcher, while a
UI app's human-authored metadata Application often ships hidden. The bucket exists to carry entity
links, role grants, and `SchemaAutoAddNewEntities`; it is plumbing, not a product, and is now
emitted with `DefaultForNewUser = 0`. Affects newly emitted captures only — existing captured
baselines keep their old INSERT until recaptured.
