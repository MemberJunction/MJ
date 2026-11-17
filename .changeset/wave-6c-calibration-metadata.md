---
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ng-conversations": patch
---

Move Wave 6C edge agent pre-discovery Platt calibration parameters into `ModelConfiguration.Decision.Calibrations` metadata (`metadata/ai-models/.edge-discovery-models.json`) for `ms-marco-MiniLM-L-6-v2 (Local)` and resolve them via `FindDecisionCalibration` and `ApplyPlattCalibration` (keeping the verified `{ A: 1.0, B: 3.8 }` PoC fit as fallback when metadata is unloaded or unsynced).
