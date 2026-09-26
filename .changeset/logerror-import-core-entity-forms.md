---
"@memberjunction/ng-core-entity-forms": patch
---

Import `LogError` from `@memberjunction/core` rather than `@memberjunction/global` in
`record-process-form.component.ts`. `LogError` is exported from MJCore's `generic/logging.ts`;
importing it from `global` failed `ngc` with `TS2305: Module '"@memberjunction/global"' has no
exported member 'LogError'`, breaking the build of this package. The other names on that import
line are genuinely in `global` and are unchanged.
