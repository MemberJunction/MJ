---
"@memberjunction/sql-parser": patch
---

The SQL parser's test run no longer fails on Vitest's own worker-RPC timeouts ("Timeout calling onTaskUpdate") when every test passed. Its CPU-bound suites starved the Vitest main process on the shared release-gate runner, which failed five v6.2.0-edge.7 publish attempts.
