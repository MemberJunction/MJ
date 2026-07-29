---
"@memberjunction/ng-conversations": minor
---

Assistant identity inputs for the message feed. `assistantDisplayName` and `assistantAvatarUrl` on `mj-conversation-chat-area` (both default `null` = today's engine-resolved agent identity) let a white-label host brand the AI side of the conversation through the component contract instead of `::ng-deep` on `.message-sender` / `.avatar-circle` internals. The override is display-only by design: `isConversationManager` and the run-details header/record link keep comparing the engine-resolved agent name, so relabeling the persona can never change routing or behavior decisions. A whitespace-only or failing avatar URL degrades back to the agent's Font Awesome icon, and identity changes restamp already-rendered messages so a branding config that resolves after first render still applies.
