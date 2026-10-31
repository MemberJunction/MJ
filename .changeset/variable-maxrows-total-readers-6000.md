---
"@memberjunction/integration-engine": patch
"@memberjunction/record-set-processor-base": patch
---

Keep the real row total where a variable `MaxRows` can be 1 (#6000). Run-history retention reads `keep + 1` runs and counts them, so `MJ_INTEGRATION_MAX_RUNS_PER_CI=1` prunes again. The list, view and filter record-set sources read two rows for a batch of one and keep the first, so the reported progress total stays the full count.
