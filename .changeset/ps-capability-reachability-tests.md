---
'@memberjunction/predictive-studio': patch
'@memberjunction/testing-integration': patch
'@memberjunction/integration-test-suite': patch
'@memberjunction/server-bootstrap-lite': patch
---

Predictive Studio: test what the platform advertises, not just what it stores

Ten defects were found building the signal, finding and architecture layers. The 4,000+ unit tests
caught none of them, and neither did the existing integration bundle — not because coverage was thin,
but because both were looking at the wrong thing. Every one of the ten had the same shape: a
capability wired at one layer and contradicted at the layer above, where an optional field's absence
did double duty, so "not applicable" and "failed" were indistinguishable.

Two new bundles close the two gaps that left:

- **IT87 — cross-row consistency.** Sweeps *every* Predictive Studio row that exists and asserts the
  rows agree with each other: a component claiming `IsTrained` carries the artifact that makes it
  loadable, nothing carries a `Story` without a `StoryVector`, a model and its root component point
  at each other, a composed model carries the graph it was composed from. Read-only, no LLM, no
  sidecar, well under a second. Each check reports the population it scanned and says `VACUOUS` at
  zero, so an empty sweep can never read as a real pass.
- **IT88 — capability reachability.** Trains a real model through the real engine and sidecar, then
  asks whether what the platform advertises actually works against what that training produced: are
  the signals it left behind computable standalone, is its trained state genuinely reusable, does its
  lineage read back. Gated by `requiresEnv: PS_INTEGRATION` so it reports a real `Skipped` rather
  than a pass when the live environment is absent — but once opted in, a missing prerequisite fails
  with the reason instead of skipping quietly.

Two product fixes those tests forced out:

- `ReuseFinder` offered components on `IsTrained` alone while the graph loader refuses any component
  without a stored artifact, so it advertised candidates guaranteed to fail at the point of use. It
  now requires both, matching what the loader will accept.
- The generated class-registration manifest predated the ML entity server subclasses, so in any
  process booting from it — `mj sync push` among them — the subclasses never registered,
  `EmbedTextLocal` threw, `GenerateEmbedding` swallowed it, and rows saved with NULL vectors and no
  error. Every seeded component type was silently unsearchable by meaning. Manifest regenerated.
