---
"@memberjunction/core": patch
---

`TelemetryManager`'s insight dedupe window is now actually bounded. Its keys are stamped with wall-clock time, but the periodic sweep compared them against the performance clock, so no key ever aged out; the sweep now ages them against wall-clock time. Every storage provider's `SupportsCrossProcessPersistence` value is now pinned by a test.
