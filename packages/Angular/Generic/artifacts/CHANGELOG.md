# @memberjunction/ng-artifacts

## 6.1.0-edge.6

### Patch Changes

- 634aa8c: Let an agent tell the framework whether its payload is a **new** artifact or a **new version** of an existing one, instead of leaving that to be inferred at the write.

  `ProcessAgentArtifacts` chose its target from continuity signals alone: an explicit `sourceArtifactId`, else the previous artifact on the conversation detail. Both signals say only "this conversation already has an artifact" — neither distinguishes a restyle of the current component from a request for a different one. So an agent that produced an unrelated deliverable mid-conversation had it saved as version N of whatever came before (Skip-Brain #529).

  `BaseAgentNextStep` and `ExecuteAgentResult` now carry an optional `ArtifactDirective`: `create-new`, `version-source` (with an optional `targetArtifactId`), or `suppress`. `planArtifactTarget()` is exported from `@memberjunction/ai-agents` so the resulting precedence is testable without a database.

  Precedence is deliberately narrow — the directive is advice from an agent, not a command, and is consulted only **after** the checks that already existed, so it can never widen what a caller or an agent's configuration refused:
  1. `createArtifacts === false` → nothing written; a directive cannot re-enable creation.
  2. `ArtifactCreationMode: 'Never'` → nothing written.
  3. The directive.
  4. **No directive → the historical chain, byte-for-byte unchanged.** Every existing agent is unaffected.

  `suppress` covers everything the step would persist as an artifact — the payload, and the artifacts wrapping any generated files or media. The run's media audit rows are still written: suppression governs what the user is shown, not lineage.

  **Every field of a directive is model output, and is treated as such.** A named `targetArtifactId` is honored only if it is a UUID-shaped string naming an artifact that exists AND that the run's user either owns or holds an explicit `CanEdit` grant on — otherwise the run falls back to the caller's `sourceArtifactId`, then to the historical chain. Without the ownership test, an agent could name any artifact id in the instance and have the run's payload appended to it, because `vwArtifacts` has no per-user predicate and a successful load proves only that a row exists. Existence and authorization resolve in one `RunViews` round trip rather than through `BaseEntity.Load`, which throws on a permission denial or a transient fault where this path needs a fallback. A directive's `name` is trimmed and clamped to its 255-character column rather than rejected, so an over-long model-written title costs a truncation instead of the entire artifact. Provenance ('did the agent name this id, or did the caller?') is carried on the plan instead of inferred by comparing values, so an agent echoing the run's own source id no longer routes a caller-supplied id through the model-output guards — nor lets a rejected id reappear through the fallback. A `targetArtifactId` that is not a string is discarded by `planArtifactTarget` itself, at the boundary that introduces it, so the plan's id is always a string by the time the runner vets its shape, existence and authorization; the discarded value is logged.

  A `behavior` this consumer cannot parse discards the **whole** directive, not just its targeting: `name` and `description` go with it, and the artifact falls back to the extracted-name pass exactly as it would with no directive at all. Trusting the free-text half of an object whose one enumerated field is unparseable would mean a directive the log says is being ignored still renaming the artifact.

  Ids reaching a `RunView.ExtraFilter` are now escaped **where the filter is built** rather than at one audited call site, so `GetMaxVersionForArtifact`, `CheckForDuplicateVersion` and `FindPreviousArtifactForMessage` are safe for every caller, including the `sourceArtifactId` that arrives from the GraphQL boundary. `ExtraFilter` has no parameterized form and the upstream clause validator permits `OR`, so this was a real predicate-injection surface.

  An artifact directive governs the payload of the agent that issued it and never crosses the parent/child boundary. A sub-agent's directive is logged and dropped rather than inherited by the parent's terminal step, which carries a merged payload and would otherwise be written onto an artifact the child named. Conversely, the two places that rebuild an agent's OWN terminal step — the client-tools `terminateAfterExecution` branch and `executeChatStep` — now carry the directive instead of dropping it.

  Two supporting changes ride along:
  - **`PayloadManager` no longer leaves data-free shells in arrays.** When a sub-agent returns a _shorter_ array than the parent holds, every scalar under the vacated index is deleted — and `_.unset` removes leaves while leaving the containers that held them. The result is an element that carries no data but is not key-free, which the previous `Object.keys().length === 0` cleanup could not see. Such elements are now pruned by a sweep **scoped to the indices this merge actually vacated**, so the recursive emptiness test cannot reach elements the merge never touched: a legitimate all-null record elsewhere in the payload, or one whose deletion the upstream-path guardrail refused, survives exactly as before. The global key-less-`{}` cleanup is unchanged. The scoped sweep also closes the hole `_.unset` leaves when a scalar array is shortened, and prunes a fully vacated NESTED array — a latent defect that predates this work and that the recursive test now covers. Before this, a sub-agent legitimately removing one item from a structured array left a nameless residue that downstream consumers read as a real record; for component pipelines that meant a crash at the last step, after the full generation run.
  - **`ng-conversations` stops guessing which artifact to open.** The chat area snapshots artifact versions before a turn and diffs after, with _created_ beating _bumped_, so a newly created artifact wins the panel over one that merely gained a version — including when the panel is already open on something else, which the previous `!showArtifactPanel` gate suppressed. Because the panel is no longer gated on being closed, the decision is applied only while the conversation it was computed for is still on screen and only while the user has not made a selection of their own in the meantime; a run that finishes during a conversation switch or a scroll-up no longer mistakes artifacts arriving in the map for artifacts the run created. A creation is also chosen by the newest version's timestamp rather than by whichever conversation detail the map happened to iterate last, and artifact ids are grouped as UUIDs wherever they are deduplicated, so the two casings the two database engines return can no longer render one artifact as two cards. Dead `targetArtifactVersionId` plumbing in the message input is left intact on this line, where the Check Sage Intent prompt populates it.

  The artifact viewer no longer loads twice per open or refresh: switching artifact and version together delivered both inputs in one change-detection pass and its two independent `ngOnChanges` branches each ran a full load, the second without a cancellation token. Its refresh guard also compares artifact ids as UUIDs now, so a refresh is no longer dropped when the two sides picked the id up from differently-cased sources.

- b915983: Align the Angular toolchain on the current 21.x patch line: framework packages 21.1.3 → 21.2.22,
  CLI/builders 21.1.3 → 21.2.23, CDK 21.1.3 → 21.2.14, ng-packagr → 21.2.7, PrimeNG 21.1.1 → 21.1.9.

  This is a patch-level move inside the supported Angular 21 LTS line, not a framework migration.
  It closes every open Angular security advisory on the repository — fifteen distinct GHSAs
  (i18n and template-sanitizer XSS bypasses, service-worker header leakage and credential
  stripping, HttpTransferCache cross-request leakage, and formatDate/number-format DoS), all fixed
  in 21.2.19 or earlier — which together accounted for 438 of the 749 open Dependabot alerts.

  Every published `@memberjunction/ng-*` package's `@angular/*` peer range moves from `^21.1.3`
  (or `^21.0.0`) to `^21.2.22`, so consumers must be on at least that patch. The era-6 platform
  manifest in `release-lines.json` records the new pin; era 5 (the certified 5.51 line) is
  unchanged.

  Also moves the exact `@angular/*` runtime pins that 23 libraries carried in `dependencies`
  into caret `peerDependencies` (adding the missing peers on `ng-react`), so a consumer on any
  in-range Angular 21.2.x build gets a single Angular copy instead of a nested second runtime, and
  drops the unused `primeng` peer from `ng-base-forms` (nothing in the repo imports PrimeNG).

- 1bced7c: Show that a generated artifact is still loading

  A message with a generated image rendered as finished with nothing where the image belonged, then
  the image appeared unannounced a few seconds later. It read as a failed generation rather than one
  still in flight. Two windows had no visual state at all:
  - `applyArtifactsToInstance` awaited each artifact and version row before rendering anything, even
    though `resolveDistinctArtifacts` had already returned them synchronously from an in-memory map.
    The artifacts that still need one are now published to the message immediately — name and
    visibility included, since `LazyArtifactInfo` carries both and only the ENTITY rows are lazy —
    and each draws a named `mj-loading` placeholder until its card is ready. `isLoaded` decides what
    counts as pending, so an artifact already in hand is never announced; the rest is filtered per
    artifact (by `UUIDsEqual`, since the two IDs come from different sources and differ in case
    between SQL Server and PostgreSQL), so a message showing a loaded report and still fetching an
    image renders both. Placeholders sort after the loaded cards, so an arrival appends rather than
    reorders. Applies to every artifact type.
  - The image, audio and video previews each had only an `error` and a `loaded` branch, so they drew
    nothing while `resolveContentUrl()` resolved. All three now show `mj-loading`. The image holds it
    until the `<img>` `load` event fires rather than until `src` is assigned, because an inline
    `data:` URI — what MJ stores whenever no file storage account is configured — can be several MB
    and the decode is the part the user waits on; the pending image is hidden with `opacity` rather
    than `display: none`, which would take it out of the paint tree and stop the decode it is
    waiting for.

  Three defects fixed alongside, all in the same code path: the artifact apply now runs after the
  message's other inputs are assigned (it forces the child's first change-detection pass, so running
  it early meant `ngAfterViewInit` saw a null agent run and never started the run-duration timer); a
  per-message generation counter stops a stale in-flight load clobbering a newer one; and the
  settle handlers no longer touch a destroyed view.

  This does not change how long anything takes, and it does not address the separate delay before an
  artifact exists server-side.

- 05b4cb5: **An artifact with no viewer plugin gets a file card and a real Download, not an empty pane.**

  The viewer panel's display tab knew two things: a type's plugin, or the extracted markdown/HTML
  attributes. A type with neither — CSV today, any new file type tomorrow — rendered nothing, and
  offered no way to get the file: a file-backed version has no inline `Content`, and the panel had no
  download action. First-adopter feedback: an exported exam CSV opened to a blank pane.

  Now such an artifact shows a file card (name, type, size) with a Download button — file-backed
  content via the pre-authenticated URL fetched to a blob so the browser saves it (falling back to
  opening the URL if storage refuses the cross-origin fetch), inline content via its data URL — and
  text-like content (`text/*`, JSON, XML, CSV) is fetched and shown as plain text, capped at 200 KB
  with a note to download the rest. Plugins and extracted attributes still take precedence.

- 92f2ac9: Repo-wide sweep of code that assumed an entity's primary key is a single column named `ID`, plus a `PrimaryKeyCompliance` gate in `@memberjunction/core` so the pattern cannot come back.

  MJ supports primary keys with any column name(s) and type(s). Every MJ core entity happens to use `ID`, so hardcoding it works across the whole core product and silently breaks on customer entities mapped from external schemas — `Load()` rejects the invented field name, or a composite key is truncated to its first column. #4179 (search result click-through) was one instance; this sweep found the same shape in ~90 files and fixes all of it on top of the `CompositeKey.FromURLSegment` / `FromEntityRecord` / `ToCompactURLSegment` primitives introduced with that fix.

  **What changed, by kind**
  - **Literal `ID` key construction** (`{ FieldName: 'ID', Value: x }`, `LoadFromSingleKeyValuePair('ID', …)`, `FromKeyValuePair('ID', …)`) — ~135 sites. Where the entity is a literal MJ core entity the key is now `CompositeKey.FromID(x)`, the one sanctioned way to say "this entity's key is `ID`". Where the entity is a variable (an event's `EntityName`, an `entityInfo`, a configured entity) the key is `CompositeKey.FromURLSegment(entityInfo, recordId)`, which reads a bare value or a `F1|v1||F2|v2` segment against the entity's real primary key(s).
  - **`PrimaryKeys[0]` → `FirstPrimaryKey`** — 39 sites. Same semantics, a named accessor the gate can track. IS-A shared-key and keyset uses are annotated `// first-pk-ok`.
  - **Real defects fixed** (arbitrary entity keyed as `ID`): Mobile app record load/edit/offline sync; the generic form overlay; the ERD "open record" path; version-history label/diff/micro-view links (which stripped `ID|` off a stored key and re-wrapped the value as `ID`); `RestoreEngine` and `buildPrimaryKeyForLoad`; the Apollo enrichment connector (six `GetEntityObject(configuredEntity, FromID(record.ID))` calls); geocoding record reload; List Detail record-open (composite keys now open instead of showing a notice); `EmbeddedRecord`; `DatabaseReferenceScanner`; hardcoded `ID` filters on a variable entity in Data Explorer's record load, Predictive Studio's label lookup, the realtime-widget visitor identity lookup, `DuplicateRecordDetector.LoadRecordsByListID`, and MetadataSync's `@lookup` GUID conversion.
  - **REST API**: `EntityCRUDHandler` / `RESTEndpointHandler` built the key from the `:id` segment for single-column keys only and threw "Composite primary keys are not supported". Both now accept a bare value or a URL-encoded `Field1|Value1||Field2|Value2` segment. Single-column behavior is unchanged.
  - **One serializer instead of eight**: `ListOperations.serializeRecordId`, `list-set-operations.serializeRecordId`, RecordSetProcessor's `serializeRecordId`, `GetListRecordsAction`'s inline copy, `MJListDetailEntityExtended.BuildRecordID` / `GetCompositeKey`, `record.util.buildCompositeKey`, `VersionHistory.buildCompositeKeyFromRecord` and `ChangeDetector.buildDeleteItem` all delegate to `CompositeKey.FromEntityRecord(...).ToCompactURLSegment()` / `FromURLSegment(...)`. Output is byte-identical for single-column keys.

  **`FirstPrimaryKey` triage** — every one of the ~390 `FirstPrimaryKey` / `FromID` uses in the repo was read in context and either rewritten or annotated with a reason (154 annotations). Real defects found and fixed along the way, all of the shape "first key column used as the whole key" on an entity that can be composite-keyed:
  - **Data providers**: the deterministic `ORDER BY` fallback for row-limited queries ordered by the first key column only, leaving composite-key pages in undefined order; it now orders by every key column. Saved-view run logging / exclusion and the `{%UserView%}` template subquery, whose persisted `RecordID` cannot hold a composite key, now refuse loudly instead of excluding wrong rows. The dependency-link subquery now predicates on the full key. Single-column SQL is byte-identical.
  - **CodeGen**: generated cascade delete/update procs bound the child FK to `@<firstPK>` regardless of which parent key column the FK references; a composite key containing an identity column dropped the other key columns from the generated INSERT (both providers); the PostgreSQL JSON-arg `spCreate` inserted only the first key column; the generated join-grid/timeline filters and the GraphQL audit-log `RecordID` truncated composite keys. Single-key generator output verified byte-identical against `HEAD` (168 shapes).
  - **Smart cache** (`ProviderBase` differential merge): keyed rows on the first PK, so composite-key deletes never applied and rows sharing the first column collapsed.
  - **Integration push sync**: composed record identity from the first key column while the record map stores all columns joined, so every already-synced composite-key row was re-created externally as a duplicate on each full push; the changed-record path silently dropped rows.
  - **Scheduled geocoding orphan cleanup** (destructive): compared a cast of the first key column to a `RecordID` holding all columns, so every geocode row for a composite-key entity was deleted on each run.
  - **Lists**: list membership, export and add-record paths filtered on the first key column and wrote only its value into `ListDetail.RecordID`; Explorer "open record" paths on user-selected entities, duplicate detection, omnibar record search, Data Explorer deep links, the sharing center revoke, recent-access, tree dropdowns, the mobile app's record ids and offline queue.
  - **AI**: duplicate detection, vector sync record ids, Predictive Studio list scope and write-back; the Recommendations engine also wrote a record id into `SourceEntityID` (an FK to Entities) and never set `SourceEntityRecordID`.
  - **Apollo enrichment**: `Accounts` (a customer entity) loaded by literal `ID`; the contacts path read its key off an entity that had never been loaded.
  - Every `entityInfo.FirstPrimaryKey?.Name ?? 'ID'` fallback is gone; where the entity can be missing the code now fails loudly instead of inventing `ID`.

  **The gate** — `packages/MJCore/src/__tests__/PrimaryKeyCompliance.test.ts`, modelled on `MultiProviderCompliance` / `UUIDCompliance`:
  1. _Strict_: a key built with a literal `ID` field name. Marker `// pk-literal-ok: <reason>`.
  2. _Strict_: `PrimaryKeys[0]` / `PrimaryKeys.at(0)`.
  3. _Strict_: `FirstPrimaryKey` and `CompositeKey.FromID(`. These are legitimate only where MJ is single-column by design (foreign-key targets, keyset `ORDER BY` / `AfterKey`, IS-A shared keys, core entities), so every use must be self-evidently on a core entity or say why: `FromID` is exempt when a `'MJ: …'` entity literal is on the same line or within 8 lines above (the `GetEntityObject` / `OpenEntityRecord` naming the core entity); everything else carries `// first-pk-ok: <reason>` on the same line, reason mandatory.
  4. _Strict_: an `ID = …` / `ID IN (…)` `ExtraFilter` or `Fields: ['ID']` within eight lines of an `EntityName:` that is a variable rather than a string literal or ALL_CAPS constant. Marker `// pk-filter-ok: <reason>`.

  Generated code, tests, `dist/`, and the `TestingFramework` / `UnitTesting` packages are not scanned. The rule is written up in `.claude/rules/data-access.md` § "Primary keys: never assume a column named ID". There is no baseline file: all four gates are strict.

  No public signatures change; every edit is additive or a same-shape substitution, so this is `patch` throughout.

- Updated dependencies [2c826f7]
- Updated dependencies [b915983]
- Updated dependencies [b7819d2]
- Updated dependencies [c1fea88]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [4c1de04]
- Updated dependencies [0d3094c]
- Updated dependencies [0ec1980]
- Updated dependencies [a8ba8b7]
- Updated dependencies [43f9133]
- Updated dependencies [2cc08e1]
- Updated dependencies [2d14c62]
- Updated dependencies [38d4482]
- Updated dependencies [51017a5]
- Updated dependencies [2e4786e]
- Updated dependencies [de66f54]
- Updated dependencies [48ae81e]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [e9e9873]
- Updated dependencies [aff9886]
- Updated dependencies [10cbc60]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [14bc0b2]
- Updated dependencies [7a98676]
- Updated dependencies [75ca6f8]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [1748491]
- Updated dependencies [7fefca2]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/ng-base-forms@6.1.0-edge.6
  - @memberjunction/ng-base-types@6.1.0-edge.6
  - @memberjunction/ng-code-editor@6.1.0-edge.6
  - @memberjunction/ng-export-service@6.1.0-edge.6
  - @memberjunction/ng-markdown@6.1.0-edge.6
  - @memberjunction/ng-media-player@6.1.0-edge.6
  - @memberjunction/ng-notifications@6.1.0-edge.6
  - @memberjunction/ng-pagination@6.1.0-edge.6
  - @memberjunction/ng-query-viewer@6.1.0-edge.6
  - @memberjunction/ng-react@6.1.0-edge.6
  - @memberjunction/ng-shared-generic@6.1.0-edge.6
  - @memberjunction/ng-trees@6.1.0-edge.6
  - @memberjunction/ng-ui-components@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/graphql-dataprovider@6.1.0-edge.6
  - @memberjunction/interactive-component-types@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- 5f33ca8: Slack and Teams adapters: first production bring-up

  Defects found running the adapters against a real MJ app — one Slack app per agent
  (Socket Mode) plus Teams via Bot Framework.

  **Startup and identity**
  - Users are resolved via `UserCache.Instance`. `new UserCache()` returned the shared
    singleton and then re-initialized it empty, so no messaging extension could start
    and the whole server lost its user cache until the next refresh.
  - Running one platform app per agent no longer causes bots to cross-talk in shared
    channels: thread replies are answered only by the addressed bot, bot-authored
    messages are excluded from history and thread affinity, and a new
    `DisableDelegation` setting stops a pinned bot from handing off.
  - A bot recognises its own replies. Slack publishes two identifiers for one bot and
    returns the `bot_id` (with no `user`) for any message posted with a username
    override — which every agent reply uses, since per-agent identity is the point of
    one app per agent. Comparing only against `auth.test()`'s `user_id` therefore never
    matched, so the thread gate above declined threads the bot was actively holding and
    the agent lost its own turns from context.

  **Delivery**
  - Generated files and images are delivered as real attachments. Adapters may
    implement `uploadMediaOutputs` (Slack does, and needs the `files:write` scope);
    inlined `data:` URIs are decoded; and the run's canonical `fileOutputs` are used
    rather than depending on the model to inline them.
  - A non-public button URL no longer fails the entire Slack message — it degrades to
    a link, so a localhost `ExplorerBaseURL` stops suppressing replies outright.
  - The artifact link points at the file the agent produced rather than its internal
    payload, and `System Only` artifacts are no longer linked. Callers relying on
    `artifactInfo` being the payload artifact now receive the file artifact when a run
    produced one.
  - `ng-artifacts`: downloading a file artifact returns real bytes under its own MIME
    type and filename, instead of a `.txt` file full of base64.
  - `ng-explorer-core`: a conversation deep link opened cold now honours the URL rather
    than restoring the previously-viewed conversation.

  **Slack**
  - Interactivity works in Socket Mode; previously every button and modal was inert, so
    human-in-the-loop form flows dead-ended.
  - Message text is capped at the real `text` limit rather than the block-payload limit,
    which was failing long responses with `msg_too_long`.
  - Modal placeholders are truncated to 150 characters; an over-long one failed the whole
    `views.open` and left a button that looked dead.

  **Teams**
  - `MentionedAgentNames` is populated, so a named agent is reachable at all — previously
    every Teams turn ran the default agent.
  - Response forms route the answer back to the agent that asked, via `mj_agent`.
  - Buttons are built only over `http:`/`https:` URLs. Teams silently ignores `data:`/`blob:`/`file:`
    (so "Download document" was dead by construction whenever MJ inlined the artifact) and hands
    unknown schemes such as `javascript:` or `ms-msdt:` to the OS URI handler, so the check is an
    allow-list. Dropped buttons become a note pointing at the artifact link; localhost stays allowed.
  - A response form's submitted agent name is validated against the known agents before it is used
    to route, rather than trusted from the client-controlled submit payload.
  - Deep links no longer assume `resourceId` is present, now that a Record can be
    addressed by `keys`.

- Updated dependencies [4273317]
- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [c09c818]
- Updated dependencies [d66a26a]
- Updated dependencies [e93f221]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [d7feeae]
- Updated dependencies [905820a]
  - @memberjunction/ng-shared-generic@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/ng-ui-components@6.1.0-edge.5
  - @memberjunction/ng-markdown@6.1.0-edge.5
  - @memberjunction/graphql-dataprovider@6.1.0-edge.5
  - @memberjunction/ng-base-forms@6.1.0-edge.5
  - @memberjunction/ng-query-viewer@6.1.0-edge.5
  - @memberjunction/ng-base-types@6.1.0-edge.5
  - @memberjunction/ng-code-editor@6.1.0-edge.5
  - @memberjunction/ng-notifications@6.1.0-edge.5
  - @memberjunction/ng-react@6.1.0-edge.5
  - @memberjunction/ng-trees@6.1.0-edge.5
  - @memberjunction/ng-media-player@6.1.0-edge.5
  - @memberjunction/interactive-component-types@6.1.0-edge.5
  - @memberjunction/ng-export-service@6.1.0-edge.5
  - @memberjunction/ng-pagination@6.1.0-edge.5

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
  - @memberjunction/ng-base-forms@6.1.0-edge.4
  - @memberjunction/ng-base-types@6.1.0-edge.4
  - @memberjunction/ng-code-editor@6.1.0-edge.4
  - @memberjunction/ng-notifications@6.1.0-edge.4
  - @memberjunction/ng-query-viewer@6.1.0-edge.4
  - @memberjunction/ng-react@6.1.0-edge.4
  - @memberjunction/ng-shared-generic@6.1.0-edge.4
  - @memberjunction/ng-trees@6.1.0-edge.4
  - @memberjunction/graphql-dataprovider@6.1.0-edge.4
  - @memberjunction/ng-media-player@6.1.0-edge.4
  - @memberjunction/interactive-component-types@6.1.0-edge.4
  - @memberjunction/ng-export-service@6.1.0-edge.4
  - @memberjunction/ng-markdown@6.1.0-edge.4
  - @memberjunction/ng-ui-components@6.1.0-edge.4
  - @memberjunction/ng-pagination@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [a2e4e09]
- Updated dependencies [199eb2b]
- Updated dependencies [07cb22e]
- Updated dependencies [deea1a3]
- Updated dependencies [711c208]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [06ccfb2]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [69f2bf2]
- Updated dependencies [05865ea]
- Updated dependencies [8ec1515]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [7b4abe7]
- Updated dependencies [ac6755c]
- Updated dependencies [73c853b]
- Updated dependencies [051e0ff]
- Updated dependencies [142cf2a]
- Updated dependencies [95fc3e6]
- Updated dependencies [e635378]
- Updated dependencies [26046d8]
- Updated dependencies [cefc302]
- Updated dependencies [44ac084]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [6e98173]
- Updated dependencies [0869c24]
- Updated dependencies [aa9006b]
- Updated dependencies [a76cf28]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [2e2879e]
- Updated dependencies [9b6fb5b]
- Updated dependencies [b46330e]
- Updated dependencies [2a0262d]
- Updated dependencies [6ef741e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [6cd337d]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/ng-base-forms@6.1.0-edge.3
  - @memberjunction/graphql-dataprovider@6.1.0-edge.3
  - @memberjunction/ng-code-editor@6.1.0-edge.3
  - @memberjunction/ng-base-types@6.1.0-edge.3
  - @memberjunction/ng-notifications@6.1.0-edge.3
  - @memberjunction/ng-ui-components@6.1.0-edge.3
  - @memberjunction/ng-query-viewer@6.1.0-edge.3
  - @memberjunction/ng-react@6.1.0-edge.3
  - @memberjunction/ng-shared-generic@6.1.0-edge.3
  - @memberjunction/ng-trees@6.1.0-edge.3
  - @memberjunction/ng-media-player@6.1.0-edge.3
  - @memberjunction/interactive-component-types@6.1.0-edge.3
  - @memberjunction/ng-export-service@6.1.0-edge.3
  - @memberjunction/ng-markdown@6.1.0-edge.3
  - @memberjunction/ng-pagination@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [255d506]
- Updated dependencies [8de5f7e]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ng-base-forms@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/graphql-dataprovider@6.1.0-edge.2
  - @memberjunction/ng-base-types@6.1.0-edge.2
  - @memberjunction/ng-code-editor@6.1.0-edge.2
  - @memberjunction/ng-notifications@6.1.0-edge.2
  - @memberjunction/ng-query-viewer@6.1.0-edge.2
  - @memberjunction/ng-react@6.1.0-edge.2
  - @memberjunction/ng-shared-generic@6.1.0-edge.2
  - @memberjunction/ng-trees@6.1.0-edge.2
  - @memberjunction/ng-media-player@6.1.0-edge.2
  - @memberjunction/interactive-component-types@6.1.0-edge.2
  - @memberjunction/ng-export-service@6.1.0-edge.2
  - @memberjunction/ng-markdown@6.1.0-edge.2
  - @memberjunction/ng-ui-components@6.1.0-edge.2
  - @memberjunction/ng-pagination@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- 394d276: Declare @angular/\* peer dependencies as ranges (^21.1.3) instead of exact pins across all Angular library packages. Peer declarations are compatibility claims, not install instructions: the exact pins falsely claimed incompatibility with every other Angular 21.x build, produced 502 peer-resolution errors under strict pnpm workspaces, and structurally blocked Angular security patches behind a full republish. Installed versions remain pinned by consuming apps and the era platform manifest; dependencies/devDependencies keep their exact pins.
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
  - @memberjunction/ng-ui-components@6.1.0-edge.1
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ng-base-forms@6.1.0-edge.1
  - @memberjunction/ng-base-types@6.1.0-edge.1
  - @memberjunction/ng-code-editor@6.1.0-edge.1
  - @memberjunction/ng-export-service@6.1.0-edge.1
  - @memberjunction/ng-markdown@6.1.0-edge.1
  - @memberjunction/ng-media-player@6.1.0-edge.1
  - @memberjunction/ng-notifications@6.1.0-edge.1
  - @memberjunction/ng-pagination@6.1.0-edge.1
  - @memberjunction/ng-query-viewer@6.1.0-edge.1
  - @memberjunction/ng-shared-generic@6.1.0-edge.1
  - @memberjunction/ng-trees@6.1.0-edge.1
  - @memberjunction/graphql-dataprovider@6.1.0-edge.1
  - @memberjunction/ng-react@6.1.0-edge.1
  - @memberjunction/interactive-component-types@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- b895f92: Angular DOM unit-testing — Phase 4 coverage push. Dev-only (test files + test-config/CI-gate scoping); no runtime change.

  Drives the Generic DOM-coverage ratchet (`scripts/dom-test-report.mjs … --max-none`) from **185 → 137** by writing DOM specs, in usage-ranked order, for every Generic Angular component appropriate for a DOM unit test. Highlights:
  - **Highest-leverage primitives** — `MjFormFieldComponent` (the field renderer behind ~4,000 usages) across its read/edit type matrix; the `ui-components` design system (`MJEmptyStateComponent`, the `mj-page-*` chrome family, `MJDropdown`/`MJCombobox`/`MJFilterPopover` via a new CDK-overlay test helper in `ng-test-utils`, the `mj-dialog` family, tabs, filter panel, left-nav).
  - **Form host stack** — `MjRecordFormContainer`, `MjFormToolbar`, `MjEntityFormHost`, `MjIsaRelatedPanel`, `FormPanelSlot`, `ExplorerEntityDataGrid`, `InteractiveForm`.
  - **Viewers, grids & dialogs** — `EntityDataGrid` + `QueryDataGrid` (AG-Grid chrome), `EntityViewer`, `ArtifactViewerPanel`, the ERD component family (`ERDComposite`/`MJEntityERD`/`ERDDiagram`), plus a broad set of panels/editors/dialogs across agents, artifacts, search, composer, list-management, scheduling, record-process-studio, user-routines, entity-action-ux, actions, and testing.
  - **`Angular/Bootstrap` onboarded** — the last untracked library tree gains a DOM test tier (`MJAuthShell`, `MJBootstrap`) and its own `--max-none=0` CI gate, so every shipped Angular library tree (Explorer, Generic, Bootstrap) is now gated.

  Reusable patterns established for the harder components: drive internal state before the first render (`setup`) rather than mutating post-render (unreliable under zoneless CD); stub the heavy core (AG-Grid, React bridge, SVG layout, plugin viewers) and spy async loaders so specs exercise the component's own chrome/wiring; add each component **and its injected services** to enumerated `tsconfig.spec.json` files (or AOT drops decorator metadata → NG0202).

  Deliberately **not** covered, and left at the 137 floor: five integration/e2e-tier orchestrators (`ConversationChatArea`, `MessageInput`, `RealtimeWhiteboardBoard`, `AITestHarness`, `RealtimeSessionOverlay`) — 1,800–4,600-line components with realtime/WebRTC/canvas cores or 14–30 dependencies, which belong in the browser regression suite rather than DOM units.

- Updated dependencies [b895f92]
- Updated dependencies [b895f92]
- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [d26e202]
- Updated dependencies [27e4d09]
- Updated dependencies [5c6e36c]
  - @memberjunction/ng-base-forms@6.1.0-edge.0
  - @memberjunction/ng-ui-components@6.1.0-edge.0
  - @memberjunction/ng-query-viewer@6.1.0-edge.0
  - @memberjunction/ng-markdown@6.1.0-edge.0
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/ng-react@6.1.0-edge.0
  - @memberjunction/interactive-component-types@6.1.0-edge.0
  - @memberjunction/ng-trees@6.1.0-edge.0
  - @memberjunction/ng-base-types@6.1.0-edge.0
  - @memberjunction/ng-code-editor@6.1.0-edge.0
  - @memberjunction/ng-notifications@6.1.0-edge.0
  - @memberjunction/ng-shared-generic@6.1.0-edge.0
  - @memberjunction/graphql-dataprovider@6.1.0-edge.0
  - @memberjunction/ng-media-player@6.1.0-edge.0
  - @memberjunction/ng-export-service@6.1.0-edge.0
  - @memberjunction/ng-pagination@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ng-base-forms@6.0.0
  - @memberjunction/ng-base-types@6.0.0
  - @memberjunction/ng-code-editor@6.0.0
  - @memberjunction/ng-media-player@6.0.0
  - @memberjunction/ng-notifications@6.0.0
  - @memberjunction/ng-query-viewer@6.0.0
  - @memberjunction/ng-react@6.0.0
  - @memberjunction/ng-shared-generic@6.0.0
  - @memberjunction/ng-trees@6.0.0
  - @memberjunction/graphql-dataprovider@6.0.0
  - @memberjunction/interactive-component-types@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/ng-export-service@6.0.0
  - @memberjunction/ng-markdown@6.0.0
  - @memberjunction/ng-pagination@6.0.0
  - @memberjunction/ng-ui-components@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/ng-react@5.51.0
  - @memberjunction/ng-base-forms@5.51.0
  - @memberjunction/ng-base-types@5.51.0
  - @memberjunction/ng-code-editor@5.51.0
  - @memberjunction/ng-media-player@5.51.0
  - @memberjunction/ng-notifications@5.51.0
  - @memberjunction/ng-query-viewer@5.51.0
  - @memberjunction/ng-shared-generic@5.51.0
  - @memberjunction/ng-trees@5.51.0
  - @memberjunction/graphql-dataprovider@5.51.0
  - @memberjunction/interactive-component-types@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/ng-export-service@5.51.0
  - @memberjunction/ng-markdown@5.51.0
  - @memberjunction/ng-pagination@5.51.0
  - @memberjunction/ng-ui-components@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- ce6374c: Artifact engine no longer bulk-loads versions at boot; cache guarded.
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
  - @memberjunction/ng-query-viewer@5.50.0
  - @memberjunction/ng-base-forms@5.50.0
  - @memberjunction/ng-base-types@5.50.0
  - @memberjunction/ng-code-editor@5.50.0
  - @memberjunction/ng-notifications@5.50.0
  - @memberjunction/ng-react@5.50.0
  - @memberjunction/ng-shared-generic@5.50.0
  - @memberjunction/ng-trees@5.50.0
  - @memberjunction/graphql-dataprovider@5.50.0
  - @memberjunction/ng-media-player@5.50.0
  - @memberjunction/interactive-component-types@5.50.0
  - @memberjunction/ng-export-service@5.50.0
  - @memberjunction/ng-markdown@5.50.0
  - @memberjunction/ng-ui-components@5.50.0
  - @memberjunction/ng-pagination@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- b5a8e3f: Fix Query Builder ad-hoc query results being capped at 100 rows with no working pager. The ad-hoc query resolver now paginates the first page (StartRow 0) and reports the true total row count via a COUNT(\*) query instead of a TOP-N cap, and the data grid no longer collapses value-identical rows from queries without an ID column. The artifact viewer title and grid toolbar now show the true total row count.
- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [88d707b]
- Updated dependencies [1a15bd2]
- Updated dependencies [85575cf]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [70c658c]
- Updated dependencies [b5a8e3f]
  - @memberjunction/core@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/graphql-dataprovider@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/ng-query-viewer@5.49.0
  - @memberjunction/ng-base-forms@5.49.0
  - @memberjunction/ng-export-service@5.49.0
  - @memberjunction/ng-markdown@5.49.0
  - @memberjunction/ng-media-player@5.49.0
  - @memberjunction/ng-shared-generic@5.49.0
  - @memberjunction/ng-trees@5.49.0
  - @memberjunction/ng-ui-components@5.49.0
  - @memberjunction/ng-base-types@5.49.0
  - @memberjunction/ng-code-editor@5.49.0
  - @memberjunction/ng-notifications@5.49.0
  - @memberjunction/ng-react@5.49.0
  - @memberjunction/interactive-component-types@5.49.0
  - @memberjunction/ng-pagination@5.49.0

## 5.48.0

### Patch Changes

- 09e1b4b: Fix Apply to my Form (resolve spec code, handle Pending overrides, improve # typeahead), auto-add app schemas to excludeSchemas on OpenApp install/upgrade, surface RenderedSQL through RunQueryResult and TestQuerySQL, strip ORDER BY before outer-wrapping unparseable SQL in MaxRows, fix lazy-config loader variable name collisions in codegen manifest, and add read-only provider support and missing SQL function keywords in PostgreSQL provider
- Updated dependencies [09e1b4b]
- Updated dependencies [bda123a]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/ng-base-forms@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/ng-base-types@5.48.0
  - @memberjunction/ng-code-editor@5.48.0
  - @memberjunction/ng-media-player@5.48.0
  - @memberjunction/ng-notifications@5.48.0
  - @memberjunction/ng-query-viewer@5.48.0
  - @memberjunction/ng-react@5.48.0
  - @memberjunction/ng-shared-generic@5.48.0
  - @memberjunction/ng-trees@5.48.0
  - @memberjunction/graphql-dataprovider@5.48.0
  - @memberjunction/interactive-component-types@5.48.0
  - @memberjunction/ng-markdown@5.48.0
  - @memberjunction/ng-export-service@5.48.0
  - @memberjunction/ng-pagination@5.48.0
  - @memberjunction/ng-ui-components@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/ng-base-forms@5.47.0
  - @memberjunction/ng-base-types@5.47.0
  - @memberjunction/ng-code-editor@5.47.0
  - @memberjunction/ng-media-player@5.47.0
  - @memberjunction/ng-notifications@5.47.0
  - @memberjunction/ng-query-viewer@5.47.0
  - @memberjunction/ng-react@5.47.0
  - @memberjunction/ng-shared-generic@5.47.0
  - @memberjunction/ng-trees@5.47.0
  - @memberjunction/graphql-dataprovider@5.47.0
  - @memberjunction/interactive-component-types@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/ng-export-service@5.47.0
  - @memberjunction/ng-markdown@5.47.0
  - @memberjunction/ng-pagination@5.47.0
  - @memberjunction/ng-ui-components@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/ng-base-forms@5.46.0
  - @memberjunction/ng-base-types@5.46.0
  - @memberjunction/ng-code-editor@5.46.0
  - @memberjunction/ng-media-player@5.46.0
  - @memberjunction/ng-notifications@5.46.0
  - @memberjunction/ng-query-viewer@5.46.0
  - @memberjunction/ng-react@5.46.0
  - @memberjunction/ng-shared-generic@5.46.0
  - @memberjunction/ng-trees@5.46.0
  - @memberjunction/graphql-dataprovider@5.46.0
  - @memberjunction/interactive-component-types@5.46.0
  - @memberjunction/ng-export-service@5.46.0
  - @memberjunction/ng-markdown@5.46.0
  - @memberjunction/ng-pagination@5.46.0
  - @memberjunction/ng-ui-components@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/graphql-dataprovider@5.45.1
- @memberjunction/ng-media-player@5.45.1
- @memberjunction/ng-notifications@5.45.1
- @memberjunction/ng-react@5.45.1
- @memberjunction/ng-base-forms@5.45.1
- @memberjunction/ng-query-viewer@5.45.1
- @memberjunction/ng-base-types@5.45.1
- @memberjunction/ng-code-editor@5.45.1
- @memberjunction/ng-export-service@5.45.1
- @memberjunction/ng-markdown@5.45.1
- @memberjunction/ng-pagination@5.45.1
- @memberjunction/ng-shared-generic@5.45.1
- @memberjunction/ng-trees@5.45.1
- @memberjunction/ng-ui-components@5.45.1
- @memberjunction/interactive-component-types@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/core-entities@5.45.1
- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- 13716e4: Add the canonical confirm-prompt primitives to `@memberjunction/ng-ui-components` and migrate every native `window.confirm()` in MJ Explorer onto them.

  **`@memberjunction/ng-ui-components` (new capability):**
  - New **`<mj-confirm-dialog>`** — the canonical confirmation dialog (danger/warning/info/default variants, title + message + detail lines, MJ left-confirm button order, `Processing` state, Esc/backdrop dismissal inherited from `mj-dialog`).
  - New **`MJConfirmService`** — the imperative, Promise-based replacement for `window.confirm()`: `await confirm.Confirm('Discard changes?')` / `ConfirmDelete({ message, detail, confirmText })`. Mounts the dialog on `document.body`, resolves `true`/`false`, tears down on settle.
  - **Layering fix:** service-spawned dialogs are lifted into their own stacking context (z-index 20000) so a confirm launched over a drawer, slide-panel, or `mj-window` renders above that overlay instead of dimmed and unclickable beneath its backdrop (previously each swallowed click could re-trigger the caller and stack another dialog). Declarative template usage is unchanged.

  **Consumers — 47 native `confirm()` prompts migrated** across 23 files in 6 packages: dashboards (Credentials, MCP, Tags/Autotagging/Prompts, QueryBrowser, FormBuilder, ComponentStudio, DatabaseDesigner), core-entity-forms (Queries, Templates, Tests, Lists, template editor), artifacts (version restore), ai-test-harness (save/clear/delete/import), conversations (collection + artifact share modals, collection tree/view — whose ten native `alert()`s were also replaced with `MJNotificationService` toasts), and credentials (the credential/type/category edit-panel deletes, adding the package's missing `ng-ui-components` dependency). Deletes route through `ConfirmDelete` (red confirm, "Delete"/"Remove" labels); discards and overwrite warnings through `Confirm`. Handlers that gate on the answer were made async only after verifying every caller is fire-and-forget.

  The single intentional exception is DatabaseDesigner's `ModifyPanelCanClose` — a synchronous `[CanClose]` guard that must return a boolean immediately, documented as such in `MJConfirmService`'s docs.

  No public API changes in the consumer packages. Verified with per-package unit test runs (~2,200 tests across touched packages), full-page light+dark state screenshots of 8 distinct surfaces, and live end-to-end executions of the true paths.

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [13716e4]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/graphql-dataprovider@5.45.0
  - @memberjunction/ng-ui-components@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/ng-trees@5.45.0
  - @memberjunction/ng-base-forms@5.45.0
  - @memberjunction/ng-base-types@5.45.0
  - @memberjunction/ng-code-editor@5.45.0
  - @memberjunction/ng-media-player@5.45.0
  - @memberjunction/ng-notifications@5.45.0
  - @memberjunction/ng-query-viewer@5.45.0
  - @memberjunction/ng-react@5.45.0
  - @memberjunction/ng-shared-generic@5.45.0
  - @memberjunction/interactive-component-types@5.45.0
  - @memberjunction/ng-export-service@5.45.0
  - @memberjunction/ng-markdown@5.45.0
  - @memberjunction/ng-pagination@5.45.0

## 5.44.0

### Minor Changes

- aa9102d: feat(media+realtime): generic media player, end-to-end media streaming, and the realtime/LiveKit recording stack

  A new media + recording platform spanning the player, storage, server, and the realtime/voice stack.

  **Generic media player (`@memberjunction/ng-media-player`, new package)** — a framework-agnostic
  `mj-media-player` (transport, click/drag scrubber, playback speed, ±skip, keyboard, fullscreen,
  multi-track video grid, a real decoded audio waveform that doubles as the scrubber and accepts
  precomputed `MediaTrack.Peaks`, a time-synced clickable transcript, loading/buffering state with an
  `aria-live` status, cancelable `Before*` events, and an imperative API) plus an MJStorage-bound
  `mj-storage-media-player` that resolves a `FileID` to an authenticated, range-streamed source. The
  artifact audio/video viewers and previews now embed it.

  **MJStorage streaming (`@memberjunction/storage`)** — `FileStorageBase.GetObjectStream` +
  `SupportsStreaming` + `StreamingNotSupportedError`, implemented for all seven drivers (Box, AWS S3,
  Azure, GCS, Google Drive, SharePoint, Dropbox).

  **Authenticated media delivery (`@memberjunction/server`)** — a `CreateMediaAccessToken` mutation
  (short-lived, permission-gated, returns precomputed waveform peaks) and a `GET /media/:fileId?token=`
  HTTP-Range streaming route — any stored asset is served to the browser by `FileID` with real
  streaming + permissions, no public links.

  **Realtime co-agent recording (`@memberjunction/ng-conversations`, `@memberjunction/ai-realtime-client`,
  `@memberjunction/ai-agents`)** — client-direct sessions record a seekable 16-bit WAV with capture-time
  waveform peaks (a `peaks.json` sidecar); the agent's remote audio is mixed in when its WebRTC track
  lands (`OnRemoteMediaStream`/`AttachRemoteStream`); transcript cue timing anchors to real audio onset
  across tool-call gaps; recorded sessions stream back through the player. Plus reactive fixes
  (`ConversationEngine.EnsureConversationLoaded` in `@memberjunction/core-entities`) so new conversations
  and recordings appear without a refresh.

  **LiveKit meeting recording (`@memberjunction/livekit-room-server`, `@memberjunction/server`,
  `@memberjunction/graphql-dataprovider`, `@memberjunction/ng-mj-livekit-room`)** — egress output is
  registered as an `MJ: Files` row linked to the Meeting-Room `Conversation` (new `RecordingFileID` /
  `EgressID`), with point-at-sink or copy-to-canonical storage, and played back in the Meet UI.

  **Realtime surface-tab overhaul (`@memberjunction/ng-conversations`)** — channel tabs appear only once
  used (Whiteboard excepted), each color/icon-coded; the Activity tab is gated, restyled, and
  right-aligned; agent-run artifacts move out of per-artifact tabs into the Activity tab with a
  resizable, `UserInfoEngine`-persisted split viewer.

  The Media channel can now show MJStorage files (`fileId`) in addition to URLs. The realtime
  recordings dashboard (`@memberjunction/ng-dashboards`) and CodeGen-regenerated entity forms
  (`@memberjunction/ng-core-entity-forms`) reflect the new recording fields.

### Patch Changes

- 0476455: Migrate inline empty-state placeholders to the canonical `<mj-empty-state>` component across Explorer and Generic Angular packages (UI-consistency objective O4), wiring the component into the packages that needed it (and adding `@memberjunction/ng-ui-components` as a dependency where missing). Also fixes reset-filter CTA correctness in three picker dialogs (sub-agent selector, add-action, action gallery) where the handler cleared only a subset of the active filter dimensions, and refines the UI adoption measurement script with a transparent three-tier empty-state count (raw widened → non-placeholder false-positives → wrappers-around-migrated → genuine).
- Updated dependencies [3633fbb]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [f8be8a0]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [1e5e449]
- Updated dependencies [be5ab50]
- Updated dependencies [aa9102d]
- Updated dependencies [2f926df]
- Updated dependencies [0476455]
- Updated dependencies [9f96357]
- Updated dependencies [863a10d]
- Updated dependencies [2f9b863]
  - @memberjunction/graphql-dataprovider@5.44.0
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/ng-ui-components@5.44.0
  - @memberjunction/ng-query-viewer@5.44.0
  - @memberjunction/ng-media-player@5.44.0
  - @memberjunction/ng-base-forms@5.44.0
  - @memberjunction/ng-trees@5.44.0
  - @memberjunction/ng-notifications@5.44.0
  - @memberjunction/ng-react@5.44.0
  - @memberjunction/ng-base-types@5.44.0
  - @memberjunction/ng-code-editor@5.44.0
  - @memberjunction/ng-shared-generic@5.44.0
  - @memberjunction/ng-export-service@5.44.0
  - @memberjunction/ng-markdown@5.44.0
  - @memberjunction/interactive-component-types@5.44.0
  - @memberjunction/ng-pagination@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [a975e3d]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
- Updated dependencies [54183aa]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/ng-base-forms@5.43.0
  - @memberjunction/ng-ui-components@5.43.0
  - @memberjunction/ng-pagination@5.43.0
  - @memberjunction/ng-base-types@5.43.0
  - @memberjunction/ng-code-editor@5.43.0
  - @memberjunction/ng-notifications@5.43.0
  - @memberjunction/ng-query-viewer@5.43.0
  - @memberjunction/ng-react@5.43.0
  - @memberjunction/ng-shared-generic@5.43.0
  - @memberjunction/ng-trees@5.43.0
  - @memberjunction/graphql-dataprovider@5.43.0
  - @memberjunction/interactive-component-types@5.43.0
  - @memberjunction/ng-export-service@5.43.0
  - @memberjunction/ng-markdown@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [313c1c5]
- Updated dependencies [9b9b484]
- Updated dependencies [5fde509]
- Updated dependencies [4ec1732]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/ng-ui-components@5.42.0
  - @memberjunction/core@5.42.0
  - @memberjunction/graphql-dataprovider@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/ng-base-forms@5.42.0
  - @memberjunction/ng-base-types@5.42.0
  - @memberjunction/ng-code-editor@5.42.0
  - @memberjunction/ng-notifications@5.42.0
  - @memberjunction/ng-query-viewer@5.42.0
  - @memberjunction/ng-react@5.42.0
  - @memberjunction/ng-shared-generic@5.42.0
  - @memberjunction/ng-trees@5.42.0
  - @memberjunction/interactive-component-types@5.42.0
  - @memberjunction/ng-export-service@5.42.0
  - @memberjunction/ng-markdown@5.42.0
  - @memberjunction/ng-pagination@5.42.0

## 5.41.0

### Minor Changes

- 4b3fb9d: Add Skip entity-form support: #entity mentions in conversations, interactive-form host wiring, and reusable form-field components

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [2e48d1a]
- Updated dependencies [34d17e2]
- Updated dependencies [cd6c5f0]
- Updated dependencies [133dfa7]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
- Updated dependencies [4b3fb9d]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/graphql-dataprovider@5.41.0
  - @memberjunction/ng-react@5.41.0
  - @memberjunction/ng-notifications@5.41.0
  - @memberjunction/ng-base-forms@5.41.0
  - @memberjunction/ng-base-types@5.41.0
  - @memberjunction/ng-code-editor@5.41.0
  - @memberjunction/ng-query-viewer@5.41.0
  - @memberjunction/ng-shared-generic@5.41.0
  - @memberjunction/ng-trees@5.41.0
  - @memberjunction/interactive-component-types@5.41.0
  - @memberjunction/ng-export-service@5.41.0
  - @memberjunction/ng-markdown@5.41.0
  - @memberjunction/ng-pagination@5.41.0
  - @memberjunction/ng-ui-components@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- 3da89ef: Add configurable CORS origins and opt-in rate limiting to MJ Server, add client-side permission evaluation for component artifacts, and fix CI publish failures in light-command and db-auto-doc bootstrap
  - @memberjunction/ng-base-forms@5.40.2
  - @memberjunction/ng-base-types@5.40.2
  - @memberjunction/ng-code-editor@5.40.2
  - @memberjunction/ng-export-service@5.40.2
  - @memberjunction/ng-markdown@5.40.2
  - @memberjunction/ng-notifications@5.40.2
  - @memberjunction/ng-pagination@5.40.2
  - @memberjunction/ng-query-viewer@5.40.2
  - @memberjunction/ng-react@5.40.2
  - @memberjunction/ng-shared-generic@5.40.2
  - @memberjunction/ng-trees@5.40.2
  - @memberjunction/ng-ui-components@5.40.2
  - @memberjunction/graphql-dataprovider@5.40.2
  - @memberjunction/interactive-component-types@5.40.2
  - @memberjunction/core@5.40.2
  - @memberjunction/core-entities@5.40.2
  - @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ng-base-forms@5.40.1
  - @memberjunction/ng-base-types@5.40.1
  - @memberjunction/ng-code-editor@5.40.1
  - @memberjunction/ng-notifications@5.40.1
  - @memberjunction/ng-query-viewer@5.40.1
  - @memberjunction/ng-react@5.40.1
  - @memberjunction/ng-shared-generic@5.40.1
  - @memberjunction/ng-trees@5.40.1
  - @memberjunction/graphql-dataprovider@5.40.1
  - @memberjunction/interactive-component-types@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/ng-export-service@5.40.1
  - @memberjunction/ng-markdown@5.40.1
  - @memberjunction/ng-pagination@5.40.1
  - @memberjunction/ng-ui-components@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- f2cca15: Fix research-agent reports being dropped from chat, add pluggable inline artifact previews, and correct Prompt Run token display.
- 40e90fa: Show all distinct artifacts on a conversation message instead of only the most recently created one — a message that carries both a report and a standalone generated image now renders a card for each. Multiple versions of the same artifact still collapse to the latest. Also halves the inline image/video preview height (280px → 140px) so thumbnails don't dominate the message.
- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [7bbfd62]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/graphql-dataprovider@5.40.0
  - @memberjunction/ng-base-forms@5.40.0
  - @memberjunction/ng-base-types@5.40.0
  - @memberjunction/ng-code-editor@5.40.0
  - @memberjunction/ng-notifications@5.40.0
  - @memberjunction/ng-query-viewer@5.40.0
  - @memberjunction/ng-react@5.40.0
  - @memberjunction/ng-shared-generic@5.40.0
  - @memberjunction/ng-trees@5.40.0
  - @memberjunction/interactive-component-types@5.40.0
  - @memberjunction/ng-export-service@5.40.0
  - @memberjunction/ng-markdown@5.40.0
  - @memberjunction/ng-pagination@5.40.0
  - @memberjunction/ng-ui-components@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [f60e340]
- Updated dependencies [bd95e83]
- Updated dependencies [3c53858]
- Updated dependencies [4bc6fb4]
- Updated dependencies [3b29882]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [5b4102c]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/graphql-dataprovider@5.39.0
  - @memberjunction/ng-ui-components@5.39.0
  - @memberjunction/ng-base-forms@5.39.0
  - @memberjunction/ng-shared-generic@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/ng-markdown@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ng-base-types@5.39.0
  - @memberjunction/ng-code-editor@5.39.0
  - @memberjunction/ng-notifications@5.39.0
  - @memberjunction/ng-query-viewer@5.39.0
  - @memberjunction/ng-react@5.39.0
  - @memberjunction/ng-trees@5.39.0
  - @memberjunction/interactive-component-types@5.39.0
  - @memberjunction/ng-export-service@5.39.0
  - @memberjunction/ng-pagination@5.39.0

## 5.38.0

### Minor Changes

- 8bd97f3: fix: image display + artifact/attachment unification cleanup
  - Add ImageArtifactViewerPlugin for raster image artifacts
  - Remove persist gate so agent-generated media always persists as artifacts
  - AgentRunner writes media artifacts directly (bypass deprecated ConversationDetailAttachment)
  - Remove deprecated SuggestedResponses feature (superseded by ResponseForm)
  - Backfill migration for legacy ConversationDetailAttachment rows
  - Remove all back-compat reads from deprecated ConversationDetailAttachment

- 918d663: Interactive Forms — runtime authoring loop is now closed end-to-end.

  **Versioning lifecycle (server-side actions).** The single `Create Interactive Form` action has been split into a versioning-aware family:
  - `Create Interactive Form` — net-new only; returns `ALREADY_EXISTS` if the user already has an Active override for the entity.
  - `Modify Interactive Form` — branches on the pointed-to Component's status: Pending → modify the row in place (no version proliferation during chat refinement); Active → insert a new Component v(N+1) with `Status='Pending'` and a sibling Pending Override, leaving the live form untouched.
  - `Activate Interactive Form Version` — flips a Pending override to Active and atomically demotes the prior Active to Inactive.
  - `Revert Interactive Form` — re-points an Active override at an older Component in the same Name lineage. Pure UPDATE; old rows preserved.
  - `Get Active Form For Entity` — read-only; returns the resolved override + the full applicable-variants list.
  - `Get Default Form Scaffold For Entity` — new read-only action that produces a working `ComponentSpec` mirroring the CodeGen Angular default layout. Replaces "write JSX from scratch" as the agent's baseline.

  **Form-aware artifact viewer.** When a component artifact's spec declares `componentRole: 'form'`, the viewer auto-loads a Top-1 record from the declared entity, mounts via `<mj-interactive-form>` (with `componentSpec` + `record` now `@Input()`s), and exposes a search-as-you-type record picker plus an **Apply to my form** action. Falls back to a synthetic `NewRecord()` when the entity has no rows yet.

  **Variant switcher.** `FormResolverService` now returns the full applicable-variants list alongside the resolved override. `<mj-record-form-container>` renders a compact "Form: \<name\> ▾" picker between the toolbar and the form body when more than one variant applies; selection is persisted per-user per-entity in localStorage.

  **Cockpit reshape.** Form Builder dashboard is no longer canvas-first: 4-pane layout with a forms list + versions rail on the left, a Preview/Code/Layout tabbed center, and a Form Builder AI pane on the right. Both side rails collapse to a strip with state persisted in localStorage.

  **Shared fixture.** `buildFixtureFormHostProps` promoted from Component Studio to `@memberjunction/interactive-component-types/forms` so the artifact viewer and Studio share one implementation.

  **Migration.** `EntityFormOverride.Notes` column (NVARCHAR(MAX), nullable) for human commentary on overrides. Validator audited against the CHECK constraint — no patch required.

  **Agent prompt.** `form-builder.template.md` rewritten around the new action toolbox; teaches the agent to call `Get Active Form For Entity` first and branch between Create / Modify (new-version) / Modify (in-place). Sage's prompt gets a one-line routing rule to delegate form requests to Form Builder.

### Patch Changes

- ebb0e3d: Eliminate provider.Refresh() from query save/delete paths, introduce MJQueryEntityExtended with child-relationship getters and business logic, migrate all QueryInfo consumers outside MJCore to use QueryEngine and entity types, remove dead QueryCacheManager, and replace 12 redundant RunView calls with QueryEngine cache reads. Fixes major performance bottleneck on large-entity deployments where every query save reloaded the entire metadata graph.
- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [6a571d3]
- Updated dependencies [275afda]
- Updated dependencies [d285996]
- Updated dependencies [6a3ac36]
- Updated dependencies [918d663]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [b26d0ee]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/ng-base-forms@5.38.0
  - @memberjunction/ng-react@5.38.0
  - @memberjunction/interactive-component-types@5.38.0
  - @memberjunction/graphql-dataprovider@5.38.0
  - @memberjunction/ng-code-editor@5.38.0
  - @memberjunction/ng-query-viewer@5.38.0
  - @memberjunction/ng-base-types@5.38.0
  - @memberjunction/ng-notifications@5.38.0
  - @memberjunction/ng-shared-generic@5.38.0
  - @memberjunction/ng-trees@5.38.0
  - @memberjunction/ng-export-service@5.38.0
  - @memberjunction/ng-markdown@5.38.0
  - @memberjunction/ng-pagination@5.38.0
  - @memberjunction/ng-ui-components@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [dadbde9]
- Updated dependencies [4f15f31]
  - @memberjunction/graphql-dataprovider@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/ng-notifications@5.37.0
  - @memberjunction/ng-react@5.37.0
  - @memberjunction/ng-base-types@5.37.0
  - @memberjunction/ng-code-editor@5.37.0
  - @memberjunction/ng-query-viewer@5.37.0
  - @memberjunction/ng-shared-generic@5.37.0
  - @memberjunction/ng-trees@5.37.0
  - @memberjunction/interactive-component-types@5.37.0
  - @memberjunction/ng-export-service@5.37.0
  - @memberjunction/ng-markdown@5.37.0
  - @memberjunction/ng-pagination@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [f29b7c0]
- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/graphql-dataprovider@5.36.0
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ng-notifications@5.36.0
  - @memberjunction/ng-react@5.36.0
  - @memberjunction/ng-base-types@5.36.0
  - @memberjunction/ng-code-editor@5.36.0
  - @memberjunction/ng-query-viewer@5.36.0
  - @memberjunction/ng-shared-generic@5.36.0
  - @memberjunction/ng-trees@5.36.0
  - @memberjunction/interactive-component-types@5.36.0
  - @memberjunction/ng-export-service@5.36.0
  - @memberjunction/ng-markdown@5.36.0
  - @memberjunction/ng-pagination@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [77e4782]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/graphql-dataprovider@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/ng-base-types@5.35.0
  - @memberjunction/ng-code-editor@5.35.0
  - @memberjunction/ng-notifications@5.35.0
  - @memberjunction/ng-query-viewer@5.35.0
  - @memberjunction/ng-react@5.35.0
  - @memberjunction/ng-shared-generic@5.35.0
  - @memberjunction/ng-trees@5.35.0
  - @memberjunction/interactive-component-types@5.35.0
  - @memberjunction/ng-export-service@5.35.0
  - @memberjunction/ng-markdown@5.35.0
  - @memberjunction/ng-pagination@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
- Updated dependencies [8695f65]
  - @memberjunction/core@5.34.1
  - @memberjunction/graphql-dataprovider@5.34.1
  - @memberjunction/ng-base-types@5.34.1
  - @memberjunction/ng-code-editor@5.34.1
  - @memberjunction/ng-notifications@5.34.1
  - @memberjunction/ng-query-viewer@5.34.1
  - @memberjunction/ng-react@5.34.1
  - @memberjunction/ng-shared-generic@5.34.1
  - @memberjunction/ng-trees@5.34.1
  - @memberjunction/interactive-component-types@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/ng-export-service@5.34.1
  - @memberjunction/ng-markdown@5.34.1
  - @memberjunction/ng-pagination@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- b03bfb4: Replace hardcoded colors with semantic design tokens across Angular components and shared styles, restoring correct dark-mode behavior and enabling white-labeling. Also maps the System Diagnostics PerfMon chrome (background, borders, text, controls) to MJ semantic tokens so the panel adapts to the active theme; series colors stay categorical.
- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- 11ae7e6: no migration
- ad61267: no migration
- Updated dependencies [b03bfb4]
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/ng-markdown@5.34.0
  - @memberjunction/ng-pagination@5.34.0
  - @memberjunction/ng-base-types@5.34.0
  - @memberjunction/ng-code-editor@5.34.0
  - @memberjunction/ng-export-service@5.34.0
  - @memberjunction/ng-notifications@5.34.0
  - @memberjunction/ng-query-viewer@5.34.0
  - @memberjunction/ng-react@5.34.0
  - @memberjunction/ng-shared-generic@5.34.0
  - @memberjunction/ng-trees@5.34.0
  - @memberjunction/interactive-component-types@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/graphql-dataprovider@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [97ed790]
- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
- Updated dependencies [3e84676]
  - @memberjunction/graphql-dataprovider@5.33.0
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/ng-react@5.33.0
  - @memberjunction/interactive-component-types@5.33.0
  - @memberjunction/ng-notifications@5.33.0
  - @memberjunction/ng-base-types@5.33.0
  - @memberjunction/ng-code-editor@5.33.0
  - @memberjunction/ng-query-viewer@5.33.0
  - @memberjunction/ng-shared-generic@5.33.0
  - @memberjunction/ng-trees@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/ng-export-service@5.33.0
  - @memberjunction/ng-markdown@5.33.0
  - @memberjunction/ng-pagination@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ng-base-types@5.32.0
  - @memberjunction/ng-code-editor@5.32.0
  - @memberjunction/ng-notifications@5.32.0
  - @memberjunction/ng-query-viewer@5.32.0
  - @memberjunction/ng-react@5.32.0
  - @memberjunction/ng-shared-generic@5.32.0
  - @memberjunction/ng-trees@5.32.0
  - @memberjunction/graphql-dataprovider@5.32.0
  - @memberjunction/interactive-component-types@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/ng-export-service@5.32.0
  - @memberjunction/ng-markdown@5.32.0
  - @memberjunction/ng-pagination@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- c8b6f8a: Component Studio: React runtime now keys cached components by content fingerprint so artifact versions sharing `(name, namespace, version)` but differing in code coexist as separate cache entries — fixes the conversation panel's version dropdown showing stale compiled code when toggling between Skip-authored registry-reference stubs and Studio-authored inline-code exports of the same component. Adds change-detection fixes to the artifact-load and artifact-selection dialogs, wires the React bridge's `(initialized)` event into `UpdateWithResolvedSpec` so registry-resolved code populates the code editor on first load, and unwraps Skip's `componentOptions` envelope when reading from the artifact `Content` field.
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [c8b6f8a]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
- Updated dependencies [0e3365f]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/graphql-dataprovider@5.31.0
  - @memberjunction/ng-base-types@5.31.0
  - @memberjunction/ng-code-editor@5.31.0
  - @memberjunction/ng-export-service@5.31.0
  - @memberjunction/ng-markdown@5.31.0
  - @memberjunction/ng-notifications@5.31.0
  - @memberjunction/ng-pagination@5.31.0
  - @memberjunction/ng-query-viewer@5.31.0
  - @memberjunction/ng-react@5.31.0
  - @memberjunction/ng-shared-generic@5.31.0
  - @memberjunction/ng-trees@5.31.0
  - @memberjunction/interactive-component-types@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ng-base-types@5.30.1
- @memberjunction/ng-code-editor@5.30.1
- @memberjunction/ng-export-service@5.30.1
- @memberjunction/ng-markdown@5.30.1
- @memberjunction/ng-notifications@5.30.1
- @memberjunction/ng-pagination@5.30.1
- @memberjunction/ng-query-viewer@5.30.1
- @memberjunction/ng-react@5.30.1
- @memberjunction/ng-shared-generic@5.30.1
- @memberjunction/ng-trees@5.30.1
- @memberjunction/graphql-dataprovider@5.30.1
- @memberjunction/interactive-component-types@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- a00af98: no migration/metadata
- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [9154ac7]
- Updated dependencies [00b5c26]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/graphql-dataprovider@5.30.0
  - @memberjunction/ng-react@5.30.0
  - @memberjunction/interactive-component-types@5.30.0
  - @memberjunction/ng-base-types@5.30.0
  - @memberjunction/ng-code-editor@5.30.0
  - @memberjunction/ng-notifications@5.30.0
  - @memberjunction/ng-query-viewer@5.30.0
  - @memberjunction/ng-shared-generic@5.30.0
  - @memberjunction/ng-trees@5.30.0
  - @memberjunction/ng-export-service@5.30.0
  - @memberjunction/ng-markdown@5.30.0
  - @memberjunction/ng-pagination@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/ng-trees@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ng-base-types@5.29.0
  - @memberjunction/ng-code-editor@5.29.0
  - @memberjunction/ng-notifications@5.29.0
  - @memberjunction/ng-query-viewer@5.29.0
  - @memberjunction/ng-react@5.29.0
  - @memberjunction/ng-shared-generic@5.29.0
  - @memberjunction/graphql-dataprovider@5.29.0
  - @memberjunction/interactive-component-types@5.29.0
  - @memberjunction/ng-export-service@5.29.0
  - @memberjunction/ng-markdown@5.29.0
  - @memberjunction/ng-pagination@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ng-base-types@5.28.0
  - @memberjunction/ng-code-editor@5.28.0
  - @memberjunction/ng-notifications@5.28.0
  - @memberjunction/ng-query-viewer@5.28.0
  - @memberjunction/ng-react@5.28.0
  - @memberjunction/ng-shared-generic@5.28.0
  - @memberjunction/ng-trees@5.28.0
  - @memberjunction/graphql-dataprovider@5.28.0
  - @memberjunction/interactive-component-types@5.28.0
  - @memberjunction/ng-export-service@5.28.0
  - @memberjunction/ng-markdown@5.28.0
  - @memberjunction/ng-pagination@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
- Updated dependencies [6c39ff0]
  - @memberjunction/global@5.27.1
  - @memberjunction/graphql-dataprovider@5.27.1
  - @memberjunction/ng-base-types@5.27.1
  - @memberjunction/ng-code-editor@5.27.1
  - @memberjunction/ng-notifications@5.27.1
  - @memberjunction/ng-query-viewer@5.27.1
  - @memberjunction/ng-react@5.27.1
  - @memberjunction/ng-shared-generic@5.27.1
  - @memberjunction/ng-trees@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/interactive-component-types@5.27.1
  - @memberjunction/ng-export-service@5.27.1
  - @memberjunction/ng-markdown@5.27.1
  - @memberjunction/ng-pagination@5.27.1

## 5.27.0

### Patch Changes

- Updated dependencies [35cf7d4]
  - @memberjunction/ng-trees@5.27.0
  - @memberjunction/ng-base-types@5.27.0
  - @memberjunction/ng-code-editor@5.27.0
  - @memberjunction/ng-export-service@5.27.0
  - @memberjunction/ng-markdown@5.27.0
  - @memberjunction/ng-notifications@5.27.0
  - @memberjunction/ng-pagination@5.27.0
  - @memberjunction/ng-query-viewer@5.27.0
  - @memberjunction/ng-react@5.27.0
  - @memberjunction/ng-shared-generic@5.27.0
  - @memberjunction/graphql-dataprovider@5.27.0
  - @memberjunction/interactive-component-types@5.27.0
  - @memberjunction/core@5.27.0
  - @memberjunction/core-entities@5.27.0
  - @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/ng-code-editor@5.26.0
  - @memberjunction/ng-shared-generic@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ng-base-types@5.26.0
  - @memberjunction/ng-notifications@5.26.0
  - @memberjunction/ng-query-viewer@5.26.0
  - @memberjunction/ng-react@5.26.0
  - @memberjunction/ng-trees@5.26.0
  - @memberjunction/graphql-dataprovider@5.26.0
  - @memberjunction/interactive-component-types@5.26.0
  - @memberjunction/ng-export-service@5.26.0
  - @memberjunction/ng-markdown@5.26.0
  - @memberjunction/ng-pagination@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Minor Changes

- 008a62d: Add file based artifact I/O

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
- Updated dependencies [c5426c5]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/graphql-dataprovider@5.25.0
  - @memberjunction/interactive-component-types@5.25.0
  - @memberjunction/ng-query-viewer@5.25.0
  - @memberjunction/ng-trees@5.25.0
  - @memberjunction/ng-base-types@5.25.0
  - @memberjunction/ng-code-editor@5.25.0
  - @memberjunction/ng-notifications@5.25.0
  - @memberjunction/ng-react@5.25.0
  - @memberjunction/ng-shared-generic@5.25.0
  - @memberjunction/ng-export-service@5.25.0
  - @memberjunction/ng-markdown@5.25.0
  - @memberjunction/ng-pagination@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [f9792d1]
- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/ng-react@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/interactive-component-types@5.24.0
  - @memberjunction/ng-notifications@5.24.0
  - @memberjunction/ng-base-types@5.24.0
  - @memberjunction/ng-code-editor@5.24.0
  - @memberjunction/ng-query-viewer@5.24.0
  - @memberjunction/ng-shared-generic@5.24.0
  - @memberjunction/ng-trees@5.24.0
  - @memberjunction/ng-export-service@5.24.0
  - @memberjunction/ng-markdown@5.24.0
  - @memberjunction/ng-pagination@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- 247df16: Fix server-side RunView cache write asymmetry that caused repeated DB queries during metadata sync, add deterministic Nunjucks template parameter extraction via AST, support comma-delimited multi-value fields in validation, and redesign QueryPagingEngine to append paging directly instead of wrapping in CTEs (fixing ORDER BY on non-projected columns and apostrophe-in-comments bugs).
- c17be20: no migration/metadata
- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
- Updated dependencies [c17be20]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ng-react@5.23.0
  - @memberjunction/ng-base-types@5.23.0
  - @memberjunction/ng-code-editor@5.23.0
  - @memberjunction/ng-notifications@5.23.0
  - @memberjunction/ng-query-viewer@5.23.0
  - @memberjunction/ng-shared-generic@5.23.0
  - @memberjunction/ng-trees@5.23.0
  - @memberjunction/interactive-component-types@5.23.0
  - @memberjunction/ng-export-service@5.23.0
  - @memberjunction/ng-markdown@5.23.0
  - @memberjunction/ng-pagination@5.23.0

## 5.22.0

### Patch Changes

- f2a6bec: Universal lazy loading via ClassFactory async API. Fixes HomeApplication being tree-shaken by moving lazy loading from consumer-specific retry patterns into ClassFactory itself with RegisterLazyLoader, CreateInstanceAsync, and GetRegistrationAsync. Lazy config now uses compound keys (BaseClassName::Key) to support any base class. Adds coverage audit to codegen to detect gaps.
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/ng-base-types@5.22.0
  - @memberjunction/ng-code-editor@5.22.0
  - @memberjunction/ng-notifications@5.22.0
  - @memberjunction/ng-query-viewer@5.22.0
  - @memberjunction/ng-react@5.22.0
  - @memberjunction/ng-shared-generic@5.22.0
  - @memberjunction/ng-trees@5.22.0
  - @memberjunction/interactive-component-types@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/ng-export-service@5.22.0
  - @memberjunction/ng-markdown@5.22.0
  - @memberjunction/ng-pagination@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/ng-react@5.21.0
  - @memberjunction/interactive-component-types@5.21.0
  - @memberjunction/ng-base-types@5.21.0
  - @memberjunction/ng-code-editor@5.21.0
  - @memberjunction/ng-notifications@5.21.0
  - @memberjunction/ng-query-viewer@5.21.0
  - @memberjunction/ng-shared-generic@5.21.0
  - @memberjunction/ng-trees@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/ng-export-service@5.21.0
  - @memberjunction/ng-markdown@5.21.0
  - @memberjunction/ng-pagination@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/ng-base-types@5.20.0
  - @memberjunction/ng-code-editor@5.20.0
  - @memberjunction/ng-notifications@5.20.0
  - @memberjunction/ng-query-viewer@5.20.0
  - @memberjunction/ng-react@5.20.0
  - @memberjunction/ng-shared-generic@5.20.0
  - @memberjunction/ng-trees@5.20.0
  - @memberjunction/interactive-component-types@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/ng-export-service@5.20.0
  - @memberjunction/ng-markdown@5.20.0
  - @memberjunction/ng-pagination@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ng-base-types@5.19.0
- @memberjunction/ng-code-editor@5.19.0
- @memberjunction/ng-export-service@5.19.0
- @memberjunction/ng-markdown@5.19.0
- @memberjunction/ng-notifications@5.19.0
- @memberjunction/ng-pagination@5.19.0
- @memberjunction/ng-query-viewer@5.19.0
- @memberjunction/ng-react@5.19.0
- @memberjunction/ng-shared-generic@5.19.0
- @memberjunction/ng-trees@5.19.0
- @memberjunction/interactive-component-types@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [de310bc]
  - @memberjunction/ng-markdown@5.18.0
  - @memberjunction/ng-query-viewer@5.18.0
  - @memberjunction/ng-notifications@5.18.0
  - @memberjunction/ng-react@5.18.0
  - @memberjunction/ng-base-types@5.18.0
  - @memberjunction/ng-code-editor@5.18.0
  - @memberjunction/ng-export-service@5.18.0
  - @memberjunction/ng-pagination@5.18.0
  - @memberjunction/ng-shared-generic@5.18.0
  - @memberjunction/ng-trees@5.18.0
  - @memberjunction/interactive-component-types@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0
  - @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/ng-notifications@5.17.0
  - @memberjunction/ng-react@5.17.0
  - @memberjunction/ng-base-types@5.17.0
  - @memberjunction/ng-code-editor@5.17.0
  - @memberjunction/ng-query-viewer@5.17.0
  - @memberjunction/ng-shared-generic@5.17.0
  - @memberjunction/ng-trees@5.17.0
  - @memberjunction/interactive-component-types@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/ng-export-service@5.17.0
  - @memberjunction/ng-markdown@5.17.0
  - @memberjunction/ng-pagination@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/ng-base-types@5.16.0
  - @memberjunction/ng-code-editor@5.16.0
  - @memberjunction/ng-notifications@5.16.0
  - @memberjunction/ng-query-viewer@5.16.0
  - @memberjunction/ng-react@5.16.0
  - @memberjunction/ng-shared-generic@5.16.0
  - @memberjunction/ng-trees@5.16.0
  - @memberjunction/interactive-component-types@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/ng-export-service@5.16.0
  - @memberjunction/ng-markdown@5.16.0
  - @memberjunction/ng-pagination@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/ng-base-types@5.15.0
  - @memberjunction/ng-code-editor@5.15.0
  - @memberjunction/ng-notifications@5.15.0
  - @memberjunction/ng-query-viewer@5.15.0
  - @memberjunction/ng-react@5.15.0
  - @memberjunction/ng-shared-generic@5.15.0
  - @memberjunction/ng-trees@5.15.0
  - @memberjunction/interactive-component-types@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/ng-export-service@5.15.0
  - @memberjunction/ng-markdown@5.15.0
  - @memberjunction/ng-pagination@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/ng-base-types@5.14.0
  - @memberjunction/ng-code-editor@5.14.0
  - @memberjunction/ng-notifications@5.14.0
  - @memberjunction/ng-query-viewer@5.14.0
  - @memberjunction/ng-react@5.14.0
  - @memberjunction/ng-shared-generic@5.14.0
  - @memberjunction/ng-trees@5.14.0
  - @memberjunction/interactive-component-types@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/ng-export-service@5.14.0
  - @memberjunction/ng-markdown@5.14.0
  - @memberjunction/ng-pagination@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/ng-base-types@5.13.0
  - @memberjunction/ng-code-editor@5.13.0
  - @memberjunction/ng-notifications@5.13.0
  - @memberjunction/ng-query-viewer@5.13.0
  - @memberjunction/ng-react@5.13.0
  - @memberjunction/ng-shared-generic@5.13.0
  - @memberjunction/ng-trees@5.13.0
  - @memberjunction/interactive-component-types@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/ng-export-service@5.13.0
  - @memberjunction/ng-markdown@5.13.0
  - @memberjunction/ng-pagination@5.13.0

## 5.12.0

### Minor Changes

- 05f19ff: Add composable query system with semantic catalog search, CTE composition engine, server-side paging, query caching with TTL/dependency invalidation, and agent directive surfacing. Includes QueryCacheManager wrapper over LocalCacheManager, QueryPagingEngine for SQL-level OFFSET/FETCH paging, QueryCompositionEngine for platform-aware CTE generation, and SearchQueryCatalog action for vector-based query discovery. Renames PaginationComponent to DataPagerComponent and extracts into shared module.

### Patch Changes

- a57b8d5: Migrate all hardcoded CSS colors to design tokens for dark mode and white-label support. Introduces `--mj-*` semantic CSS custom properties in `_tokens.scss` with full `[data-theme="dark"]` overrides. Migrates 1,544 of 1,659 hardcoded hex values (93%) across 72+ CSS files to semantic tokens. Adds logo token system (`--mj-logo-mark`, `--mj-logo-color`) for themeable branding. Fixes dark mode theming for CodeMirror, AG Grid v35, and Kendo popups. No API or behavioral changes — CSS only.
- e87d153: design tokens phase 1
- Updated dependencies [05f19ff]
- Updated dependencies [a57b8d5]
- Updated dependencies [e87d153]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/ng-query-viewer@5.12.0
  - @memberjunction/ng-shared-generic@5.12.0
  - @memberjunction/ng-pagination@5.12.0
  - @memberjunction/ng-code-editor@5.12.0
  - @memberjunction/ng-export-service@5.12.0
  - @memberjunction/ng-markdown@5.12.0
  - @memberjunction/ng-trees@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/ng-base-types@5.12.0
  - @memberjunction/ng-notifications@5.12.0
  - @memberjunction/ng-react@5.12.0
  - @memberjunction/interactive-component-types@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
- Updated dependencies [457afcf]
  - @memberjunction/ng-query-viewer@5.11.0
  - @memberjunction/core@5.11.0
  - @memberjunction/ng-notifications@5.11.0
  - @memberjunction/ng-react@5.11.0
  - @memberjunction/ng-base-types@5.11.0
  - @memberjunction/ng-code-editor@5.11.0
  - @memberjunction/ng-shared-generic@5.11.0
  - @memberjunction/ng-trees@5.11.0
  - @memberjunction/interactive-component-types@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/ng-export-service@5.11.0
  - @memberjunction/ng-markdown@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ng-base-types@5.10.1
- @memberjunction/ng-code-editor@5.10.1
- @memberjunction/ng-export-service@5.10.1
- @memberjunction/ng-markdown@5.10.1
- @memberjunction/ng-notifications@5.10.1
- @memberjunction/ng-query-viewer@5.10.1
- @memberjunction/ng-react@5.10.1
- @memberjunction/ng-shared-generic@5.10.1
- @memberjunction/ng-trees@5.10.1
- @memberjunction/interactive-component-types@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [3df5e4b]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/ng-query-viewer@5.10.0
  - @memberjunction/ng-base-types@5.10.0
  - @memberjunction/ng-code-editor@5.10.0
  - @memberjunction/ng-notifications@5.10.0
  - @memberjunction/ng-react@5.10.0
  - @memberjunction/ng-shared-generic@5.10.0
  - @memberjunction/ng-trees@5.10.0
  - @memberjunction/interactive-component-types@5.10.0
  - @memberjunction/ng-export-service@5.10.0
  - @memberjunction/ng-markdown@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/ng-base-types@5.9.0
  - @memberjunction/ng-code-editor@5.9.0
  - @memberjunction/ng-notifications@5.9.0
  - @memberjunction/ng-query-viewer@5.9.0
  - @memberjunction/ng-react@5.9.0
  - @memberjunction/ng-shared-generic@5.9.0
  - @memberjunction/ng-trees@5.9.0
  - @memberjunction/interactive-component-types@5.9.0
  - @memberjunction/ng-export-service@5.9.0
  - @memberjunction/ng-markdown@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/ng-notifications@5.8.0
  - @memberjunction/ng-react@5.8.0
  - @memberjunction/ng-base-types@5.8.0
  - @memberjunction/ng-code-editor@5.8.0
  - @memberjunction/ng-query-viewer@5.8.0
  - @memberjunction/ng-shared-generic@5.8.0
  - @memberjunction/ng-trees@5.8.0
  - @memberjunction/interactive-component-types@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/ng-export-service@5.8.0
  - @memberjunction/ng-markdown@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- f52e156: Fix agent infinite retry loop and OOM crash when API credentials are missing by adding NoCredentials error classification, max consecutive failure safety net, and descriptive error propagation to the UI. Fix artifact collection removal UI update, artifact pane width reset on conversation switch, and component spec caching to survive render errors.
- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/ng-base-types@5.7.0
  - @memberjunction/ng-code-editor@5.7.0
  - @memberjunction/ng-notifications@5.7.0
  - @memberjunction/ng-query-viewer@5.7.0
  - @memberjunction/ng-react@5.7.0
  - @memberjunction/ng-shared-generic@5.7.0
  - @memberjunction/ng-trees@5.7.0
  - @memberjunction/interactive-component-types@5.7.0
  - @memberjunction/ng-export-service@5.7.0
  - @memberjunction/ng-markdown@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/ng-base-types@5.6.0
  - @memberjunction/ng-code-editor@5.6.0
  - @memberjunction/ng-notifications@5.6.0
  - @memberjunction/ng-query-viewer@5.6.0
  - @memberjunction/ng-react@5.6.0
  - @memberjunction/ng-shared-generic@5.6.0
  - @memberjunction/ng-trees@5.6.0
  - @memberjunction/interactive-component-types@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/ng-export-service@5.6.0
  - @memberjunction/ng-markdown@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/ng-react@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/ng-base-types@5.5.0
  - @memberjunction/ng-code-editor@5.5.0
  - @memberjunction/ng-export-service@5.5.0
  - @memberjunction/ng-markdown@5.5.0
  - @memberjunction/ng-notifications@5.5.0
  - @memberjunction/ng-query-viewer@5.5.0
  - @memberjunction/ng-shared-generic@5.5.0
  - @memberjunction/ng-trees@5.5.0
  - @memberjunction/interactive-component-types@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ng-base-types@5.4.1
- @memberjunction/ng-code-editor@5.4.1
- @memberjunction/ng-export-service@5.4.1
- @memberjunction/ng-markdown@5.4.1
- @memberjunction/ng-notifications@5.4.1
- @memberjunction/ng-query-viewer@5.4.1
- @memberjunction/ng-react@5.4.1
- @memberjunction/ng-shared-generic@5.4.1
- @memberjunction/ng-trees@5.4.1
- @memberjunction/interactive-component-types@5.4.1
- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1
- @memberjunction/global@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [c9a760c]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/ng-notifications@5.4.0
  - @memberjunction/ng-react@5.4.0
  - @memberjunction/ng-base-types@5.4.0
  - @memberjunction/ng-code-editor@5.4.0
  - @memberjunction/ng-query-viewer@5.4.0
  - @memberjunction/ng-shared-generic@5.4.0
  - @memberjunction/ng-trees@5.4.0
  - @memberjunction/ng-export-service@5.4.0
  - @memberjunction/ng-markdown@5.4.0
  - @memberjunction/interactive-component-types@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ng-base-types@5.3.1
- @memberjunction/ng-code-editor@5.3.1
- @memberjunction/ng-export-service@5.3.1
- @memberjunction/ng-markdown@5.3.1
- @memberjunction/ng-notifications@5.3.1
- @memberjunction/ng-query-viewer@5.3.1
- @memberjunction/ng-react@5.3.1
- @memberjunction/ng-shared-generic@5.3.1
- @memberjunction/ng-trees@5.3.1
- @memberjunction/interactive-component-types@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- 7af1846: no migration
- Updated dependencies [1692c53]
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/ng-notifications@5.3.0
  - @memberjunction/ng-react@5.3.0
  - @memberjunction/ng-base-types@5.3.0
  - @memberjunction/ng-code-editor@5.3.0
  - @memberjunction/ng-query-viewer@5.3.0
  - @memberjunction/ng-shared-generic@5.3.0
  - @memberjunction/ng-trees@5.3.0
  - @memberjunction/ng-export-service@5.3.0
  - @memberjunction/ng-markdown@5.3.0
  - @memberjunction/interactive-component-types@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- 4618227: Fix Angular 21/zone.js 0.15 change detection regressions, improve conversation caching performance, and resolve blank tabs in artifacts and entity viewer
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
- Updated dependencies [4618227]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/ng-query-viewer@5.2.0
  - @memberjunction/ng-react@5.2.0
  - @memberjunction/ng-base-types@5.2.0
  - @memberjunction/ng-code-editor@5.2.0
  - @memberjunction/ng-notifications@5.2.0
  - @memberjunction/ng-shared-generic@5.2.0
  - @memberjunction/ng-trees@5.2.0
  - @memberjunction/interactive-component-types@5.2.0
  - @memberjunction/ng-export-service@5.2.0
  - @memberjunction/ng-markdown@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ng-base-types@5.1.0
  - @memberjunction/ng-code-editor@5.1.0
  - @memberjunction/ng-notifications@5.1.0
  - @memberjunction/ng-react@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/interactive-component-types@5.1.0
  - @memberjunction/ng-shared-generic@5.1.0
  - @memberjunction/ng-markdown@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [737b56b]
- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/interactive-component-types@5.0.0
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ng-base-types@5.0.0
  - @memberjunction/ng-code-editor@5.0.0
  - @memberjunction/ng-markdown@5.0.0
  - @memberjunction/ng-notifications@5.0.0
  - @memberjunction/ng-react@5.0.0
  - @memberjunction/ng-shared-generic@5.0.0
  - @memberjunction/global@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/ng-base-types@4.4.0
  - @memberjunction/ng-code-editor@4.4.0
  - @memberjunction/ng-notifications@4.4.0
  - @memberjunction/ng-react@4.4.0
  - @memberjunction/ng-shared-generic@4.4.0
  - @memberjunction/interactive-component-types@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/ng-markdown@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ng-base-types@4.3.1
- @memberjunction/ng-code-editor@4.3.1
- @memberjunction/ng-markdown@4.3.1
- @memberjunction/ng-notifications@4.3.1
- @memberjunction/ng-react@4.3.1
- @memberjunction/ng-shared-generic@4.3.1
- @memberjunction/interactive-component-types@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/global@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ng-notifications@4.3.0
  - @memberjunction/ng-react@4.3.0
  - @memberjunction/ng-base-types@4.3.0
  - @memberjunction/ng-code-editor@4.3.0
  - @memberjunction/ng-shared-generic@4.3.0
  - @memberjunction/interactive-component-types@4.3.0
  - @memberjunction/ng-markdown@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ng-base-types@4.2.0
- @memberjunction/ng-code-editor@4.2.0
- @memberjunction/ng-markdown@4.2.0
- @memberjunction/ng-notifications@4.2.0
- @memberjunction/ng-react@4.2.0
- @memberjunction/ng-shared-generic@4.2.0
- @memberjunction/interactive-component-types@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/global@4.2.0

## 4.1.0

### Patch Changes

- Updated dependencies [77839a9]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/ng-base-types@4.1.0
  - @memberjunction/ng-code-editor@4.1.0
  - @memberjunction/ng-notifications@4.1.0
  - @memberjunction/ng-react@4.1.0
  - @memberjunction/ng-shared-generic@4.1.0
  - @memberjunction/interactive-component-types@4.1.0
  - @memberjunction/ng-markdown@4.1.0
  - @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/ng-base-types@4.0.0
  - @memberjunction/ng-code-editor@4.0.0
  - @memberjunction/ng-markdown@4.0.0
  - @memberjunction/ng-notifications@4.0.0
  - @memberjunction/ng-react@4.0.0
  - @memberjunction/ng-shared-generic@4.0.0
  - @memberjunction/interactive-component-types@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/global@4.0.0

## 3.4.0

### Patch Changes

- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/ng-base-types@3.4.0
  - @memberjunction/ng-code-editor@3.4.0
  - @memberjunction/ng-notifications@3.4.0
  - @memberjunction/ng-react@3.4.0
  - @memberjunction/ng-shared-generic@3.4.0
  - @memberjunction/interactive-component-types@3.4.0
  - @memberjunction/ng-markdown@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- Updated dependencies [ca551dd]
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/ng-base-types@3.3.0
  - @memberjunction/ng-code-editor@3.3.0
  - @memberjunction/ng-notifications@3.3.0
  - @memberjunction/ng-react@3.3.0
  - @memberjunction/ng-shared-generic@3.3.0
  - @memberjunction/ng-markdown@3.3.0
  - @memberjunction/interactive-component-types@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- cbd2714: Improve error handling and stability across Skip integration, component artifacts, and metadata sync
- Updated dependencies [039983c]
- Updated dependencies [6806a6c]
- Updated dependencies [cbd2714]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/interactive-component-types@3.2.0
  - @memberjunction/ng-base-types@3.2.0
  - @memberjunction/ng-code-editor@3.2.0
  - @memberjunction/ng-notifications@3.2.0
  - @memberjunction/ng-react@3.2.0
  - @memberjunction/ng-shared-generic@3.2.0
  - @memberjunction/ng-markdown@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/ng-notifications@3.1.1
- @memberjunction/ng-react@3.1.1
- @memberjunction/ng-base-types@3.1.1
- @memberjunction/ng-code-editor@3.1.1
- @memberjunction/ng-markdown@3.1.1
- @memberjunction/ng-shared-generic@3.1.1
- @memberjunction/interactive-component-types@3.1.1
- @memberjunction/core@3.1.1
- @memberjunction/core-entities@3.1.1
- @memberjunction/global@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ng-base-types@3.0.0
- @memberjunction/ng-code-editor@3.0.0
- @memberjunction/ng-markdown@3.0.0
- @memberjunction/ng-notifications@3.0.0
- @memberjunction/ng-react@3.0.0
- @memberjunction/ng-shared-generic@3.0.0
- @memberjunction/interactive-component-types@3.0.0
- @memberjunction/core@3.0.0
- @memberjunction/core-entities@3.0.0
- @memberjunction/global@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/ng-base-types@2.133.0
  - @memberjunction/ng-code-editor@2.133.0
  - @memberjunction/ng-notifications@2.133.0
  - @memberjunction/ng-react@2.133.0
  - @memberjunction/ng-shared-generic@2.133.0
  - @memberjunction/interactive-component-types@2.133.0
  - @memberjunction/core-entities@2.133.0
  - @memberjunction/ng-markdown@2.133.0
  - @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/ng-base-types@2.132.0
  - @memberjunction/ng-code-editor@2.132.0
  - @memberjunction/ng-notifications@2.132.0
  - @memberjunction/ng-react@2.132.0
  - @memberjunction/ng-shared-generic@2.132.0
  - @memberjunction/interactive-component-types@2.132.0
  - @memberjunction/core-entities@2.132.0
  - @memberjunction/ng-markdown@2.132.0
  - @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- Updated dependencies [280a4c7]
- Updated dependencies [81598e3]
  - @memberjunction/core@2.131.0
  - @memberjunction/ng-base-types@2.131.0
  - @memberjunction/ng-code-editor@2.131.0
  - @memberjunction/ng-notifications@2.131.0
  - @memberjunction/ng-react@2.131.0
  - @memberjunction/ng-shared-generic@2.131.0
  - @memberjunction/interactive-component-types@2.131.0
  - @memberjunction/core-entities@2.131.0
  - @memberjunction/ng-markdown@2.131.0
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- Updated dependencies [0dcb9cb]
  - @memberjunction/ng-markdown@2.130.1
  - @memberjunction/ng-base-types@2.130.1
  - @memberjunction/ng-code-editor@2.130.1
  - @memberjunction/ng-notifications@2.130.1
  - @memberjunction/ng-react@2.130.1
  - @memberjunction/ng-shared-generic@2.130.1
  - @memberjunction/interactive-component-types@2.130.1
  - @memberjunction/core@2.130.1
  - @memberjunction/core-entities@2.130.1
  - @memberjunction/global@2.130.1

## 2.130.0

### Patch Changes

- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
  - @memberjunction/core@2.130.0
  - @memberjunction/core-entities@2.130.0
  - @memberjunction/ng-notifications@2.130.0
  - @memberjunction/ng-react@2.130.0
  - @memberjunction/ng-base-types@2.130.0
  - @memberjunction/ng-code-editor@2.130.0
  - @memberjunction/ng-shared-generic@2.130.0
  - @memberjunction/interactive-component-types@2.130.0
  - @memberjunction/ng-markdown@2.130.0
  - @memberjunction/global@2.130.0

## 2.129.0

### Patch Changes

- a39946c: no migration
- Updated dependencies [c391d7d]
- Updated dependencies [8c412cf]
- Updated dependencies [f7267c3]
- Updated dependencies [fbae243]
- Updated dependencies [0fb62af]
- Updated dependencies [7d42aa5]
- Updated dependencies [c7e38aa]
- Updated dependencies [7a39231]
  - @memberjunction/core@2.129.0
  - @memberjunction/ng-react@2.129.0
  - @memberjunction/global@2.129.0
  - @memberjunction/core-entities@2.129.0
  - @memberjunction/ng-base-types@2.129.0
  - @memberjunction/ng-code-editor@2.129.0
  - @memberjunction/ng-notifications@2.129.0
  - @memberjunction/ng-shared-generic@2.129.0
  - @memberjunction/interactive-component-types@2.129.0
  - @memberjunction/ng-markdown@2.129.0

## 2.128.0

### Patch Changes

- e41becd: no migration file
- Updated dependencies [f407abe]
- Updated dependencies [3dde14d]
- Updated dependencies [0863f85]
  - @memberjunction/core@2.128.0
  - @memberjunction/core-entities@2.128.0
  - @memberjunction/ng-notifications@2.128.0
  - @memberjunction/ng-markdown@2.128.0
  - @memberjunction/ng-base-types@2.128.0
  - @memberjunction/ng-code-editor@2.128.0
  - @memberjunction/ng-react@2.128.0
  - @memberjunction/ng-shared-generic@2.128.0
  - @memberjunction/interactive-component-types@2.128.0
  - @memberjunction/global@2.128.0

## 2.127.0

### Minor Changes

- 65318c4: migration

### Patch Changes

- Updated dependencies [65318c4]
- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/interactive-component-types@2.127.0
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/ng-react@2.127.0
  - @memberjunction/core-entities@2.127.0
  - @memberjunction/ng-base-types@2.127.0
  - @memberjunction/ng-code-editor@2.127.0
  - @memberjunction/ng-notifications@2.127.0
  - @memberjunction/ng-shared-generic@2.127.0
  - @memberjunction/ng-markdown@2.127.0

## 2.126.1

### Patch Changes

- 8fa1aa2: no migration
  - @memberjunction/ng-notifications@2.126.1
  - @memberjunction/ng-react@2.126.1
  - @memberjunction/ng-base-types@2.126.1
  - @memberjunction/ng-code-editor@2.126.1
  - @memberjunction/ng-markdown@2.126.1
  - @memberjunction/ng-shared-generic@2.126.1
  - @memberjunction/interactive-component-types@2.126.1
  - @memberjunction/core@2.126.1
  - @memberjunction/core-entities@2.126.1
  - @memberjunction/global@2.126.1

## 2.126.0

### Minor Changes

- 389183e: migration

### Patch Changes

- eae1a1f: Add Phase B component linter fixtures, reorganize test structure, refactor financial analytics components, and fix OpenEntityRecord event propagation in artifacts and collections
- Updated dependencies [389183e]
- Updated dependencies [703221e]
  - @memberjunction/ng-markdown@2.126.0
  - @memberjunction/core@2.126.0
  - @memberjunction/ng-base-types@2.126.0
  - @memberjunction/ng-code-editor@2.126.0
  - @memberjunction/ng-notifications@2.126.0
  - @memberjunction/ng-react@2.126.0
  - @memberjunction/ng-shared-generic@2.126.0
  - @memberjunction/interactive-component-types@2.126.0
  - @memberjunction/core-entities@2.126.0
  - @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [1115143]
- Updated dependencies [bd4aa3d]
  - @memberjunction/interactive-component-types@2.125.0
  - @memberjunction/core@2.125.0
  - @memberjunction/ng-react@2.125.0
  - @memberjunction/core-entities@2.125.0
  - @memberjunction/ng-base-types@2.125.0
  - @memberjunction/ng-code-editor@2.125.0
  - @memberjunction/ng-notifications@2.125.0
  - @memberjunction/ng-shared-generic@2.125.0
  - @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- Updated dependencies [75058a9]
  - @memberjunction/core@2.124.0
  - @memberjunction/core-entities@2.124.0
  - @memberjunction/ng-base-types@2.124.0
  - @memberjunction/ng-code-editor@2.124.0
  - @memberjunction/ng-notifications@2.124.0
  - @memberjunction/ng-react@2.124.0
  - @memberjunction/ng-shared-generic@2.124.0
  - @memberjunction/interactive-component-types@2.124.0
  - @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/ng-base-types@2.123.1
- @memberjunction/ng-code-editor@2.123.1
- @memberjunction/ng-notifications@2.123.1
- @memberjunction/ng-react@2.123.1
- @memberjunction/ng-shared-generic@2.123.1
- @memberjunction/interactive-component-types@2.123.1
- @memberjunction/core@2.123.1
- @memberjunction/core-entities@2.123.1
- @memberjunction/global@2.123.1

## 2.123.0

### Patch Changes

- @memberjunction/ng-notifications@2.123.0
- @memberjunction/ng-react@2.123.0
- @memberjunction/ng-shared-generic@2.123.0
- @memberjunction/ng-base-types@2.123.0
- @memberjunction/ng-code-editor@2.123.0
- @memberjunction/interactive-component-types@2.123.0
- @memberjunction/core@2.123.0
- @memberjunction/core-entities@2.123.0
- @memberjunction/global@2.123.0

## 2.122.2

### Patch Changes

- 81f0c44: Add comprehensive dependency management system with automated detection and fixes, optimize migration validation workflow to only trigger on migration file changes
- Updated dependencies [81f0c44]
  - @memberjunction/core-entities@2.122.2
  - @memberjunction/ng-code-editor@2.122.2
  - @memberjunction/ng-notifications@2.122.2
  - @memberjunction/ng-react@2.122.2
  - @memberjunction/ng-base-types@2.122.2
  - @memberjunction/ng-shared-generic@2.122.2
  - @memberjunction/interactive-component-types@2.122.2
  - @memberjunction/core@2.122.2
  - @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- 699a480: Fix missing @memberjunction dependencies in 24 Angular packages
- Updated dependencies [699a480]
  - @memberjunction/ng-react@2.122.1
  - @memberjunction/ng-base-types@2.122.1
  - @memberjunction/ng-code-editor@2.122.1
  - @memberjunction/ng-notifications@2.122.1
  - @memberjunction/ng-shared-generic@2.122.1
  - @memberjunction/interactive-component-types@2.122.1
  - @memberjunction/core@2.122.1
  - @memberjunction/core-entities@2.122.1
  - @memberjunction/global@2.122.1

## 2.122.0

### Patch Changes

- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/core-entities@2.122.0
  - @memberjunction/ng-base-types@2.122.0
  - @memberjunction/ng-code-editor@2.122.0
  - @memberjunction/ng-notifications@2.122.0
  - @memberjunction/ng-react@2.122.0
  - @memberjunction/ng-shared-generic@2.122.0
  - @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- Updated dependencies [a2bef0a]
- Updated dependencies [7d5a046]
  - @memberjunction/core@2.121.0
  - @memberjunction/ng-base-types@2.121.0
  - @memberjunction/ng-code-editor@2.121.0
  - @memberjunction/ng-notifications@2.121.0
  - @memberjunction/ng-react@2.121.0
  - @memberjunction/core-entities@2.121.0
  - @memberjunction/global@2.121.0

## 2.120.0

### Patch Changes

- Updated dependencies [3074b66]
- Updated dependencies [60a1831]
- Updated dependencies [5dc805c]
  - @memberjunction/core@2.120.0
  - @memberjunction/ng-base-types@2.120.0
  - @memberjunction/ng-code-editor@2.120.0
  - @memberjunction/ng-notifications@2.120.0
  - @memberjunction/ng-react@2.120.0
  - @memberjunction/core-entities@2.120.0
  - @memberjunction/global@2.120.0

## 2.119.0

### Patch Changes

- Updated dependencies [7dd7cca]
  - @memberjunction/core@2.119.0
  - @memberjunction/ng-base-types@2.119.0
  - @memberjunction/ng-code-editor@2.119.0
  - @memberjunction/ng-notifications@2.119.0
  - @memberjunction/ng-react@2.119.0
  - @memberjunction/core-entities@2.119.0
  - @memberjunction/global@2.119.0

## 2.118.0

### Patch Changes

- Updated dependencies [264c57a]
- Updated dependencies [096ece6]
- Updated dependencies [78721d8]
  - @memberjunction/core-entities@2.118.0
  - @memberjunction/core@2.118.0
  - @memberjunction/ng-base-types@2.118.0
  - @memberjunction/ng-code-editor@2.118.0
  - @memberjunction/ng-notifications@2.118.0
  - @memberjunction/ng-react@2.118.0
  - @memberjunction/global@2.118.0

## 2.117.0

### Patch Changes

- Updated dependencies [8c092ec]
  - @memberjunction/core@2.117.0
  - @memberjunction/ng-base-types@2.117.0
  - @memberjunction/ng-code-editor@2.117.0
  - @memberjunction/ng-notifications@2.117.0
  - @memberjunction/ng-react@2.117.0
  - @memberjunction/core-entities@2.117.0
  - @memberjunction/global@2.117.0

## 2.116.0

### Patch Changes

- Updated dependencies [81bb7a4]
- Updated dependencies [a8d5592]
  - @memberjunction/core@2.116.0
  - @memberjunction/global@2.116.0
  - @memberjunction/ng-base-types@2.116.0
  - @memberjunction/ng-code-editor@2.116.0
  - @memberjunction/ng-notifications@2.116.0
  - @memberjunction/ng-react@2.116.0
  - @memberjunction/core-entities@2.116.0

## 2.115.0

### Patch Changes

- @memberjunction/ng-base-types@2.115.0
- @memberjunction/ng-code-editor@2.115.0
- @memberjunction/ng-notifications@2.115.0
- @memberjunction/ng-react@2.115.0
- @memberjunction/core@2.115.0
- @memberjunction/core-entities@2.115.0
- @memberjunction/global@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/ng-base-types@2.114.0
- @memberjunction/ng-code-editor@2.114.0
- @memberjunction/ng-notifications@2.114.0
- @memberjunction/ng-react@2.114.0
- @memberjunction/core@2.114.0
- @memberjunction/core-entities@2.114.0
- @memberjunction/global@2.114.0

## 2.113.2

### Patch Changes

- Updated dependencies [61d1df4]
  - @memberjunction/core@2.113.2
  - @memberjunction/ng-base-types@2.113.2
  - @memberjunction/ng-code-editor@2.113.2
  - @memberjunction/ng-notifications@2.113.2
  - @memberjunction/ng-react@2.113.2
  - @memberjunction/core-entities@2.113.2
  - @memberjunction/global@2.113.2

## 2.112.0

### Minor Changes

- 2ac2120: Migration

### Patch Changes

- Updated dependencies [c126b59]
  - @memberjunction/global@2.112.0
  - @memberjunction/ng-base-types@2.112.0
  - @memberjunction/ng-code-editor@2.112.0
  - @memberjunction/ng-notifications@2.112.0
  - @memberjunction/core@2.112.0
  - @memberjunction/core-entities@2.112.0
  - @memberjunction/ng-react@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/ng-base-types@2.110.1
- @memberjunction/ng-code-editor@2.110.1
- @memberjunction/ng-notifications@2.110.1
- @memberjunction/ng-react@2.110.1
- @memberjunction/core@2.110.1
- @memberjunction/core-entities@2.110.1
- @memberjunction/global@2.110.1

## 2.110.0

### Minor Changes

- d2d7ab9: migration

### Patch Changes

- Updated dependencies [02d72ff]
- Updated dependencies [d2d7ab9]
- Updated dependencies [c8b9aca]
  - @memberjunction/core-entities@2.110.0
  - @memberjunction/ng-base-types@2.110.0
  - @memberjunction/ng-code-editor@2.110.0
  - @memberjunction/ng-notifications@2.110.0
  - @memberjunction/ng-react@2.110.0
  - @memberjunction/core@2.110.0
  - @memberjunction/global@2.110.0

## 2.109.0

### Minor Changes

- 6e45c17: migration

### Patch Changes

- Updated dependencies [6e45c17]
  - @memberjunction/core-entities@2.109.0
  - @memberjunction/ng-base-types@2.109.0
  - @memberjunction/ng-code-editor@2.109.0
  - @memberjunction/ng-notifications@2.109.0
  - @memberjunction/ng-react@2.109.0
  - @memberjunction/core@2.109.0
  - @memberjunction/global@2.109.0

## 2.108.0

### Patch Changes

- Updated dependencies [656d86c]
  - @memberjunction/core-entities@2.108.0
  - @memberjunction/ng-base-types@2.108.0
  - @memberjunction/ng-code-editor@2.108.0
  - @memberjunction/ng-notifications@2.108.0
  - @memberjunction/ng-react@2.108.0
  - @memberjunction/core@2.108.0
  - @memberjunction/global@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/ng-base-types@2.107.0
- @memberjunction/ng-code-editor@2.107.0
- @memberjunction/ng-notifications@2.107.0
- @memberjunction/ng-react@2.107.0
- @memberjunction/core@2.107.0
- @memberjunction/core-entities@2.107.0
- @memberjunction/global@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/ng-base-types@2.106.0
- @memberjunction/ng-code-editor@2.106.0
- @memberjunction/ng-notifications@2.106.0
- @memberjunction/ng-react@2.106.0
- @memberjunction/core@2.106.0
- @memberjunction/core-entities@2.106.0
- @memberjunction/global@2.106.0

## 2.105.0

### Minor Changes

- 5c2119c: migration

### Patch Changes

- Updated dependencies [4807f35]
- Updated dependencies [9b67e0c]
  - @memberjunction/core-entities@2.105.0
  - @memberjunction/ng-base-types@2.105.0
  - @memberjunction/ng-code-editor@2.105.0
  - @memberjunction/ng-notifications@2.105.0
  - @memberjunction/ng-react@2.105.0
  - @memberjunction/core@2.105.0
  - @memberjunction/global@2.105.0
