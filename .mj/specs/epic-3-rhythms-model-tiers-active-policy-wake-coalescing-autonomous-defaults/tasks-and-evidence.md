# Tasks, Execution Slices & Verification Evidence

- **Canonical Spec Directory:** `.mj/specs/epic-3-rhythms-model-tiers-active-policy-wake-coalescing-autonomous-defaults/`
- **Branch:** `factory/0b1b07d2-epic-3-rhythms-model-tiers`
- **Pull Request:** `#6840`

## Execution Slices
| Slice | Task ID | Factory Plan ID | Scope | Status |
| --- | --- | --- | --- | --- |
| Slice 1 | `0B1B07D2-AE55-4BD5-97CC-10423E344BD6` | `1AD7420B-4092-489C-BAD1-57551C885DF2` | Rhythms Model Tiers migration, CodeGen entities, `rhythm-model-tiers.ts`, rhythm templates, actions & UI tier selection | Completed |
| Slice 2 | `0B1B07D2-AE55-4BD5-97CC-10423E344BD6` | `F3D8252E-EC68-447D-8CB4-5D8327FE9FC6` | Active policy batch/single guards, `EventWakeCoalescer`, `WakeStartupGuard`, dispatcher/trigger/mailbox unification | Completed |
| Slice 3 | `3D905C4A-8A2E-43E0-A179-14D8F53412E0` | `57BEBFA8-1205-4CE8-A81E-CB563691D0F6` | Autonomous coordination & safe channel defaults (`Autonomous`, `DraftOnly`, `ProposeWithApproval`, `Disabled` phone), complete Epic 3 acceptance suite (`autonomous-policy-defaults.spec.ts`, `epic3-acceptance.spec.ts`), repo spec/changeset/CI gate verification | Active |

## Required Verification Artifacts
| Artifact ID | Kind | Purpose | Target |
| --- | --- | --- | --- |
| `ART-1` | `BuildLog` | TypeScript compilation across `@memberjunction/ai-agents` and affected workspace packages | `packages/AI/Agents` |
| `ART-2` | `MigrationDryRun` | Migration sequence, CodeGen tail, and standards validation for `V202611220625__v6.3.x__Rhythm_Model_Tiers.sql` | `migrations/v6/V202611220625__v6.3.x__Rhythm_Model_Tiers.sql` |
| `ART-3` | `IntegrationSuiteRun` | Epic 3 end-to-end acceptance & regression test execution | `packages/AI/Agents/src/__tests__/epic3-acceptance.spec.ts` |
| `S1-ART-1` | `BuildLog` | Slice 1 package builds (`MJCoreEntities`, `AI/Agents`, `Scheduling/engine`, `CoreActions`) | `packages/AI/Agents` |
| `S1-ART-2` | `TestRun` | Slice 1 `rhythm-model-tiers.spec.ts` & routine tier test runs | `packages/AI/Agents/src/__tests__/rhythm-model-tiers.spec.ts` |
| `S1-ART-3` | `MigrationDryRun` | Slice 1 migration & CodeGen validation | `migrations/v6/V202611220625__v6.3.x__Rhythm_Model_Tiers.sql` |
| `S2-ART-1` | `BuildLog` | Slice 2 package builds (`AI/Agents`, `Scheduling/engine`, `MessagingAdapters`, `MJServer`) | `packages/AI/Agents` |
| `S2-ART-2` | `TestRun` | Slice 2 `wake-coalescing-and-policy-guard.spec.ts`, `wakeStartupLifecycle.test.ts`, dispatcher tests | `packages/AI/Agents/src/__tests__/wake-coalescing-and-policy-guard.spec.ts` |
| `S3-ART-1` | `BuildLog` | Slice 3 full affected-package builds (`AI/CorePlus`, `MJCoreEntities`, `MJCoreEntitiesServer`, `CoreActions`, `AI/Agents`, `ng-dashboards`) | `packages/AI/Agents` |
| `S3-ART-2` | `IntegrationSuiteRun` | Slice 3 `autonomous-policy-defaults.spec.ts`, `epic3-acceptance.spec.ts`, `AgentUserPolicyEngine.test.ts`, `chief-of-staff-actions.test.ts`, `MJAIAgentUserPolicyEntityServer.test.ts`, `chief-of-staff-agent-context.test.ts` | `packages/AI/Agents/src/__tests__/epic3-acceptance.spec.ts` |
