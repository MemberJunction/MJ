---
"@memberjunction/codegen-lib": patch
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-core-entity-forms": patch
---

A related section shown as a join grid on a generated form now loads and can be edited. The generated filter left the parent record's key unquoted, which is a SQL syntax error for a uniqueidentifier or string key, so the grid loaded nothing; CodeGen now quotes the key when its type needs it. The form layout also hid every related section while the record was in edit mode, which is the only time a join grid accepts changes; a section holding a join grid now stays visible. The Communication Provider form, the one generated form that uses a join grid, is regenerated.
