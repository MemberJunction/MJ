---
"@memberjunction/ng-conversations": patch
---

`AllowStopRun` on `mj-conversation-chat-area` now turns off everything about stopping, not just the Stop controls. It defaults to true, so nothing changes unless a host sets it. With `[AllowStopRun]="false"` the chat offers no Stop or Stop all in the composer, no Stop pill on an in-progress reply, no Continue button on a stopped reply, and no "Continue, or tell {agent} what to do differently" placeholder. It only affects the UI: a run stopped from another client still shows as stopped, and the next message still continues it. The input now sits with the other host-level caps (`AllowAttachments`, `AllowPlanMode`, `AllowRealtime`) and is listed in the README's feature toggles.
