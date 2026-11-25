---
"@memberjunction/ng-dashboards": patch
---

AI Analytics: the Usage Patterns heatmap and the Model Performance leaderboard read the AIUsageHourly and AIUsageByModel aggregates for the whole range instead of the 1,000 most recent prompt runs. The leaderboard shows P50 latency and one cost figure per currency with the unpriced count beside it.
