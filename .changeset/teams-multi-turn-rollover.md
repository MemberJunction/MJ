---
"@memberjunction/messaging-adapters": patch
---

Add DB-backed multi-turn history for Teams, `/new` conversation reset, and sliding idle rollover:

- Load prior completed User/AI turns from `MJ: Conversation Details` (as the calling `contextUser`) on adapters without platform thread history (`TeamsAdapter.UsesMJConversationHistory() = true`), enabling multi-turn Teams DMs, channels, group chats, and meetings without Microsoft Graph `ChannelMessage.Read.All` permissions.
- Preserve conversation agent affinity across DB-backed turns while enforcing per-user `CanView`/`CanRun` permissions on the remembered agent.
- Support `/new` (bare reset with confirmation) and `/new <prompt>` (reset + start fresh conversation immediately).
- Add `ConversationIdleTimeoutMs` sliding idle rollover (defaults to 2 hours for rolling conversations like DMs, Teams group chats, and meetings; 24 hours for explicit channel threads).
