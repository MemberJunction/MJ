# @memberjunction/standards

## 6.1.0-edge.0

### Patch Changes

- Key the `Ensure migrations are valid` workflow's concurrency group by ref.

  It used the constant group `"changes"` with `cancel-in-progress: true`. A constant group is repo-wide, not per-PR: any push to any open PR cancelled the in-flight migration check on every _other_ PR, so the gate could only report on whichever PR pushed most recently, and re-running one simply moved the cancellation elsewhere. In practice the check was structurally unable to be green on more than one PR at a time — and a genuinely failing migration could go unreported because its run was cancelled rather than executed.

  Every other PR-scoped workflow in the repo (`test.yml`, `integration.yml`, `docs-site-ci.yml`) already keys its group by `github.ref`. This brings the migration gate in line. No change to what the gate checks.

- 190db45: ui-layers: stop flagging a manifest dependency declaration when it backs a
  marker-excused import. Knip's dependency-check gate requires every real import
  to be declared, so an `mj-ui-layers-allow`-excused import forces a declaration —
  flagging that declaration put the two gates in deadlock (seen with
  `@memberjunction/ng-shared` in `ng-file-storage`, tracked in MJ#3404). An
  unexcused import of the same module still flags on its own line, and a
  declaration with no excused import behind it still flags.
