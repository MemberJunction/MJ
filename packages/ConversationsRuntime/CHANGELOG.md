# @memberjunction/conversations-runtime

## 6.2.0-edge.1

### Patch Changes

- eb3a8d3: feat(conversations): host rules for chats with several people

  `mj-conversation-chat-area` gains opt-in inputs, one reworked event, a hook and a slot, so a host can run a chat between several people without forking the chat area. Every default keeps today's behavior.

  **Inputs — `ng-conversations`.** Set on `mj-conversation-chat-area` (and on `mj-message-input` directly):
  - `AgentReplyMode` — `'Always'` (default) answers every message; `'MentionOnly'` answers only a message that tags an agent and posts any other message with no turn at all: no reply row, no placeholder, no turn events.
  - `AllowedAgentIDs` — the agents that may answer. Narrows the composer's `@` list, every route (tagged agent, continuity, pinned and host default agents, the conversation manager), the manager's delegation — including each agent step of a workflow it plans — and the pin and voice pickers. Null allows every agent; an empty list allows none.
  - `MentionPeople` — the people the `@` list offers (today it offers only the current user). Each composer keeps its own list: two composers on one page never see each other's.
  - `AgentHistoryFrom` — the first moment of the conversation an agent turn may read (see below).
  - `AgentTurnHandler` — an async hook that runs the turn on the host's server instead of MJ's path, once per turn, before any reply row exists. The chat area shows the rows it reports.
  - `AutoNameConversation` — turns MJ's auto-naming of a new conversation off (text and voice).

  **Behavior change: `BeforeAgentTurn`.** It now fires once per turn on every route, before any row exists, and carries the resolved `AgentId`, `AgentName`, `Route` and `UserMessageId`. A listener can cancel the turn or send it to another allowed agent with `RedirectAgentId`. Canceling now leaves nothing behind. Previously the event fired only on the conversation manager's route, after that route's placeholder row was saved, and a cancel left the row behind, marked "Turn canceled before agent invocation". `AfterAgentTurn` now fires on every route too.

  **Slot.** `composerExtra` renders host UI directly above the composer, wherever the chat area shows one, with an `IMJChatComposerExtraContext`.

  **History floor — `server`, `core-entities`, `ai-core-plus`, `ai-agents`, clients.** `RunAIAgentFromConversationDetail` takes a new nullable `agentHistoryFrom` argument (ISO-8601). The server loads the agent's history from that moment and uses no summary of earlier messages; an unreadable value fails the request. The run carries it as `ExecuteAgentParams.ConversationHistoryFrom`, so the conversation-history tools, the conversation's artifacts, cross-turn compaction (skipped) and the carried-forward tool results of the previous turn (not carried) hold it too. `ConversationEngine.LoadWindowRowsFresh` and `AssembleContextWindow` accept the floor, and `ConversationEngine.HistoryFromFilter` writes it. The GraphQL client names the argument only when a floor is set, so a client that sets none keeps working against an older MJAPI.

  **Runtime — `conversations-runtime`.** `MentionAutocomplete.GetSuggestions` takes an optional per-call `MentionSuggestionScope`; `ConversationAgentRunner.processMessage` takes `AllowedAgentIDs` (narrows the manager's `ALL_AVAILABLE_AGENTS`) and `AgentHistoryFrom`.

- 80905a1: Rename public class members and exported functions to PascalCase, per MJ's naming convention,
  **without breaking a single consumer**.

  Every renamed symbol keeps its old name beside the new one as a `@deprecated` stub that forwards to
  it — a delegating method or function, a getter/setter pair for a property, and for Angular a
  readable accessor pair for an `@Input` and a second `@Output` sharing the same `EventEmitter`, so a
  template still binding the old name keeps receiving events. Old names still compile, still resolve,
  and still behave identically; the deprecation tag rides through to the published `.d.ts`, so editors
  point callers at the replacement. Where a package re-exports through an explicit `export { … }`
  list, the new name is added alongside the old, so the correct name is actually on the public surface
  rather than merely declared.

  The rename is deliberately refused wherever a mechanical stub would not be equivalent, because
  several of those shapes change a type contract while still compiling in the package that declares
  them:
  - an **optional** property or parameter property — TypeScript has no optional accessor, so a stub
    would promote `foo?` to a required member and break every object literal that omits it;
  - a class that is a **data shape** (no methods, or `@ObjectType`/`@InputType`) — object literals are
    assigned to it, and an accessor stub changes what they must supply;
  - a property whose **subclass redeclares it**, since TypeScript forbids a property overriding an
    accessor (TS2610);
  - a name whose PascalCase form is **already bound** in that file or class;
  - decorated members, `get`/`set` pairs behind a decorator, generators, destructured parameters,
    overload sets and abstract members.

  **One wire-visible consequence, for version skew only.** `BaseInfo.toJSON` walks `_`-prefixed
  backing fields and emits them through their public getter, preferring the PascalCase one. Renaming
  the 23 field aliases in `MJCore/src/generic` therefore changes what `AllMetadata` carries:
  `EntityInfo.spCreate` and friends now serialize as `SpCreate`. A same-version client is unaffected —
  `copyInitData` accepts a value through a settable accessor, so either spelling lands on the right
  field. An OLDER client against a newer server has no such path in its `copyInitData` and drops those
  fields silently. Same-version deployments, which is the supported configuration, see no change.

  Each package was verified against its own pre-change baseline rather than against zero, because
  several packages in this repo do not typecheck cleanly to begin with. Angular packages were verified
  with `ngc`, not `tsc`: a plain typecheck does not compile templates, and an earlier write-only
  `@Input` alias passed `tsc` while breaking six template reads.

- 9845c00: A realtime session in a conversation now reads as a voice call that belongs to the thread, not a banner laid across it.
  - `ng-conversations`: the session card is laid out like a chat message, with the call icon in the avatar column, a header with the title and start time, and a bubble with the status, how long the call ran, how many messages were exchanged, the last line said, and a **Review call** button (**View call** while live). It keeps the message list's margins at every breakpoint. The card takes the viewer's id (`CurrentUserID`, passed by the message list), so the quoted line says "You" on your own call, names the caller on someone else's, and says "Caller" when the session row doesn't say whose call it was.
  - `conversations-runtime`: the wording both surfaces share. The title is "Voice call with Sage" rather than "Realtime session · Sage", a server-shutdown close reads "Interrupted", and there are new helpers: `SessionCardStartedAt`, `SessionCardDurationLabel` ("Under a minute", "12 min", "1 hr 5 min"), `SessionCardMessageCountLabel` and `SessionCardSpeakerLabel`. The session lookup (`REALTIME_SESSION_META_FIELDS`) also reads `UserID`, `User` and `__mj_CreatedAt`, and the new `RealtimeSessionTimelineMeta` fields are optional, so existing callers still type-check.
  - `mobile-app`: the session card takes the same title and message count as the web, and names the agent on its lines. The chat screen passes the viewer's id (`CurrentUserID`), so the preview and the expanded transcript label the user's lines by the web's rule.

- Updated dependencies [a50948e]
- Updated dependencies [0eeb89d]
- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [67f6c85]
- Updated dependencies [eb3a8d3]
- Updated dependencies [e1dd673]
- Updated dependencies [307da67]
- Updated dependencies [a7da50b]
- Updated dependencies [1d43161]
- Updated dependencies [7110019]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [6b08ebf]
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/ai-core-plus@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/graphql-dataprovider@6.2.0-edge.1
  - @memberjunction/ai-agent-client@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/ai-engine-base@6.2.0-edge.1

## 6.2.0-edge.0

### Minor Changes

- c157749: Extract the mention-autocomplete engine out of Angular into `@memberjunction/conversations-runtime`, so a non-Angular host can offer the same `@` / `#` / `/` pickers.

  **Why.** `MentionAutocompleteService` was 503 lines of permission-filtered caching and ranking — the agent / user / entity / query / skill sets behind every composer trigger, the `/` picker's target-agent narrowing, and the per-trigger match scoring. It imported nothing from `@angular/*` and carried no decorator; it was Angular-coupled purely by which package it sat in. `MentionParser`, the other half of the same feature, already lived in the runtime.

  That location was the problem. The React Native app needs the same three pickers, and a native host cannot depend on an Angular library — so reaching them would have meant writing the agent/skill run-permission filtering, the accepted-skills intersection and the ranking a second time. A second copy of a _permission_ rule is the copy that drifts, and it drifts silently in the direction of showing someone a skill they may not run.

  **What moved:** `MentionAutocomplete` (the engine), `IntersectAcceptedSkills` (the `/` narrowing rule), and the `MentionSuggestion` / `MentionSuggestionPreset` data shapes. Reachable as `ConversationsRuntime.Instance.MentionSuggestions` or directly as `MentionAutocomplete.Instance`.

  **On the suggestion types.** `@memberjunction/ng-composer` keeps its own structurally identical `MentionSuggestion` — that one is a _rendering_ contract (what a dropdown row and a chip display), this one is a _data_ contract (what a suggestion engine produces). They are kept assignable so the Angular shim passes runtime suggestions straight through with no mapping. Deliberately NOT consolidated: `ng-composer`'s type is consumed by Explorer's omnibar across a dozen files, and MJ forbids cross-package re-exports, so unifying them would have meant a wide, unrelated churn in a branch that had no business causing it.

  **No behaviour change.** `MentionAutocompleteService` remains importable from `@memberjunction/ng-conversations` with the same name and the same `.Instance` accessor — it is now an alias for the runtime engine, so there is still exactly one instance and one cache warm-up shared with the ClassFactory-instantiated trigger providers. Verified by the package's own suites: 1,319 tests green in `ng-conversations`, 122 in the runtime (the five skill-narrowing tests moved with the code they cover).

  `skill-picker-narrowing.ts` is gone from `ng-conversations`; import `IntersectAcceptedSkills` from `@memberjunction/conversations-runtime` instead. No in-repo consumer outside its own test.

### Patch Changes

- d61b425: Voice and text now share a conversation properly, in both directions and on both surfaces.

  **Context flows into a voice session.** `ConversationMessages` was a hardcoded `[]` with an MVP
  note, so a call started mid-thread opened knowing nothing about what had been typed — the symptom
  being the agent asking the user to repeat something they had just written. The consumer had been
  written all along; only the plumbing was missing. The conversation's turns are now hydrated at
  session mint under the same caps the session-resume path uses (newest 30 turns, 8,000 characters,
  oldest dropped first). Because voice turns are themselves conversation rows, a resumed session
  would otherwise receive its previous leg twice, so the prior-transcript loader returns its leg ids
  and those legs are excluded; earlier calls that are not being resumed stay in.

  **Voice sessions collapse in the mobile thread.** The realtime-session timeline grouping and the
  card's presentation logic move from `ng-conversations` to `@memberjunction/conversations-runtime`
  (`BuildConversationTimeline`, `SessionCardTitle`, `SessionCardStatusChip`,
  `SessionCardIsSameDayRange`, `CollectRealtimeSessionIDs`, `MapRealtimeSessionMeta`,
  `FindRealtimeSessionMeta`, `IsVisibleRealtimeTurn`). The module was always pure TypeScript — and
  its own header already said rendering session-stamped rows as chat bubbles was wrong — but living
  behind an Angular import meant the React Native thread did exactly that. Both surfaces now run the
  same pass. `ng-conversations` re-exports from `lib/utils/realtime-session-timeline`, so its call
  sites are unchanged, and the Angular card delegates to the promoted functions instead of keeping
  its own copies.

  Mobile renders the collapsed card natively, expandable in place to the turns it counted, with a new
  `realtimeSessionCard` slot so a host can replace it.

- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [37891d3]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [a8be410]
- Updated dependencies [5df9486]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8d1a373]
- Updated dependencies [8a5d2c0]
- Updated dependencies [af57e8d]
- Updated dependencies [2c590b0]
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/ai-core-plus@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/graphql-dataprovider@6.2.0-edge.0
  - @memberjunction/ai-engine-base@6.2.0-edge.0
  - @memberjunction/ai-agent-client@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Patch Changes

- d7feeae: Stop Explorer from showing "Unknown error" with a stuck Running timer when a Skip/sub-agent transport path fails. Pass the real error through invokeSubAgent, keep In-Progress when the agent may still be running, and persist Failed/Error on the run and conversation detail if executeAIAgent throws.
- Updated dependencies [634aa8c]
- Updated dependencies [834f8d7]
- Updated dependencies [a987913]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [b7819d2]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [4586215]
- Updated dependencies [22ec804]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [1a2ce13]
- Updated dependencies [0d3094c]
- Updated dependencies [255d506]
- Updated dependencies [0ec1980]
- Updated dependencies [199eb2b]
- Updated dependencies [1940a4d]
- Updated dependencies [e7f1f88]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [711c208]
- Updated dependencies [e2ad3c0]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [59def38]
- Updated dependencies [2412415]
- Updated dependencies [06ccfb2]
- Updated dependencies [9699d0e]
- Updated dependencies [394d276]
- Updated dependencies [43f9133]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [2cc08e1]
- Updated dependencies [a5f92d2]
- Updated dependencies [2d14c62]
- Updated dependencies [394d276]
- Updated dependencies [c996a56]
- Updated dependencies [de6eb14]
- Updated dependencies [b9de989]
- Updated dependencies [38d4482]
- Updated dependencies [052b4c7]
- Updated dependencies [8ec1515]
- Updated dependencies [9a905e8]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [c996a56]
- Updated dependencies [d907a1b]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [8d880cc]
- Updated dependencies [1fa6f6b]
- Updated dependencies [cefc302]
- Updated dependencies [841e6ea]
- Updated dependencies [394d276]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [080f4cd]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [d66a26a]
- Updated dependencies [c643ba3]
- Updated dependencies [e9e9873]
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [8288711]
- Updated dependencies [be0bdb2]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [48ff99f]
- Updated dependencies [076fa5d]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [23c2521]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [2e2879e]
- Updated dependencies [b46330e]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [0db4f4f]
- Updated dependencies [53d256f]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [9a29da4]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [0967ba7]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [de343b5]
- Updated dependencies [5fc861f]
- Updated dependencies [1748491]
- Updated dependencies [4cdfdcf]
- Updated dependencies [0db6105]
- Updated dependencies [d7feeae]
- Updated dependencies [7fefca2]
- Updated dependencies [a1a8989]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [ca3657d]
- Updated dependencies [394d276]
- Updated dependencies [1bd9674]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [d078c54]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [ca4feb4]
- Updated dependencies [6cd337d]
- Updated dependencies [394d276]
- Updated dependencies [1c0d586]
  - @memberjunction/ai-core-plus@6.1.0
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/ai-engine-base@6.1.0
  - @memberjunction/graphql-dataprovider@6.1.0
  - @memberjunction/ai-agent-client@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [a987913]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [076fa5d]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [4cdfdcf]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core-entities@6.1.0-edge.7
  - @memberjunction/ai-engine-base@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/graphql-dataprovider@6.1.0-edge.7
  - @memberjunction/ai-core-plus@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/ai-agent-client@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- Updated dependencies [634aa8c]
- Updated dependencies [2c826f7]
- Updated dependencies [b7819d2]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0d3094c]
- Updated dependencies [0ec1980]
- Updated dependencies [43f9133]
- Updated dependencies [2cc08e1]
- Updated dependencies [2d14c62]
- Updated dependencies [b9de989]
- Updated dependencies [38d4482]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [e9e9873]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [1748491]
- Updated dependencies [0db6105]
- Updated dependencies [7fefca2]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
  - @memberjunction/ai-core-plus@6.1.0-edge.6
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/graphql-dataprovider@6.1.0-edge.6
  - @memberjunction/ai-engine-base@6.1.0-edge.6
  - @memberjunction/ai-agent-client@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- d7feeae: Stop Explorer from showing "Unknown error" with a stuck Running timer when a Skip/sub-agent transport path fails. Pass the real error through invokeSubAgent, keep In-Progress when the agent may still be running, and persist Failed/Error on the run and conversation detail if executeAIAgent throws.
- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [22ec804]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [d66a26a]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [d7feeae]
- Updated dependencies [905820a]
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/ai-core-plus@6.1.0-edge.5
  - @memberjunction/ai-engine-base@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/graphql-dataprovider@6.1.0-edge.5
  - @memberjunction/ai-agent-client@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [de6eb14]
- Updated dependencies [1fa6f6b]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [0db4f4f]
- Updated dependencies [a1a8989]
- Updated dependencies [d078c54]
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/ai-engine-base@6.1.0-edge.4
  - @memberjunction/ai-core-plus@6.1.0-edge.4
  - @memberjunction/graphql-dataprovider@6.1.0-edge.4
  - @memberjunction/ai-agent-client@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [199eb2b]
- Updated dependencies [e7f1f88]
- Updated dependencies [07cb22e]
- Updated dependencies [711c208]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [06ccfb2]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [8ec1515]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [d907a1b]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [2e2879e]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [6cd337d]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/ai-core-plus@6.1.0-edge.3
  - @memberjunction/graphql-dataprovider@6.1.0-edge.3
  - @memberjunction/ai-agent-client@6.1.0-edge.3
  - @memberjunction/ai-engine-base@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [255d506]
- Updated dependencies [59def38]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [fccd0b2]
- Updated dependencies [9a29da4]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai-core-plus@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/graphql-dataprovider@6.1.0-edge.2
  - @memberjunction/ai-engine-base@6.1.0-edge.2
  - @memberjunction/ai-agent-client@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ai-core-plus@6.1.0-edge.1
  - @memberjunction/graphql-dataprovider@6.1.0-edge.1
  - @memberjunction/ai-agent-client@6.1.0-edge.1
  - @memberjunction/ai-engine-base@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/ai-engine-base@6.1.0-edge.0
  - @memberjunction/ai-core-plus@6.1.0-edge.0
  - @memberjunction/graphql-dataprovider@6.1.0-edge.0
  - @memberjunction/ai-agent-client@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ai-agent-client@6.0.0
  - @memberjunction/ai-engine-base@6.0.0
  - @memberjunction/ai-core-plus@6.0.0
  - @memberjunction/graphql-dataprovider@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/ai-agent-client@5.51.0
  - @memberjunction/ai-engine-base@5.51.0
  - @memberjunction/ai-core-plus@5.51.0
  - @memberjunction/graphql-dataprovider@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ai-core-plus@5.50.0
  - @memberjunction/ai-engine-base@5.50.0
  - @memberjunction/graphql-dataprovider@5.50.0
  - @memberjunction/ai-agent-client@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [88d707b]
- Updated dependencies [1a15bd2]
- Updated dependencies [b52ffa8]
- Updated dependencies [85575cf]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/ai-core-plus@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/graphql-dataprovider@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/ai-agent-client@5.49.0
  - @memberjunction/ai-engine-base@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/ai-agent-client@5.48.0
  - @memberjunction/ai-engine-base@5.48.0
  - @memberjunction/ai-core-plus@5.48.0
  - @memberjunction/graphql-dataprovider@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/ai-agent-client@5.47.0
  - @memberjunction/ai-engine-base@5.47.0
  - @memberjunction/ai-core-plus@5.47.0
  - @memberjunction/graphql-dataprovider@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/ai-engine-base@5.46.0
  - @memberjunction/ai-agent-client@5.46.0
  - @memberjunction/ai-core-plus@5.46.0
  - @memberjunction/graphql-dataprovider@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- 572d219: Render agent final-response streaming in the conversation chat. Adds an optional `kind` discriminator to agent streaming chunks — `'final-response'` marks deltas of the user-facing reply — passed through the server's PubSub payload; the conversation client now routes those chunks, accumulates deltas service-side, renders the growing text in the message bubble, and reconciles with the saved final message on completion. Unmarked streams (e.g. Loop-agent JSON turn envelopes) keep today's behavior exactly (dropped), so agents that don't opt in are unaffected.
- Updated dependencies [572d219]
  - @memberjunction/ai-core-plus@5.45.1
  - @memberjunction/ai-engine-base@5.45.1
  - @memberjunction/graphql-dataprovider@5.45.1
  - @memberjunction/ai-agent-client@5.45.1
  - @memberjunction/core@5.45.1
  - @memberjunction/core-entities@5.45.1
  - @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [ad9f4a3]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/graphql-dataprovider@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/ai-engine-base@5.45.0
  - @memberjunction/ai-core-plus@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/ai-agent-client@5.45.0

## 5.44.0

### Minor Changes

- 3633fbb: Agent Skills, Plan Mode, and realtime widget UX.

  **Agent Skills** — portable `SKILL.md` import/export, a first-class Skill step wired into the Loop agent runtime, Skills engine caching + agent-gating resolution, the `AI Skills` resource type with "Can Share Skills" authorization, and the AI Skill sharing panel in the entity forms. Includes the skill-markdown converter/operations and the generated entity + resolver surface for the new Skill entities.

  **Plan Mode** — a human-in-the-loop plan-approval gate for the Loop agent (server + client), threaded through the agent client session/types, the GraphQL AI client, and the conversations composer/message-input UI so a run can pause for plan review before executing.

  **Realtime voice widget UX** — fixes and consolidation in `@memberjunction/ng-conversations`:
  - Fixed `NG0100 ExpressionChangedAfterItHasBeenCheckedError` when opening the Details panel (defer the `ResizeObserver` seed + callback to a microtask).
  - The surface/Details panel is now an independent right-hand peek gated on available width (not console chrome / text-reveal), so opening Details keeps the glowing orb and toggling captions off no longer removes the panel; the orb also returns immediately on captions-off.
  - Type-to-compose: any printable keystroke opens the composer and seeds itself as the first character (removed the dedicated "T" hotkey + hint).
  - Control consolidation: the banner is now state + window-chrome only (removed duplicate Captions/End controls, folded "pure audio" into the gear's Density = Simple); Captions is promoted to a first-class control in the compact lean dock.

  **Remote Browser** — `RemoteBrowserSnapshot` now honors its documented best-effort contract: it returns an empty snapshot instead of throwing when the underlying browser adapter has been torn down, so the client's periodic live-view poll never surfaces a recurring GraphQL error (with unit coverage).

- 1367fbb: AI Skill permissions (full agent parity) + `/skill` composer invocation. Skills now use the same dedicated-table, **open-by-default** permission model as AI Agents via `MJ: AI Skill Permissions`: a cached runtime helper (`AISkillPermissionHelper`, open-by-default) and a unified-engine provider (`AISkillPermissionProvider`, closed-by-default / Sharing Center), grantee-exclusivity enforced by `MJAISkillPermissionEntityServer`, and a `GetSkillsForAgent(agent, user?)` filter so the model's skill catalog is intersected with the acting user's Run permission. The old `AI Skills` Resource-Type sharing is retired in favor of a skill-scoped permissions grid (`SkillPermissionsPanel`/`Dialog`/`Service`), with the `Can Share Skills` authorization repointed to it. End users invoke a skill for a message by typing `/skill-name` in the conversation composer (mirrors `@agent`/`#entity`; picker filtered by permission, chips use `AISkill.IconClass`/`Color`); selected IDs thread through the client → resolver → runtime chain as `ExecuteAgentParams.requestedSkillIDs` (both the `RunAIAgent` and `RunAIAgentFromConversationDetail` mutations), and `BaseAgent.preActivateRequestedSkills` activates them at run start only if they survive the guard (agent-accepted ∩ user-permitted). Requires the companion Agent Skills migration + CodeGen.

### Patch Changes

- be5ab50: Prevent AI agent runs from bleeding into other conversations when swapping conversations early after sending: agent-lifecycle events now carry the captured ConversationID so the chat-area drops events from a backgrounded conversation, pending-message auto-send is pinned to its target conversation, intent-check start/complete are guarded symmetrically, the shared agent runner tracks in-flight runs with a refcount, and new-conversation creation no longer produces a duplicate sidebar row.
- Updated dependencies [3633fbb]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [be5ab50]
- Updated dependencies [aa9102d]
- Updated dependencies [2f926df]
- Updated dependencies [863a10d]
- Updated dependencies [2f9b863]
  - @memberjunction/ai-agent-client@5.44.0
  - @memberjunction/ai-engine-base@5.44.0
  - @memberjunction/ai-core-plus@5.44.0
  - @memberjunction/graphql-dataprovider@5.44.0
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/ai-core-plus@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/ai-agent-client@5.43.0
  - @memberjunction/ai-engine-base@5.43.0
  - @memberjunction/graphql-dataprovider@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [256ab06]
- Updated dependencies [9b9b484]
- Updated dependencies [e7c2437]
- Updated dependencies [5fde509]
- Updated dependencies [4ec1732]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/ai-core-plus@5.42.0
  - @memberjunction/core@5.42.0
  - @memberjunction/graphql-dataprovider@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/ai-engine-base@5.42.0
  - @memberjunction/ai-agent-client@5.42.0

## 5.41.0

### Minor Changes

- 4b3fb9d: Add Skip entity-form support: #entity mentions in conversations, interactive-form host wiring, and reusable form-field components
- c5d93a0: Metadata changes (default app agent -> Sage)

### Patch Changes

- fb2a22f: refactor(conversations): rename Voice* session/adapter/component symbols to Realtime* (no functional change)
- Updated dependencies [8fd6f59]
- Updated dependencies [2e48d1a]
- Updated dependencies [34d17e2]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
- Updated dependencies [4b3fb9d]
- Updated dependencies [c5d93a0]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/graphql-dataprovider@5.41.0
  - @memberjunction/ai-engine-base@5.41.0
  - @memberjunction/ai-core-plus@5.41.0
  - @memberjunction/ai-agent-client@5.41.0
  - @memberjunction/global@5.41.0
