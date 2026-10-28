---
"@memberjunction/open-app-engine": patch
---

Open App schema safety: the configured MJ core schema is reserved like `__mj`, so an app can no longer adopt and later drop it (#4559). Install rollback and remove share one drop-and-report helper, so a rollback refusal now names its remedy (#4560). Teardown scripts are downloaded before migrations run, so a rollback needs no network; rollback runs teardown with the schema in place and, if that fails, once more after dropping the schema (#3506).
