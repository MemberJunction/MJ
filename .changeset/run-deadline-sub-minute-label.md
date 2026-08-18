---
'@memberjunction/integration-engine': patch
---

Report a sub-minute connector-run deadline in seconds rather than rounding to
minutes, and add the first test coverage for `RunDeadlineMs`.

`RunDeadlineMs` is a public option and a caller may pass seconds, where rounding
produced "the run deadline of 0min" — which reads as a pipeline bug rather than
the limit the caller asked for. The 45min default is unaffected.

The three new tests pin what a live run against a real database proved: a stage
that never returns is failed *and* writes `result.json` (the point of the
deadline, since a run is reported in-flight precisely when that file is absent),
the label renders in seconds, and `0` means "no deadline" rather than "already
expired".
