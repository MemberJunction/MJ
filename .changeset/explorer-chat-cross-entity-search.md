---
'@memberjunction/ng-conversations': patch
'@memberjunction/ng-explorer-core': patch
---

Make the Chat cross-entity search panel reachable and usable in Explorer.

`SearchPanelComponent` (search across conversations, messages, artifacts, collections
and tasks) was only ever rendered by `ConversationWorkspaceComponent`, which has no
consumers anywhere in the repo — Explorer composes the chat UI from resource wrappers
instead. The panel therefore never mounted, leaving the feature with no route to it from
any shipped surface. `ChatConversationsResourceComponent` now renders it.

The entry point is an escalation row beneath the conversation list, shown only while the
list's own filter is active: "Search all of Chat for …". It carries the term the user has
already typed into the panel, so the two scopes read as one continuum rather than two
identical-looking search boxes offering different reach. `mj-conversation-list` emits the
new `searchEscalated` output rather than routing itself, per the widget layer's event
contract, and `SearchPanelComponent` accepts the term via a new `initialQuery` input.
Ctrl+K is deliberately not the shortcut: Explorer's global command palette already owns it.

Several defects made the surface look wired up while returning nothing:

- **Message search could never match.** The filter named `vwConversations` unqualified,
  but the SQL login's default schema is `dbo`, so it resolved to nothing and the query
  errored. Every sub-search reports failure as `return []`, so a hard SQL error and
  "no matches" rendered identically. The view now resolves from entity metadata.
- **Artifact results did not open.** Routing branched on `collectionId` then
  `conversationId`, but the artifact mapper only ever sets `collectionId` — so an
  artifact in no collection matched neither branch and the click did nothing. Artifacts
  need no parent; `NavigationService.OpenArtifact` opens one directly.
- **Results did not render until an unrelated DOM event.** The emission does not reliably
  schedule a change-detection pass, so results landed on the component while the panel
  kept painting the previous state until a click or keypress triggered the next one.
- **Quadratic work per keystroke.** `isResultSelected()` is bound once per row and rebuilt
  a flat array of every result on each call; the flat list is now cached per emission.
- **Focus theft.** `ngOnChanges` fired for every input, so a `currentUser` or
  `environmentId` re-emit while the panel was open pulled focus out of whatever field the
  user was in. Replaced with a setter keyed on the open transition.
- **The search icon escaped its input.** Explorer's app-wide `_shared-patterns.scss`
  absolutely-positions any bare `.search-icon` and pairs that with a `padding-left` scoped
  to three wrapper classes this panel does not use, so the icon positioned against the
  overlay while the input slid into its vacated flex slot.

Also exports `SearchResult` / `SearchResultType` from `@memberjunction/ng-conversations`
— they are the payload of `SearchPanelComponent.resultSelected`, so consumers previously
could not type a handler for it.
