---
"@memberjunction/react-test-harness": patch
"@memberjunction/ng-dashboards": patch
---

Component linter bug fixes and new rules: fix false positives on multi-component tree query delegation, SQL injection detection, datagrid computed fields, and optional chaining; consolidate duplicated utilities into shared lint-utils; add event-parameter-validation rule that catches wrong event property access (e.g., e.data vs e.record); replace substring SQL keyword matching with structural pattern detection.
