---
'@memberjunction/standards': patch
---

Key the `Ensure migrations are valid` workflow's concurrency group by ref.

It used the constant group `"changes"` with `cancel-in-progress: true`. A constant group is repo-wide, not per-PR: any push to any open PR cancelled the in-flight migration check on every *other* PR, so the gate could only report on whichever PR pushed most recently, and re-running one simply moved the cancellation elsewhere. In practice the check was structurally unable to be green on more than one PR at a time — and a genuinely failing migration could go unreported because its run was cancelled rather than executed.

Every other PR-scoped workflow in the repo (`test.yml`, `integration.yml`, `docs-site-ci.yml`) already keys its group by `github.ref`. This brings the migration gate in line. No change to what the gate checks.
