---
'@memberjunction/ng-explorer-core': patch
'@memberjunction/ng-conversations': patch
---

Make the Chat cross-entity search panel reachable in Explorer.

`SearchPanelComponent` (search across conversations, messages, artifacts, collections
and tasks) was only ever rendered by `ConversationWorkspaceComponent`, which has no
consumers anywhere in the repo — Explorer composes the chat UI from resource wrappers
instead. The panel and its nav trigger therefore never mounted, leaving the feature
with no route to it from any shipped surface.

`ChatConversationsResourceComponent` now renders the panel and adds a
"Search everything in Chat" trigger above the conversation list. Ctrl+K is deliberately
not used as the shortcut: Explorer's global command palette already owns it, and that
palette is a different feature.

Search results are routed through `NavigationService` rather than by flipping an
`activeTab` as the workspace did, since Explorer renders each chat surface as its own
resource. Conversations and messages resolve to a conversation this component already
owns, so they are selected in place; artifacts reuse the existing artifact-link routing;
collections and tasks open their nav items.

Also exports `SearchResult` / `SearchResultType` from `@memberjunction/ng-conversations`
— they are the payload of `SearchPanelComponent.resultSelected`, so consumers previously
could not type a handler for it.
