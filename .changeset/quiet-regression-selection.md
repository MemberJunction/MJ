---
'@memberjunction/testing-cli': patch
'@memberjunction/cli': patch
---

`mj test suite --test <name>` and `mj test regression up --test <name>` run only the named tests of a suite (repeat the flag for more than one). `mj test scripts` takes `--format` (console, markdown or json) and `--output`, so its drift report can go into a PR body, and it now exits when it is done instead of staying open.
