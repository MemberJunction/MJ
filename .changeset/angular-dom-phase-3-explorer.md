---
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-explorer-settings": patch
"@memberjunction/ng-entity-permissions": patch
"@memberjunction/ng-entity-form-dialog": patch
"@memberjunction/ng-list-detail-grid": patch
"@memberjunction/ng-simple-record-list": patch
---

Angular DOM unit-testing — Phase 3 (`Angular/Explorer/**`) complete: 100% in-scope
component coverage (129/129 unit-DOM-testable components; deferred buckets catalogued in the
Phase-3 deferral register, no silent gaps). Test-only additions — no runtime/API change.

Build hygiene (the one shipped-artifact change): each DOM-testing Explorer package's build
`tsconfig.json` now excludes `*.test.ts` / `*.spec.ts` / `__tests__/**` (previously several
compiled specs into `dist`). Specs are type-checked via each package's `tsconfig.spec.json` and
run under the vitest DOM preset; they are no longer emitted into the published output.
