---
"@memberjunction/react-test-harness": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Refactor component linter: extract all 70 rules into self-registering individual files (10,879 → 1,402 lines), add 8 new validation rules (entity/query field access, child component props, chart/datagrid fields, RunView null safety, AI tools availability), enhance TypeInferenceEngine with useState/callback parameter/setState type propagation, implement 3-tier metadata fallback (spec → registry → skip-with-warning), and achieve 90% coverage on forward-looking test fixtures (43/48). Includes architecture documentation and visitor-merging optimization plan.
