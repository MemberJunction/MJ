---
"@memberjunction/ng-shared": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/messaging-adapters": patch
---

Add inline peer-to-peer agent handoff card (`mj-agent-handoff-card`), semantic agent accent tokens (`--mj-agent-accent-*`), conversation ownership chrome (`with <Agent>` header chip and `Replying to <Agent> · Return to Sage` composer bar), and messaging-adapter `FollowHandoffs` integration with isolated user-visible history. Explicit `@Sage` mentions and **Return to Sage** now end specialist continuity across all conversations (not only after a handoff), and `continueWithAgent` resolves the active specialist's configuration preset via `ResolveConversationAgentPreset` (using the header mode-picker preset only when its `AgentID` matches the continued agent) instead of forwarding the conversation manager's preset.
