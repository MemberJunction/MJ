---
"@memberjunction/core": patch
"@memberjunction/global": patch
---

test: compliance scans assert they covered the whole packages/ tree

The PrimaryKey, MultiProvider and UUID compliance tests now fail when they scan fewer files than a
full `packages/` tree holds, so a misresolved scan root no longer passes with zero violations.
Test-only change; no runtime code or behavior changes.
