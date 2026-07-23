---
"@memberjunction/ng-conversations": minor
---

Add a seventh chat-area slot: `rail` — a right-side companion surface rendered as the last
child of the chat content area (sibling of the message pane and artifact pane). Projection-only:
unlike the other six slots it has NO default component, so when no consumer projects an
`mjChatSlot="rail"` template the chat-area renders byte-for-byte as before — existing embedders
are unaffected. Template context is the new `IMJChatRailSlotContext` (`Conversation` — also the
`$implicit` — and `IsArtifactOpen`, true while the artifact viewer pane is open, so a rail can
compact/overlay/defer when the pane owns the right side). This is the mount seam for the
composed-shell Companion Rail; the context is deliberately minimal and will grow additively.
