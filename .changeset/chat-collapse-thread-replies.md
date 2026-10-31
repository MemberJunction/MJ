---
"@memberjunction/ng-conversations": patch
---

Add an opt-in `CollapseThreadReplies` input to `mj-conversation-chat-area`. When on, thread replies leave the main message list so a host can show them collapsed under their root message (for example through the `messageExtra` slot). A person's reply to a loaded message is a thread reply, and so is any message under a thread reply; an agent's direct answer to a top-level message stays in the main flow. Off by default, so existing hosts are unchanged.
