---
"@memberjunction/computer-use": patch
"@memberjunction/computer-use-engine": patch
"@memberjunction/cli": patch
"@memberjunction/testing-cli": patch
"@memberjunction/testing-engine": patch
"@memberjunction/testing-engine-base": patch
---

Add full-stack regression test suite for MJ Explorer driven by the Computer Use engine. New `Drag` browser action with smooth multi-step mouse motion, parallel browser worker contexts shared across tests with auto-rotation after 20 uses, JSON-on-disk run comparison via `mj test compare --from-json`, and `--dry-run` / `--parallel` / `--flaky-check` flags on the testing CLI.
