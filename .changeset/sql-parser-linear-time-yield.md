---
"@memberjunction/sql-parser": patch
---

The SQL parser's linear-time tests now yield to the event loop between measurements. Each test ran minutes of synchronous parsing, which kept its Vitest worker from answering and failed the v6.2.0-edge.7 publish gate with "Timeout calling onTaskUpdate" after every test had passed.
