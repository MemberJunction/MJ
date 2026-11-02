---
---

docs(claude-md): bring root CLAUDE.md back under its budget and gate it in CI

`check:claude-md` was added with the July 2026 CLAUDE.md refactor but never wired into CI, and
`next` had drifted to five failures: root `CLAUDE.md` over its byte ceiling, a machine-specific
rule linking a file outside the repo, and an unindexed guide with a cross-repo link. Root is
trimmed back under budget (every rule kept; long explanations live in the nested files they
already duplicated), the links are fixed, and a new workflow runs the check on every PR.

No published package's code or behavior changes, so the changeset carries no bump.
