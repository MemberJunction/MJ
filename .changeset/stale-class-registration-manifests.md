---
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-bootstrap-lite": patch
---

Regenerate the class-registration manifests so `RecordProcessFormComponentExtended` and `RecordProcessFormPolicy` are wired in. Both were added with `@RegisterClassEx` in #4636 without regenerating the manifests, leaving `Build` red on `next` at the freshness gate — and, more importantly, leaving the policy eligible for tree-shaking in bundled apps, which would silently drop the Record Processes form's lead-group decoration.
