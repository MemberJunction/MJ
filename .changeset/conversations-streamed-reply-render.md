---
"@memberjunction/ng-conversations": patch
---

fix(conversations): render a streamed reply in place. A streamed delta no longer replaces the messages array (which rebuilt the whole timeline and armed a scroll-to-bottom timer on every delta); the bubble is refreshed through a new `MessageStreamed` output and `MessageListComponent.RefreshRenderedMessage`, coalesced to one render per animation frame. With `ReadReplyFromTop` the turn lands at its top once, on the first delta, and completion no longer lands it again. The in-progress bubble's 150px status-line cap is lifted while streamed text is shown, and a half-open code fence is closed for display while the text is still arriving.
