# Architecture & Verification Plan: Epic 3 — Rhythms Model Tiers, Active Policy & Wake Coalescing, Autonomous Defaults (MJ)

- **Branch:** `factory/0b1b07d2-epic-3-rhythms-model-tiers`
- **Target Branch:** `next`
- **Pull Request:** `#6840`
- **Risk:** `Medium`

## Summary
Implements Epic 3 across database schema/stored procedures, entity server defaults, `AgentUserPolicyEngine`, `@memberjunction/ai-agents` (`rhythm-model-tiers`, `wake-policy-guard`, `wake-coalescer`, `AgentWakeTriggerService`), `@memberjunction/scheduling-engine` (`UserRoutineDispatcherDriver`), `@memberjunction/messaging-adapters`, `@memberjunction/server` startup lifecycle, `@memberjunction/core-actions`, Chief of Staff prompt metadata, and Explorer dashboard defaults.

## Implementation Approach
1. **Rhythms Model Tiers (`rhythm-model-tiers.ts`, `V202611220625__v6.3.x__Rhythm_Model_Tiers.sql`, `packages/MJCoreEntities`)**:
   - Add additive `ModelTier` (`'Fast' | 'Standard' | 'High Power'`), `DefaultModelTier`, and `AllowTierOverride` schema fields and CodeGen ORM updates.
   - Provide `ResolveAgentConfigurationIDInput`, `ResolveSeededRoutineAgentConfigurationID`, and `ResolveWakeAgentConfigurationID` mapping tier aliases and `AIConfiguration` lookups safely without `any`/`unknown` casts.
2. **Active Policy Gate & Burst Wake Coalescing (`wake-policy-guard.ts`, `wake-coalescer.ts`, `AgentWakeTriggerService.ts`, `UserRoutineDispatcherDriver.ts`, `packages/MJServer/src/wakeStartupLifecycle.ts`)**:
   - Gate every scheduled routine, event wake, inbound utility mailbox wake, and server startup catch-up scan on an explicit `Status === 'Active'` `MJ: AI Agent User Policies` record (`CheckActivePoliciesForBatch`, `CheckActivePolicy`, `EvaluateWakeEligibility`).
   - Coalesce burst triggers for the same user/workstream within the coalescing window using `EventWakeCoalescer` so 20 rapid task assignments collapse to one wake.
3. **Autonomous Coordination & Channel Defaults (`AgentUserPolicyEngine.ts`, `MJAIAgentUserPolicyEntityServer.server.ts`, `configure-agent-user-policy.action.ts`, `prepare-outbound-call-brief.action.ts`, `user-scoped-communication.action.ts`, `chief-of-staff-agent-context.ts`, `chief-of-staff.template.md`, `V202611220625__v6.3.x__Rhythm_Model_Tiers.sql`)**:
   - Define `DEFAULT_AGENT_USER_POLICY_POSTURE` and `ApplyDefaultAgentUserPolicyValues` as the single strongly-typed baseline (`CoordinationMode: 'Autonomous'`, `EmailChannelMode: 'DraftOnly'`, `CalendarChannelMode: 'ProposeWithApproval'`, `PhoneChannelMode: 'Disabled'`, `MessagingChannelMode: 'Enabled'`, approval flags `true`).
   - Enforce identical defaults in SQL table `DEFAULT` constraints, `spCreateAIAgentUserPolicy` parameters, `MJAIAgentUserPolicyEntityServer.Save()` on new records, `ConfigureAgentUserPolicyAction`, fallback phone checks, and UI `CreateDefaultPolicyDraft()`.
   - Expose `EvaluatePhoneOperation(policy, direction)` in `AgentUserPolicyEngine`.

## Scope Reconciliation & Dual-Dialect Verification
- **PostgreSQL Dual-Dialect Counterpart (`CR-DUAL-DIALECT-CONTRACT`)**: Per `.github/workflows/pg-migrations.yml` and `migrations/CLAUDE.md`, feature PRs do not commit files directly under `migrations-pg/**` (release-time transpilation and `check-pg-migration-content.mjs` enforce release parity). To provide full pre-merge dialect inspectability, the deterministic `packages/SQLConverter` output for `V202611220625__v6.3.x__Rhythm_Model_Tiers.sql` (0 errors, 0 gaps) is committed at `.mj/specs/epic-3-rhythms-model-tiers-active-policy-wake-coalescing-autonomous-defaults/V202611220625__v6.3.x__Rhythm_Model_Tiers.pg.sql` and verified in `packages/AI/Agents/src/__tests__/rhythm-model-tiers.spec.ts`.
- **CodeGen Angular Core Entity Forms**: Running `mj codegen` after `V202611220625__v6.3.x__Rhythm_Model_Tiers.sql` regenerated `packages/Angular/Explorer/core-entity-forms/src/lib/generated/Entities/MJAIAgentRhythmTemplate/*`, `MJAIConfiguration/*`, and `MJUserRoutine/*` to surface `DefaultAgentConfigurationID` and `AgentConfigurationID` form fields and related-entity grids cleanly in MJ Explorer.
- **Chief of Staff Dashboard Context Default Alignment**: Aligned `CreateDefaultPolicyDraft()` in `packages/Angular/Explorer/dashboards/src/ChiefOfStaff/chief-of-staff-agent-context.ts` (and `chief-of-staff-agent-context.test.ts`) to `CoordinationMode: 'Autonomous'` so UI-created policy drafts match the SQL schema, `spCreateAIAgentUserPolicy`, `MJAIAgentUserPolicyEntityServer`, and `AgentUserPolicyEngine` defaults.

## EARS Acceptance Specifications
| Criterion | EARS Requirement | Verified By |
| --- | --- | --- |
| `AC-1` | Two users executing the same rhythm configured on different model tiers (`Fast`/Draft vs `High Power`/High) SHALL resolve and execute agent runs using their respective tier `AgentConfigurationID` models. | `ART-1`, `ART-3`, `S1-ART-1`, `S1-ART-2`, `S3-ART-2` |
| `AC-2` | Assigning 20 tasks to an onboarded user with an `Active` policy within a 60-second window SHALL coalesce into a single scheduled wake rather than 20 separate runs. | `ART-3`, `S2-ART-1`, `S2-ART-2`, `S3-ART-2` |
| `AC-3` | A user with no `MJ: AI Agent User Policies` row or an inactive (`Pending`, `Paused`, `Disabled`) policy SHALL receive zero agent runs across routine dispatch, event wakes, inbound email wakes, and startup catch-up scans. | `ART-3`, `S2-ART-2`, `S3-ART-2` |
| `AC-4` | Newly created `MJ: AI Agent User Policies` records SHALL default to `CoordinationMode = 'Autonomous'`, `EmailChannelMode = 'DraftOnly'`, `CalendarChannelMode = 'ProposeWithApproval'`, and `PhoneChannelMode = 'Disabled'` (`Off`) across SQL schema, stored proc, entity server, actions, engine, and UI draft builders. | `ART-2`, `S3-ART-1`, `S3-ART-2` |
