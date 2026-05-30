# Connector Builder Workshop

**Branch-local, never PR'd.** This tree lives on `agentic/connector-builder` (cut
from `feat/integration-framework-expansion`). Output that ships is *connector PRs*
authored by the system, NOT this workshop's contents. See
`plans/integration-agentic-local.md` for the canonical design.

## Layout

```
connector-builder-workshop/
├── README.md                              # this file
├── primitives/                            # locked sub-workflows (§2 / §13a Gap 3)
│   ├── verify-claim.workflow.js
│   ├── audit-source.workflow.js
│   ├── compute-source-diff.workflow.js
│   ├── gap-fill-fork.workflow.js
│   ├── loop-until-dry.workflow.js
│   ├── adversarial-verify.workflow.js
│   ├── extract-iiof-pipeline.workflow.js
│   ├── freeze-contract.workflow.js
│   ├── amendment-review.workflow.js
│   ├── verification-ladder.workflow.js
│   └── floor-check.workflow.js
├── planner/                               # Gap 1 prompt + spec digest
│   ├── system-prompt.md
│   └── spec-digest.json                   # generated; consumed at run time
├── reviewer/                              # Gap 2 prompt
│   └── system-prompt.md
├── verifiers/                             # T0..T12 implementations (per-tier)
├── floor/                                 # bijection slot table source-of-truth
│   └── phase0-slots.json
├── corpus/                                # promoted lessons (gated by floor pass)
│   └── quarantine/                        # unpromoted lessons awaiting review
├── docker/                                # productization shape
├── plans/                                 # planner-emitted per-vendor workflow scripts
└── scripts/                               # spec-digest extractor + housekeeping
    └── regenerate-spec-digest.mjs
```

## Discipline (non-negotiable, per plan §0a / §13a)

- **Bijection floor-check** rejects any run with a missing Phase 0 slot or unverified
  provenance. Done is structural, not agent-declared.
- **Locked primitives** carry their guarantees with them — the planner composes
  them but cannot weaken them.
- **Credentials never enter agent context.** Opaque path → `mj-test-runner` MCP
  subprocess → results back without credential bytes.
- **PII never enters agent context.** `scrub-fixture` runs at primitive boundary;
  agent sees scrubbed view only. Test data directory wiped before PR-open
  (enforced by floor-check).
- **No auto-mutation of the framework.** Process meta-learning may propose primitive
  updates but human-gated promotion only.

## Status: skeleton

Initial scaffolding. Primitives are stubs declaring their schemas + structural
guarantees. Planner + reviewer prompts are seeded from Gap 1 / Gap 2 specs.
First end-to-end dry run targets **HubSpot ground truth** (its current code +
metadata fed as input; the workshop attempts to produce something equivalent).
No PR is opened from this branch.
