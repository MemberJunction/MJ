---
"@memberjunction/global": patch
---

Two hot-path costs removed from MJGlobal with byte-identical behavior:

- **ClassFactory builds its resolution-failure diagnostic lazily.** The multi-KB string (a scan over every registration in the process) was built on every fallback resolution and then, on the designed probe path (`@OptionalKeyedSpecialization` — once per field of every entity), discarded unread. It is now computed only when something actually reads it — `CreateInstance`'s hard error still gets it eagerly, an emitted report formats it exactly as before, and the fallback result's `Reason` is an enumerable getter returning the identical, memoised string (spread/`JSON.stringify`/`Object.keys` unchanged). `GetAllRegistrations` also hoists its loop-invariant name/key normalization out of the per-registration filter.
- **`GetGlobalObjectStore` stops throwing on every server call.** In Node, bare `if (window)` on the undeclared identifier threw a `ReferenceError` per call, with the catch falling through to `global` — correct answer, pathological path, measured at several percent of a busy server's CPU. `typeof` probes (legal on undeclared identifiers) replace the try/catch ladder, and the answer — fixed at process startup by definition — is memoised. Node still gets `global`, the browser still gets `window`, an exotic sandbox still gets `null`.
