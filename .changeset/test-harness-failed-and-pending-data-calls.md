---
"@memberjunction/react-test-harness": patch
---

Report failed and unfinished data calls in `dataAccess`. `BuildDataAccessRecord` now records a result with `Success: false` as a failure carrying its `ErrorMessage` (a client-database timeout was recorded as a 0-row success), and `RunView` / `RunViews` / `RunQuery` calls are recorded when they start, so a call still running when the test finishes is reported as "still running after Ns" instead of being missing. Debug logs print FAILED for failed results.
