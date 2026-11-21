# Architecture & Verification Plan: Epic 0b — Fix 14: Inbound Mailbox Wakes Per-User Identity & Policy Gate (MJ)

- **Branch:** `factory/3c868bdf-2afd-4d4d-8faa-3d3ca56492e0-inbound-mailbox-gate`
- **Target Branch:** `next`
- **Pull Request:** `#6828`
- **Risk:** `Low`

## Summary
Hardens `AgentWakeTriggerService.RouteInboundUtilityMailboxWake` in `packages/AI/Agents/src/AgentWakeTriggerService.ts` so per-user `MJ: AI Bridge Agent Identities` ownership (`identity.UserID`) and mandatory `Active` onboarding policies (`MJ: AI Agent User Policies`) are enforced consistently with `TriggerWakeForWorkstream`.

## Implementation Approach
1. Enforce `identity.UserID` ownership check in `AgentWakeTriggerService.RouteInboundUtilityMailboxWake` using `UUIDsEqual(identity.UserID, senderUser.ID)`, returning `SENDER_NOT_AUTHORIZED_FOR_IDENTITY` when populated and mismatched.
2. Replace the permissive `if (policy)` gate in `RouteInboundUtilityMailboxWake` with `if (!policy || policy.Status !== 'Active')` returning `POLICY_DENIED`, while preserving the `EmailChannelMode === 'Disabled'` check.
3. Update JSDoc on `RouteInboundUtilityMailboxWake` and the inbound mailbox policy documentation in `packages/AI/Agents/README.md`.
4. Expand unit test coverage in `packages/AI/Agents/src/__tests__/agent-wake-trigger.test.ts` for dedicated/shared identities and missing/non-Active policy statuses, and verify compatibility with `IT157` and `IT183` Chief of Staff integration bundles and `.github/workflows/`.

## EARS Acceptance Specifications
| Criterion | EARS Requirement | Verified By |
| --- | --- | --- |
| `AC-1` | WHEN `identity.UserID` is populated on an inbound Email bridge identity, `RouteInboundUtilityMailboxWake` SHALL compare it with `UUIDsEqual(identity.UserID, senderUser.ID)` and return `SENDER_NOT_AUTHORIZED_FOR_IDENTITY` if false. | `ART-1`, `ART-3` |
| `AC-2` | `RouteInboundUtilityMailboxWake` SHALL require an existing policy row with `policy.Status === 'Active'`, returning `POLICY_DENIED` when `policy` is `null`/`undefined` or `Status` is `Pending`, `Paused`, or `Disabled`, while still enforcing `EmailChannelMode === 'Disabled'`. | `ART-1`, `ART-3` |
| `AC-3` | JSDoc in `AgentWakeTriggerService.ts` and policy documentation in `packages/AI/Agents/README.md` SHALL accurately reflect `identity.UserID` enforcement and the mandatory `Active` policy requirement. | `ART-2` |
| `AC-4` | All unit tests in `packages/AI/Agents/src/__tests__/agent-wake-trigger.test.ts` SHALL pass and remain compatible with `IT157` and `IT183` Chief of Staff integration expectations and active CI workflows under `.github/workflows/`. | `ART-1`, `ART-3` |

## Alternatives Considered & Rejected
- **Require admins to always duplicate `identity.UserID` inside `Configuration.allowedUserID` JSON:** Rejected — error-prone duplication that leaves a security gap whenever `UserID` is set on the entity column without JSON duplication.
- **Allow missing policy rows to default to `Active` for shared utility mailboxes:** Rejected — violates the active-policy onboarding requirement enforced by `TriggerWakeForWorkstream` and allows un-onboarded users to wake Chief of Staff agents.
