---
"@memberjunction/messaging-adapters": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-explorer-core": patch
---

Slack and Teams adapters: first production bring-up

Defects found running the adapters against a real MJ app — one Slack app per agent
(Socket Mode) plus Teams via Bot Framework.

**Startup and identity**

- Users are resolved via `UserCache.Instance`. `new UserCache()` returned the shared
  singleton and then re-initialized it empty, so no messaging extension could start
  and the whole server lost its user cache until the next refresh.
- Running one platform app per agent no longer causes bots to cross-talk in shared
  channels: thread replies are answered only by the addressed bot, bot-authored
  messages are excluded from history and thread affinity, and a new
  `DisableDelegation` setting stops a pinned bot from handing off.

**Delivery**

- Generated files and images are delivered as real attachments. Adapters may
  implement `uploadMediaOutputs` (Slack does, and needs the `files:write` scope);
  inlined `data:` URIs are decoded; and the run's canonical `fileOutputs` are used
  rather than depending on the model to inline them.
- A non-public button URL no longer fails the entire Slack message — it degrades to
  a link, so a localhost `ExplorerBaseURL` stops suppressing replies outright.
- The artifact link points at the file the agent produced rather than its internal
  payload, and `System Only` artifacts are no longer linked. Callers relying on
  `artifactInfo` being the payload artifact now receive the file artifact when a run
  produced one.
- `ng-artifacts`: downloading a file artifact returns real bytes under its own MIME
  type and filename, instead of a `.txt` file full of base64.
- `ng-explorer-core`: a conversation deep link opened cold now honours the URL rather
  than restoring the previously-viewed conversation.

**Slack**

- Interactivity works in Socket Mode; previously every button and modal was inert, so
  human-in-the-loop form flows dead-ended.
- Message text is capped at the real `text` limit rather than the block-payload limit,
  which was failing long responses with `msg_too_long`.
- Modal placeholders are truncated to 150 characters; an over-long one failed the whole
  `views.open` and left a button that looked dead.

**Teams**

- `MentionedAgentNames` is populated, so a named agent is reachable at all — previously
  every Teams turn ran the default agent.
- Response forms route the answer back to the agent that asked, via `mj_agent`.
- Adaptive Card buttons over `data:`/`blob:`/`file:` URIs, which Teams silently ignores,
  are replaced by a note pointing at the artifact link.
- Deep links no longer assume `resourceId` is present, now that a Record can be
  addressed by `keys`.
