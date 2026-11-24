---
"@memberjunction/messaging-adapters": patch
---

Enforce agent permissions, discoverability, host allow-lists, and fail-closed sender identity mapping in `@memberjunction/messaging-adapters`:

- Enforce `AIAgentPermissionHelper.IsDirectlyDiscoverable`, per-user `CanView`/`CanRun` RBAC (`MJ: AI Agent Permissions`, including derived-agent ancestor `CanRun`), and optional `AllowedAgentIDs` across `@mention`, thread affinity, `DefaultAgentName`, slash command registration, form submissions, `FollowHandoffs` (`ALL_AVAILABLE_AGENTS`), and fallback delegation (`ResolveHandoffTarget`).
- Hide agents the calling user cannot view from `NotFound` help notes and silently ignore incidental prose matches to avoid side-channel leaks.
- Fail closed by default when a platform sender's email cannot be matched to an active MJ user instead of inheriting `ContextUserEmail`; add opt-in `AllowFallbackUser: true` for open dev/demo bots.
- Resolve Teams sender emails via `TeamsInfo.getMember` (with short TTL cache) when `activity.from.email` is omitted on `msteams` channels.
- Add deterministic integration test bundle `IT188` (`messaging-adapters`, `MA1`–`MA6`) covering real `UserCache.Instance`, `AIEngineBase.Instance`, and `AIAgentPermissionHelper`.
