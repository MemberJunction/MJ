---
"@memberjunction/messaging-adapters": patch
---

Enforce agent permissions, discoverability, host allow-lists, and fail-closed sender identity mapping in `@memberjunction/messaging-adapters`:

- Enforce `AIAgentPermissionHelper.IsDirectlyDiscoverable`, per-user `CanView`/`CanRun` RBAC (`MJ: AI Agent Permissions`, including derived-agent ancestor `CanRun`), and optional `AllowedAgentIDs` across `@mention`, thread affinity, `DefaultAgentName`, slash command registration, form submissions, `FollowHandoffs` (`ALL_AVAILABLE_AGENTS`), and fallback delegation (`ResolveHandoffTarget`).
- Hide agents the calling user cannot view from mention matching, ambiguity checks, multi-mention notes, and `NotFound` help notes so unviewable agent names never leak.
- Fail closed by default when a platform sender's email cannot be matched to an active MJ user instead of inheriting `ContextUserEmail`; add opt-in `AllowFallbackUser: true` for open dev/demo bots.
- Resolve Teams sender emails via `TeamsInfo.getMember` (with tenant-scoped 5-minute cache) only after verifying the activity and member Entra tenant against `MicrosoftAppTenantId` / `AllowedTenantIDs` (failing closed when no tenant is configured).
- Add deterministic integration test bundle `IT194` (`messaging-adapters`, `MA1`–`MA6`) covering real `UserCache.Instance`, `AIEngineBase.Instance`, and `AIAgentPermissionHelper`.
