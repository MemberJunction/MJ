---
"@memberjunction/core-entities": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/predictive-studio-truth-suite": patch
---

Tests only: widen wall-clock ceilings that flake on the publish gate's single shared runner. SpreadsheetEngine R8-3's import and round-trip bounds are doubled; two pathological-input checks get the 2 s ceiling.
