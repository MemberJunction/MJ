---
"@memberjunction/messaging-adapters": patch
---

Support one platform app per agent: stop bots cross-talking in shared channels

Running a separate Slack app per agent (so `@Betty` and `@Sage` are distinct identities) broke three single-bot assumptions:

- **Every bot answered every thread reply.** A thread reply needs no mention, and Slack delivers channel messages to every installed app, so one reply produced one answer per agent. A bot now answers an un-mentioned thread reply only when it was addressed or has already posted in that thread. Platforms that route messages solely to the addressed bot override `respondsToUnaddressedThreadReplies()` — `TeamsAdapter` does, since the gate is unnecessary and would suppress valid replies there.
- **Other bots' messages hijacked thread affinity and context.** History skipped only *this* bot's messages, so another agent's reply ("I'm Sage, here to help") read as a user asking for Sage — one bot ran another's agent — and entered the model's context as a `user` turn, which it then imitated. Any bot-authored message (`isBotAuthored`, overridable) is now excluded from both.
- **New `DisableDelegation` setting.** Delegation detection scans the reply text for delegation phrases plus any known agent name, so an orchestrator agent describing its own routing role ("I can route you to … Betty") triggered a real handoff — a different agent's answer posted under this bot's identity with no attribution. Set it on a bot pinned to one agent.

Tests: 322/322 (8 added). Each behavior is mutation-checked: reverting the gate, the delegation switch, or the bot-authored skip fails the suite.
