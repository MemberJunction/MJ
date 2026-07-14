## 2025-02-13 - Mocking FieldByName in Unit Tests
**Learning:** When migrating from `Fields.find()` to `FieldByName()` for O(1) field lookups on `EntityInfo`, existing unit tests that manually mock the `EntityInfo` object will fail with "FieldByName is not a function" unless updated.
**Action:** Always ensure that when migrating an O(N) array scan to a cached method on a domain object, the corresponding test mocks are updated to include a stub implementation of that method (e.g., `FieldByName: (name: string) => fields.find(f => f.Name === name)`).
## 2026-07-11 - FieldByName internal matching
**Learning:** The `FieldByName(name)` method in `EntityInfo` internally handles `.trim().toLowerCase()` for field name comparisons.
**Action:** It is a safe and exact O(1) replacement for `Fields.find(f => f.Name.trim().toLowerCase() === name.trim().toLowerCase())` without risking case-sensitivity regressions.
