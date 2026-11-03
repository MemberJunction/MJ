---
"@memberjunction/actions": patch
---

An action that runs inside an open transaction (a Durable entity action enlisted in its record's save) now waits for its execution-log writes before returning, so the log row's outcome and message land before the transaction commits instead of being refused after it.
