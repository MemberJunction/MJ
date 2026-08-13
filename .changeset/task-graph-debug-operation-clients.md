---
'@memberjunction/core-entities': patch
---

Generated remote-operation clients for the workflow debug verbs that #3770 shipped.

The Run Console calls eight control verbs — pause, resume, step, set breakpoints, override path, skip step, force-complete step, update step input — and #3770 added their rows to `metadata/remote-operations`. The generated client classes are produced by CodeGen *from the database*, so they do not exist until someone pushes that metadata and regenerates. Until then the console's controls have no typed client to call.

This is that regeneration, run against a from-scratch database (migrations → DB-side CodeGen → `mj sync push --dir=metadata` → file CodeGen), which is what proves the classes come from the repo's own metadata rather than from state a long-lived dev database happened to hold.

Additive except for one deliberate change CodeGen picked up with them: `TaskGraphRetryInput` gains an optional `inputPayload`, so an operator who can see why a step failed can correct the brief for the re-run.
