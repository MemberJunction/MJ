---
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-notifications": patch
---

Chat area scrolling: an in-place message update (progress, status, streamed text) no longer scrolls a reader who has scrolled up back to the bottom — the tail is followed only for a reader already at it. New opt-in `readReplyFromTop` on `mj-conversation-chat-area` scrolls a finished turn to the top of the pane when it is taller than the pane, so the run ends at the start of the answer.

Agent completion is announced once, as a rich toast: `MJNotificationService.CreateRichNotification` (image or icon, title, detail, on the surface tokens with the brand colour as accent; dismissible with hover-pause; a same-key toast already on screen is kept, one still held back by `deferMs` is superseded). The server's Agent Completion notification (deferred) and message-input's client-side completion share a key per conversation, so the reader sees one toast in one wording — the client's, with the conversation's current name. New `CompletionImageUrlResolver` host hook lets a white-label host put its assistant's avatar on the toast.
