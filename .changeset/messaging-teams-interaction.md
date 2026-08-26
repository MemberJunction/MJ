---
"@memberjunction/messaging-adapters": patch
---

Teams: reach the agent you named, and keep a form exchange with the agent that asked

- `MentionedAgentNames` is now populated on Teams turns. `resolveAgent` routes on it and only the Slack adapter was setting it, so Teams could only ever reach the DEFAULT agent — "@Sage hi" silently ran the default and logged nothing. And because `resolveThreadAgent` falls back to text-matching thread history, the same message could route differently depending on its position in the thread.
- A response form stamps its owning agent into the submit payload (`mj_agent`) and `HandleFormSubmit` routes the answer back to it. Teams has no thread history to recover the asker from (`fetchThreadHistory` is a Graph-API TODO returning `[]`), so a form answer resolved to the default agent — one agent asked, another answered. Deliberately NOT name-matched out of the answer text: a form answer is arbitrary user input.
- `Action.OpenUrl` buttons over URIs Teams cannot open (`data:`/`blob:`/`file:` are silently inert in Adaptive Cards) are dropped and replaced by a body note pointing at the artifact link. MJ inlines file artifacts as `data:` URIs whenever no file storage account is configured, so "Download document" was dead by construction. Unlike Slack's URL screen, localhost stays allowed — Teams opens it, and dev "View in MJ Explorer" links depend on it.
