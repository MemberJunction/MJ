---
"@memberjunction/ai-agents": patch
"@memberjunction/ng-dashboards": patch
---

Memory-leak audit round 21: `AgentDataPreloader`'s per-agent cache is now an `MJLruCache` capped at 200 entries (it held one full dataset per user × agent × data source and only dropped an expired entry when the same key was read again). Component Studio's drag-resize now detaches its `document` mouse listeners if the dashboard is destroyed mid-drag.
