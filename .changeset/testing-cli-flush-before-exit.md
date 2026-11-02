---
"@memberjunction/testing-cli": patch
---

`mj test suite` now waits for stdout and stderr to drain before it exits. With stdout piped (CI runs it through `| tee`), `process.exit()` discarded everything past the first 64 KiB, so a JSON suite result was cut off and the skip-gate report printed after it never appeared.
