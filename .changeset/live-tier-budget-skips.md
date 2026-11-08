---
"@memberjunction/testing-integration": patch
---

A check the integration run budget never started is recorded as a skip with the reason "not run: budget exhausted" instead of a failed check. The skip is never allowed, so the suite's skip gate still fails the run, but the summary separates lost coverage from real check failures. Adds `BUDGET_EXHAUSTED_SKIP_PREFIX`.
