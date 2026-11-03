---
"@memberjunction/ng-conversations": minor
---

`mj-conversation-chat-area` gets an `AllowForking` input, like `AllowRealtime` and `AllowAttachments`. It defaults to true, so nothing changes unless a host sets it. With `[AllowForking]="false"` the chat offers no fork actions (Fork from here, Edit or Regenerate as a fork), and Edit and Regenerate change the latest turn in place, as they do for a person without the `Conversations: Fork` authorization. It only affects the UI: deny that authorization to a role to stop the server creating forks too.
