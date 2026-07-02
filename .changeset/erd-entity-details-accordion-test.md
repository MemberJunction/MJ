---
"@memberjunction/ng-entity-relationship-diagram": patch
---

Fix the `EntityDetailsComponent` DOM test suite, which failed with `NG0304: 'mj-accordion-panel' is not a known element`. The Fields / Related-Entities sections were migrated to `<mj-accordion-panel>` but the isolated test's TestBed never registered `MJAccordionModule`, and two assertions still targeted the pre-migration DOM (`.fields-section h4` header and a `.section-title-group` click target). The test now imports `MJAccordionModule` and asserts against the accordion structure (`.erd-section-title` title, `.mj-accordion-header` toggle).
