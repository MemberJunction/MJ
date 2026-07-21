---
"@memberjunction/global": patch
---

Stop the ClassFactory resolution-fallback instrumentation (added in #3197) from flooding builds.

Two false-positive classes were being reported as fallback "failures":

- **Null/empty key** — `CreateInstance(LoggerBase, null)` means "give me the default implementation for this base". Landing on the base is the *intended* outcome, not a failed lookup.
- **Unbounded volume on hot paths** — the dedup keyed on `(base, key)`, which does nothing for callers whose key varies per item. Every `EntityField` hydration calls `CreateInstance(EntityField, '<entity>.<field>')`, so a full repo build emitted thousands of distinct warnings and buried anything real.

Null-key fallbacks are no longer reported, and remaining fallbacks are capped **per base class** (3, then one summary line). Marker-bearing (`@RequiresSubclass()`) bases are never capped — those are hard errors.

Suppressing by "this base has no registrations" was tried and **reverted**: a tree-shaken registration leaves zero registrations, which is exactly the B34/B35 shape this instrumentation exists to catch. The unit tests caught that regression.

Verified: full repo build (293 + 265 tasks) emits **zero** ClassFactory warnings; MJGlobal 581 tests pass.
