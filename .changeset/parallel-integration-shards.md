---
"@memberjunction/testing-engine-base": patch
"@memberjunction/testing-engine": patch
"@memberjunction/testing-cli": patch
"@memberjunction/cli": patch
---

Add `--transport=server|client|all` and `--shard=<index>/<total>` options to `mj test suite` and `TestEngine.RunSuite`, enabling deterministic Longest Processing Time (LPT) sharding and parallel multi-DB execution in the SQL Server deterministic integration CI workflow.
