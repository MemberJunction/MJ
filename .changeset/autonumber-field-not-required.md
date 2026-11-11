---
"@memberjunction/ng-base-forms": patch
---

Forms no longer mark a NOT NULL field as required on a new record when an AutoNumber policy assigns it during Save() (#4001). Saved records still require a value.
