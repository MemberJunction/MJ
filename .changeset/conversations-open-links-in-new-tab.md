---
"@memberjunction/ng-markdown": patch
"@memberjunction/ng-conversations": patch
---

Open inline markdown links in a new browser tab by default in `@memberjunction/ng-conversations` (`target="_blank"` with `rel="noopener noreferrer"`), and add an `OpenLinksInNewTab` `@Input()` on `MarkdownComponent`, `ConversationChatAreaComponent`, `MessageListComponent`, `MessageItemComponent`, `RealtimeSessionOverlayComponent`, and `RealtimeSessionThreadComponent` so hosts can override the behavior.
