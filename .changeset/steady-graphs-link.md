---
"@memberjunction/cli": patch
---

Declare `@memberjunction/cli` as a devDependency of the MJExplorer and MJAPI apps so their `prebuild` invocation of `mj codegen manifest` always runs against a built CLI. Without the edge, turbo's affected-package PR filtering (`--filter=...[origin/next]`) never selected or ordered the CLI build, leaving the workspace `mj` bin an empty oclif shell — `Error: command codegen:manifest not found` — and MJExplorer's build then failed hard (TS2307) because its generated class-registrations manifest is gitignored and has no committed fallback. The apps themselves are unpublished (`mj_*` is changeset-ignored); this entry records the CLI-consumption contract fix in the release notes.
