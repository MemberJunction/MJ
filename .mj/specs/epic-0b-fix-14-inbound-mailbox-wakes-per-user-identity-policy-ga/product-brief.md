# Product Brief: Epic 0b — Fix 14: Inbound Mailbox Wakes Per-User Identity & Policy Gate (MJ)

- **Version:** 1.0
- **Slug:** `epic-0b-fix-14-inbound-mailbox-wakes-per-user-identity-policy-ga`
- **Task ID:** `3C868BDF-2AFD-4D4D-8FAA-3D3CA56492E0`
- **Factory Plan ID:** `3D4FFB4C-7DF1-4B8C-A545-E63D7BBF616F`
- **Shape Up Appetite:** `MediumBatch_1to2Weeks`

## Problem Statement
`AgentWakeTriggerService.RouteInboundUtilityMailboxWake` routes inbound emails addressed to an active `MJ: AI Bridge Agent Identities` mailbox (`IdentityType = 'Email'`) into immediate `AgentWake` routines (`MJ: User Routines`). Prior to Fix 14, `RouteInboundUtilityMailboxWake`:
1. Did not enforce `identity.UserID` when a bridge identity was dedicated to a specific MJ user unless `Configuration.allowedUserID` was duplicated in JSON.
2. Permitted wakes when a sender had no `MJ: AI Agent User Policies` row (`policy === null`), bypassing the mandatory `Active` onboarding policy gate enforced by `TriggerWakeForWorkstream`.

## Shape Up MVP Cutline & Non-Goals
### In-Scope (MVP Cutline)
- Enforce `identity.UserID` ownership using `UUIDsEqual(identity.UserID, senderUser.ID)` when `identity.UserID` is populated, returning `SENDER_NOT_AUTHORIZED_FOR_IDENTITY` on mismatch.
- Require an existing `MJ: AI Agent User Policies` row with `policy.Status === 'Active'` (returning `POLICY_DENIED` when missing or `Pending`/`Paused`/`Disabled`), while preserving `EmailChannelMode === 'Disabled'` rejection.
- Update JSDoc on `RouteInboundUtilityMailboxWake` and policy documentation in `packages/AI/Agents/README.md`.
- Comprehensive unit test coverage in `packages/AI/Agents/src/__tests__/agent-wake-trigger.test.ts` and compatibility verification against `IT157` and `IT183` Chief of Staff integration bundles.

### Non-Goals
- Modifying database schema or entity metadata for `MJ: AI Bridge Agent Identities` or `MJ: AI Agent User Policies`.
- Changing `TriggerWakeForWorkstream` policy semantics.

## Critical User Journeys (CUJs)
### CUJ-1: Authorized Executive User on Dedicated or Shared Mailbox
1. An onboarded user with an `Active` policy (`EmailChannelMode !== 'Disabled'`) emails their dedicated agent mailbox (`identity.UserID === senderUser.ID`) or an org-wide shared utility mailbox (`identity.UserID === null`).
2. `RouteInboundUtilityMailboxWake` verifies internal sender identity, `identity.UserID` ownership (if set), `Configuration` constraints, and the `Active` onboarding policy.
3. **Expected Outcome:** Returns `WAKE_SCHEDULED` and persists the `AgentWake` routine in the sender's `contextUser` scope.

### CUJ-2: Unauthorized Sender on Dedicated Mailbox or Un-onboarded User on Shared Mailbox
1. An internal user emails another user's dedicated mailbox (`identity.UserID !== senderUser.ID`), or emails a shared mailbox with no policy row or a `Pending`/`Paused`/`Disabled` policy.
2. **Expected Outcome:** Wake is blocked immediately with `SENDER_NOT_AUTHORIZED_FOR_IDENTITY` or `POLICY_DENIED`, saving zero routines.
