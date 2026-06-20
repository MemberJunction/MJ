---
"@memberjunction/react-runtime": patch
---

Fix `cache-manager` build failure under Node typings — the cleanup timer used `window.setInterval`/`window.clearInterval` (DOM-typed, returns `number`) while `cleanupTimer` is declared as `ReturnType<typeof setInterval>` (Node's `Timeout`), causing `TS2322: Type 'number' is not assignable to type 'Timeout'`. Switched to the bare global `setInterval`/`clearInterval`, whose return type matches the declaration and works in both browser and Node runtimes.
