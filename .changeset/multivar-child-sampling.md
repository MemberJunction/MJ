---
"@memberjunction/integration-engine": patch
---

Discovery can now sample a multi-var child — and everything beneath it — when the tuple is provable.

A child whose APIPath carries two or more template vars was deferred outright, and the deferral
CASCADED: not just `/a/{aId}/b/{bId}/d` itself but every descendant of it got no sampling at all —
no custom columns, no observed widths, and an object with no declared primary key was dropped
entirely, since sampling was its only route to one.

Real multi-var paths are overwhelmingly NESTED (`/campaigns/{cid}/funds/{fid}/gifts`, where funds is
itself a child of campaigns), and a streamed record of that innermost parent already carries the
whole tuple — its own id natively, its ancestor's tagged on by the recursion one level down. The new
sampler resolves every var, streams the innermost candidate parent, and substitutes ALL vars from
each record's own fields. A record that cannot fill every var is skipped; a candidate that proves
barren over a bounded probe is abandoned for the next; when no candidate covers, the child adjourns
to declared-only fields exactly as before.

The old deferral's constraint still holds absolutely: no partial substitution ever leaves the
process, and genuinely independent parents (neither knows the other's key) still adjourn — valid
pairs are unknowable from data, and guessing them is the malformed-request bug the deferral existed
to prevent. The difference is that a subtree now only dies when its tuple is genuinely unknowable,
not whenever an ancestor merely had two parents.
