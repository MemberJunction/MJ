# @memberjunction/predictive-studio

Server-side engine for **MemberJunction Predictive Studio**. This package is a
**scaffold** — the real components land in later phases. It composes onto existing
MJ substrates (Record Set Processing, Remote Operations, Agents, Vectors) and a
Python ML sidecar, per [`plans/predictive-studio.md`](../../../../plans/predictive-studio.md).

## Planned components (see `src/index.ts` region block)

- **FeatureAssembly executor** — `(record set, frozen FeatureSteps) → matrix`, identical across train / scheduled / on-demand scoring (§6)
- **TrainingEngine** — orchestrates `/train` against the sidecar, persists immutable versioned `MJ: ML Models` (§3/§4.3)
- **MLModelInferenceProcessor** — Record Set Processing work type for batch + single-record scoring with optional write-back (§10)
- **ExperimentOrchestrator** — deterministic plan executor running iterations in waves through Record Set Processing (§8.3/§9.1)
- **SidecarClient** — typed client for the `/train` + `/predict` sidecar contract (§3.2)

## Dependencies

- `@memberjunction/predictive-studio-core` — type contracts
- `@memberjunction/core`, `@memberjunction/core-entities`, `@memberjunction/global`

## Build & test

```bash
npm run build   # tsc && tsc-alias -f
npm run test    # vitest run
```
