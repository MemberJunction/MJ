---
"@memberjunction/server": patch
---

fix(integration): IntegrationStartSync no longer returns an optimistic Success+null-RunID for fast/no-op syncs

`IntegrationStartSync` fired the async sync, slept a fixed 200ms, then looked up the
run by `Status='In Progress'`. When a run finished in under 200ms — an empty connector,
a 0-record sync, or a fast synchronous failure — there was no 'In Progress' row left to
find, so the resolver returned `{ Success: true, RunID: null }`: an untrackable result
that read as "started" when the caller had nothing to follow (and, in the genuine no-op
case, masked that nothing ran).

The lookup now resolves the run by **recency** (`StartedAt >= firedAt`, any status) over a
short bounded poll, so an already-finished run is still reported with its real `RunID`.
When no run record appears in the window — the connector genuinely no-op'd before creating
one — it returns `Success: false` with an explanatory message instead of an optimistic
`Success: true`, so a caller/scheduler can act on the failure rather than be silently
stranded. Surfaced by the Path LMS and ORCID hybrid-e2e runs.
