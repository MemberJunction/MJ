# Product Brief: Epic 3 — Rhythms Model Tiers, Active Policy & Wake Coalescing, Autonomous Defaults (MJ)

- **Version:** 1.0
- **Slug:** `epic-3-rhythms-model-tiers-active-policy-wake-coalescing-autonomous-defaults`
- **Task ID:** `0B1B07D2-AE55-4BD5-97CC-10423E344BD6`
- **Epic Factory Plan ID:** `1AD7420B-4092-489C-BAD1-57551C885DF2`
- **Shape Up Appetite:** `LargeBatch_FullEpic`

## Problem Statement
MemberJunction's Chief of Staff & scheduled user routines require predictable model cost/latency tiering, strict onboarding policy gating, storm-resistant event coalescing, and safe autonomous defaults for newly onboarded users:
1. **Rhythms Model Tiers (3.1)**: Routine definitions and rhythm templates need typed semantic model tier support (`Fast` / Draft, `Standard`, `High Power`) resolving cleanly via `AIConfiguration` / `AgentConfigurationID` instead of ad-hoc raw model overrides, with user-level overrides and per-execution tier resolution.
2. **Active Policy Gate & Wake Coalescing (3.2)**: Users without an active policy row (`policy === null` or `Status !== 'Active'`) must receive zero proactive agent wakes across scheduled dispatches, event triggers, and startup scans. High-frequency bursts (e.g., 20 task assignments in one minute for an onboarded user) must coalesce cleanly into a single scheduled wake without dropping source context.
3. **Autonomous Coordination Default (3.3)**: Newly created `MJ: AI Agent User Policies` records must start in `Autonomous` coordination mode while maintaining safe conservative channel defaults (`EmailChannelMode = 'DraftOnly'`, `CalendarChannelMode = 'ProposeWithApproval'`, `PhoneChannelMode = 'Disabled'`) until explicitly escalated by the user.

## Shape Up MVP Cutline & Non-Goals
### In-Scope (MVP Cutline)
- **Slice 1 (Rhythms Model Tiers 3.1)**: Schema migration `migrations/v6/V202611220625__v6.3.x__Rhythm_Model_Tiers.sql` adding `ModelTier` / `DefaultModelTier` / `AllowTierOverride`, regenerated `@memberjunction/core-entities`, typed `rhythm-model-tiers.ts` resolution helpers, rhythm template metadata updates, Chief of Staff action & UI parameter support.
- **Slice 2 (Active Policy Gate & Wake Coalescing 3.2)**: `wake-policy-guard.ts` (`CheckActivePolicy`, `CheckActivePoliciesForBatch`, `EvaluateWakeEligibility`), `wake-coalescer.ts` (`EventWakeCoalescer`), startup guard (`WakeStartupGuard` & `MJServer` startup lifecycle hook), and unified gating across `AgentWakeTriggerService`, `UserRoutineDispatcherDriver`, and `InboundUtilityMailboxIngestionService`.
- **Slice 3 (Autonomous Coordination Default 3.3 & Complete Acceptance Suite)**: `DEFAULT_AGENT_USER_POLICY_POSTURE` and `ApplyDefaultAgentUserPolicyValues` in `AgentUserPolicyEngine`, `MJAIAgentUserPolicyEntityServer`, `ConfigureAgentUserPolicyAction`, Chief of Staff draft builders & prompt template, schema `DEFAULT` constraints and `spCreateAIAgentUserPolicy` parameter defaults, plus comprehensive unit & acceptance test suites (`autonomous-policy-defaults.spec.ts`, `epic3-acceptance.spec.ts`).

### Non-Goals
- Hand-authoring `migrations-pg/**` files (handled by release PG transpilation tooling per MJ repo policy).
- Weakening external communication or phone approval guardrails when a user has not explicitly opted in.

## Critical User Journeys (CUJs)
### CUJ-1: Multi-User Rhythm Tier Resolution (`Fast` vs `High Power`)
Two users execute the same rhythm template configured on `Draft` (`Fast`) vs `High` (`High Power`); each agent run resolves its tier's `AIConfigurationID` and executes on its respective tier model.

### CUJ-2: Burst Event Coalescing
Assigning 20 tasks to one onboarded user within 60 seconds via `EventWakeCoalescer` and `AgentWakeTriggerService` coalesces into a single wake with merged context.

### CUJ-3: Strict Non-Onboarded / Inactive Policy Isolation
A user with no policy or an inactive (`Paused`/`Disabled`) policy receives zero wakes across scheduled routine dispatch, event triggers, inbound email wakes, and startup catch-up scans.

### CUJ-4: Autonomous Onboarding Posture
Creating a new `MJ: AI Agent User Policies` record via DB default, `MJAIAgentUserPolicyEntityServer`, `ConfigureAgentUserPolicyAction`, or UI draft defaults to `CoordinationMode = 'Autonomous'`, `EmailChannelMode = 'DraftOnly'`, `CalendarChannelMode = 'ProposeWithApproval'`, and `PhoneChannelMode = 'Disabled'`.
