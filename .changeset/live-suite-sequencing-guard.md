---
'@memberjunction/testing-engine': minor
---

Sequence IT85 ahead of the live suite's client bundle, and guard the invariant

`IT85 - Entity Embedded Records` is a server-transport bundle that sat at `Sequence` 69 in the
Live Model suite, behind `IT63` (client) at 15. A client bundle rebinds the process-global
provider, so IT85 bootstrapped against a `Network` provider and could not run at all:
`transport 'server' resolved a 'Network' provider — the process-global provider was rebound`.

That is the #3251 invariant, and a guard for it already existed — but it only read the
**deterministic** suite, so the live suite's violation passed 196 green tests and only surfaced
on a release run that actually executed the tier. The invariant is a property of the process, not
of one suite, so the guard now runs over both.

Verified by restoring the bad sequence: the live-model case fails with the offending pair named,
and passes once IT85 sequences ahead of IT63.
