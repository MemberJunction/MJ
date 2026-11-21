# Tasks, Execution Slices & Verification Evidence

- **Canonical Spec Directory:** `.mj/specs/epic-0b-fix-14-inbound-mailbox-wakes-per-user-identity-policy-ga/`
- **Branch:** `factory/3c868bdf-2afd-4d4d-8faa-3d3ca56492e0-inbound-mailbox-gate`
- **Pull Request:** `#6828`

## Execution Slices
| Slice | Task ID | Scope | Status |
| --- | --- | --- | --- |
| Slice 1 | `3C868BDF-2AFD-4D4D-8FAA-3D3CA56492E0` | Enforce `identity.UserID` and mandatory `Active` policy gate in `RouteInboundUtilityMailboxWake`; update JSDoc & `packages/AI/Agents/README.md` (`8cdd0ff748`) | Completed |
| Slice 2 | `1056E5C2-3905-40DB-B7EF-4F8E9787F22F` | Expand `agent-wake-trigger.test.ts` coverage for dedicated/shared identities & missing/Pending/Paused/Disabled/EmailChannelMode=Disabled policies, sync `.mj/specs/`, verify IT157/IT183 compatibility & full build/tests | Active |

## Required Verification Artifacts
| Artifact ID | Kind | Purpose | Target |
| --- | --- | --- | --- |
| `ART-1` | `BuildLog` | TypeScript build log for `@memberjunction/ai-agents` | `packages/AI/Agents` |
| `ART-2` | `DocUpdate` | JSDoc, `packages/AI/Agents/README.md`, and `.mj/specs/epic-0b-fix-14-inbound-mailbox-wakes-per-user-identity-policy-ga/` sync verification | `packages/AI/Agents/README.md`, `.mj/specs/epic-0b-fix-14-inbound-mailbox-wakes-per-user-identity-policy-ga/` |
| `ART-3` | `TestRun` | Vitest unit test run for `packages/AI/Agents` & compatibility checks | `packages/AI/Agents/src/__tests__/agent-wake-trigger.test.ts` |
