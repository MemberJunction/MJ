---
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-code-editor": patch
---

Two fixes for defects found while tracing console noise in the conversation UI.

**The agent-completion toast never fired.** `markMessageComplete` looked up the active task by the AI reply's conversation detail ID, but every `activeTasks.add()` call in `message-input` registers the task against the message that STARTED the turn — the user message, the Sage delegation message, or the status message. Those IDs are never equal, so the lookup missed on every completion and the "&lt;agent&gt; completed in &lt;conversation&gt;" notification never reached a user who had navigated away. The task still disappeared, because `conversation-chat-area` separately sweeps tasks whose message has left `In-Progress`, so this surfaced only as a missing notification plus `⚠️ No task found for completed message …` on every single turn. Every path already links the reply to its starter through `ParentID`, so the lookup now falls back to it.

**Template editors lost syntax highlighting entirely.** `_findLanguage` matched only `name` and `alias`. Several names in common use are registered by CodeMirror as extensions instead — `jinja2` is one of Jinja's (`["j2", "jinja", "jinja2"]`) while its only matchable name is `"Jinja"`. The template editors in core-entity-forms ask for `jinja2`, so every prompt and template opened with `Language not found: jinja2` and no highlighting. Resolution now falls back to extensions, but only when nothing matched by name or alias — so it can turn a miss into a hit and can never change a match that already resolved, which matters because short extensions (`r`, `md`, `ts`) could otherwise outrank another language's real name.
