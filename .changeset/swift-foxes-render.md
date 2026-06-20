---
"@memberjunction/ng-test-utils": patch
"@memberjunction/ng-ui-components": patch
"@memberjunction/ng-pagination": patch
"@memberjunction/ng-tabstrip": patch
---

Add the Angular DOM unit-testing foundation: a new `@memberjunction/ng-test-utils` package providing `renderComponentFixture` (standalone/leaf components) and `renderTemplate` (compound / module-declared components) helpers, the Vitest + jsdom DOM-testing harness, coverage reporting in the DOM preset, a `scaffold-tests.mjs --dom` flag (with a spaces-in-path fix), and DOM specs across `ng-ui-components`, `ng-pagination`, and `ng-tabstrip`. Code-only, no schema changes.
