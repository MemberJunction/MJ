---
"@memberjunction/core": patch
---

Agent docs: metadata ships only as release migrations. Individual PRs never include metadata migration SQL (reviewers should not flag its absence); the build engineer applies migrations and runs `mj sync push` against the last release to produce one net metadata migration, without rerunning CodeGen.
