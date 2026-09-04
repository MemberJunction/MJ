---
"@memberjunction/integration-engine": patch
---

An object the account cannot serve no longer advances its watermark.

The `OBJECT_UNAVAILABLE` branch broke out of the fetch loop leaving `fetchCompletedCleanly` true, so
control fell into the clean-fetch branch and treated a map that fetched **zero records** as one that
had seen the complete set. On a full sync — and on a first encounter, where no watermark row exists
yet — that minted a wall-clock `Timestamp` watermark. When the account later enabled the object, the
next incremental filtered `modified > <the moment of the failed fetch>` and permanently missed every
record that already existed, destroying the self-healing this path exists to provide. The same fall-
through also ran orphan detection on an empty result and, under partition reconcile, overwrote the
stored rollup snapshot with an empty map.

The map still ends successfully with its single warning and no retry ladder — only the consequences
of "we saw everything" are withheld. The warning is also now filed under the object name rather than
the literal `'sync'`, matching every sibling warning, so per-object filtering works.
