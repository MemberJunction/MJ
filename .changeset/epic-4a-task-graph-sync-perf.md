---
"@memberjunction/task-graph": patch
---

Skip redundant runtime JSON parsing and already-settled terminal row re-ingestion during `TaskGraphGovernanceCoordinator` synchronization passes so large 5,000-node workflow graphs avoid $O(N^2)$ overhead under concurrent CI load.
