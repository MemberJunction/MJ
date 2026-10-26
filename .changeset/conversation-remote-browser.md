---
"@memberjunction/computer-use": patch
"@memberjunction/remote-browser-base": patch
"@memberjunction/remote-browser-cdp": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/server": patch
---

A text conversation can open a Remote Browser its agents drive. `<mj-conversation-chat-area>` takes `AllowRemoteBrowser` (default false); when set, a Browser button opens a drawer with a live view and URL bar, and the conversation's agents get the `browser_*` tools, including the new `browser_Inspect` (fields `f1…`, buttons and links `a1…`) and `browser_Fill`. The browser belongs to the conversation: it ends when the drawer closes, the conversation changes or the chat area is destroyed (new `EndRemoteBrowserSession` mutation), and only the owning user can drive or end it. Clicks on submit, pay, delete or sign-in controls are refused on every path, so a person clicks them; navigation opens only http(s) pages. Adapters gain `EvaluateInPage` (default `null`).
