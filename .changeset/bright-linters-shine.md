---
"@memberjunction/react-test-harness": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Refactor component linter: extract rules into self-registering individual files, then consolidate overlapping rules from 63 down to 55 (including merging 10 RunView/RunQuery rules into 3). Add search utility validation rules, improve render-loop detection with rate-of-growth analysis, fix variable reference resolution in RunQuery parameters, and fix @babel/traverse ESM default imports. Enhance TypeInferenceEngine with useState/callback/setState type propagation, implement 3-tier metadata fallback (spec → registry → skip-with-warning), and add individual-test-per-fixture for clear regression debugging. Includes architecture documentation updates.
