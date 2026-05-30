# Locked Primitives

These are the sub-workflows the planner MUST compose with. Each carries a structural
guarantee that no composition can weaken. The floor-check (`floor-check.workflow.js`)
rejects any run that omits a required primitive or weakens its declared parameters.

| Primitive | Guarantee |
|-----------|-----------|
| `verify-claim` | A claim only "exists" in the contract if its provenance script reproduces against the pinned source. |
| `audit-source` | Source rankings are structured/reproducible, not self-scored. |
| `compute-source-diff` | Completeness is computed (set diff), not judged. |
| `gap-fill-fork` | Fork output flows through structured handoff; canonical workspace never fragmented. |
| `loop-until-dry` | Exit condition is structural (K consecutive empty rounds), not producer-declared. |
| `adversarial-verify` | N independent skeptics on a different model, blind, prompted to refute; majority survives. |
| `extract-iiof-pipeline` | Per-item independent extraction + verification before any synthesis. No huge token returns. |
| `freeze-contract` | Code-builder consumes only frozen contract; ad-hoc churn impossible. |
| `amendment-review` | Dynamic mutations route through AST diff classification; gate-weakening rejected. |
| `verification-ladder` | T0..T12; cannot ascend without lower rungs green; failures classified via `SyncErrorCode`. |
| `floor-check` | Final structural gate: bijection slots filled + verified + manifest declarations met. |

## Authoring rules (per plan §13a)

- Each primitive is a standalone Workflow script invoked via `workflow({scriptPath:...})`.
- Inputs/outputs declared by Zod-equivalent JSON Schema embedded in the script.
- No `Date.now()` / `Math.random()` / argless `new Date()` at top level (would break
  `resumeFromRunId`). Stamp at result-write time; pass timestamps via `args`.
- Outputs that reference vendor records strip credentials + PII (scrub-fixture).

These stubs declare the shape (description + meta + I/O schemas) so the planner can
reference them by name and the floor-check can verify presence. Concrete
implementations land iteratively during the learning phase (§9 of the agentic plan).
