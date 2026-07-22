---
"@memberjunction/ng-conversations": minor
---

Add host-level pass-through toggles to `mj-conversation-chat-area` so embedding products can disable composer and chrome features through the component contract instead of CSS on internal class names: `allowPlanMode` / `allowRealtime` (thread into new `enablePlanMode` / `enableRealtime` inputs on both `mj-message-input` instances, then into the `ai-composer` inputs that were previously bound to literal `true`), `showEmptyFill` (the message list's "No messages yet" filler), and `showLoadingState` (the centered loading spinner, gated so the loading branch still short-circuits and never flashes the empty state). All default to `true`, so existing consumers are unaffected.
