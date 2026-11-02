---
"@memberjunction/sql-parser": patch
---

Run the SQL parser's tests in two forked workers. Its CPU-bound linear-time suites starved the Vitest main process on a 2-core CI runner, which failed the v6.2.0-edge.7 publish gate with "Timeout calling onTaskUpdate" after every test had passed.
