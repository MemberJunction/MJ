---
"@memberjunction/integration-engine": patch
---

Report per-object progress during discovery sampling

Sampling is the expensive half of discovery — one read-path fetch per object — and it emitted
nothing between the stage's start and its completion. A 23-object source looked exactly like a
5-object one: a stage that had started, for an unbounded stretch, with no way to tell slow
progress from a wedged run.

`StageIntrospect` now emits a heartbeat per object it samples, carrying `processed` / `totalKnown`
/ `skipped` and a message that stands on its own (`Sampling "Invoice" (3 of 23)`), so a consumer
that renders only the text still reads correctly.

Two details that make the number trustworthy rather than merely present:

- The denominator is the union both sampling passes will walk — in-scope runtime objects plus
  in-scope declared ones — computed before the first sample. Counting per-loop would show
  "1 of 2" and then restart when the declared-only pass began, revising the total upward under a
  user who is watching it.
- Announcements are keyed by object name, so a connector that surfaces the same object twice
  cannot walk the count past its own denominator ("3 of 2").

An exhausted sampling budget still walks the count to the end and reports the passed-over objects
as `skipped`; freezing the count where sampling stopped would leave a completing stage looking
identical to a wedged one.

No new event type — `heartbeat` and its counts already exist, and readers already derive the
latest counts from the stream.
