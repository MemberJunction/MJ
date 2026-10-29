# @memberjunction/ng-explorer-app

## 6.2.0-edge.6

### Patch Changes

- b5955fb: The org brand overlay now survives a cold load. `ApplyBrandOverlay()` persisted only the overlay id, and the overlay stylesheet is a session Blob, so after a reload the pre-paint script restored the `data-theme-overlay` attribute with no CSS behind it: the shell's loading screen and the sign-in page rendered MJ's default tokens until workspace bootstrap re-emitted the overlay at the end of its metadata refresh.
  - `ApplyBrandOverlay()` persists the emitted overlay CSS beside the id (`mj-theme-overlay-css`, JSON `{ id, css }`). A session-only overlay (`persist: false`, the Theme Studio preview) persists neither.
  - New `ThemeService.RestorePersistedBrandOverlay()` re-injects that CSS as a `<style>` and sets the attribute from localStorage alone, and records the overlay id so `Initialize()` keeps the attribute until bootstrap registers the brand. Bootstrap's real `<link>` replaces the preloaded `<style>`; a CSS entry whose id no longer matches the persisted overlay is dropped as stale; `ClearBrandOverlay()` removes both. localStorage failures are swallowed as before.
  - `MJExplorerAppComponent` calls the restore in its constructor, before the sign-in page or the shell's loading screen renders.
  - `ng-workspace-initializer`: when bootstrap's brand query succeeds and finds no active brand, it calls `ClearBrandOverlay()`, so a brand restored from localStorage cannot outlive its retirement; a failed query leaves the cached brand alone. The service tracks a restored overlay as pending until bootstrap confirms or clears it (not inferred from the preload `<style>`'s presence), the preload lookup is an attribute walk so an id with selector metacharacters cannot throw from the constructor, and a re-apply of the same brand skips the CSS write.
  - `ng-auth-services`: the logout cache clearing now preserves `mj-theme-overlay-css` alongside `mj-theme` and `mj-theme-overlay`, so a sign-out followed by a sign-in still has the CSS to restore. Without it the sign-in cold load had the attribute and no stylesheet behind it.

  Verified live: on a cold reload the loading screen is branded at the first instant it exists (~400 ms, before any real stylesheet link), and the real overlay link takes over once bootstrap completes.

- db4e210: - `@memberjunction/ng-base-forms`:
  - Extract declarative `[mjRecordLink]` directive (`MjRecordLinkDirective`), `<mj-record-link>` component (`MjRecordLinkComponent`), and body-mounted singleton `MjRecordPreviewPopoverService` so any custom form header, `BaseFormPanel`, or dashboard widget can attach hover-intent record previews, inline Quick Edit with live propagation to virtual display fields, standard/polymorphic FK resolution, and `FormNavigationEvent` navigation. Refactor `<mj-form-field>` and `<mj-record-links>` to share the same DRY infrastructure.
  - Upgrade `<mj-record-preview-popover>` (`MjRecordPreviewPopoverComponent`) with an Option A header micro-cluster (Copy ID pill, `[✎]` Quick Edit, `[↗]` New Tab), clickable record title (`Record →`), auto-spanning wide fields (`grid-column: 1 / -1`), contextual `Cancel`/`Save` footer only in edit mode, cancellable `BeforeQuickEditSave` / `AfterQuickEditSaved` events, and 3-tier `@RegisterClass(MjRecordPreviewPopoverComponent, ...)` / `ClassFactory` runtime specialization (`ResolveRecordPreviewPopoverType`).
  - Add one-click Quick Unlink for nullable outgoing foreign keys inside `<mj-record-links>`.
  - `@memberjunction/ng-ui-components`:
    - Add general-purpose, zero-domain-knowledge `<mj-burst-cluster-strip>` (`MJBurstClusterStripComponent`) for irregular time-series event streams with generic `[Items]` or raw `[Data]` + `[FieldMap]` binding, configurable grouping & resolution (`Resolution`: `'auto' | 'session' | 'day' | 'week' | 'month' | 'quarter' | 'year'`, `CoalesceStrategy`: `'adaptive-era' | 'merge-closest'`, `SessionGapHours`, `GroupSameCalendarDay`, `MaxClusters`, `EraZoomThreshold`), semantic Click-to-Zoom on multi-year era cards, rich imperative methods, and cancellable `Before*` / `After*` events.
  - `@memberjunction/ng-record-changes`:
    - Consume `<mj-burst-cluster-strip>` from `@memberjunction/ng-ui-components` to replace the linear 12-bucket spark-bar chart with a **Burst-Aware Cluster Strip (Time-Gap Compression)** with multi-year adaptive era zoom and click-to-filter session cards.
    - Add a Cross-Version Diff Comparison workbench (`vA ↔ vB`) to `<mj-record-changes>`, allowing users to compare any two historical snapshots or compare a historical snapshot against the live record state.
  - `@memberjunction/codegen-lib`: Prevent foreign keys, polymorphic `RecordID` columns (`EntityIDFieldName` set or `*RecordID`/`*RecordPrimaryKey` naming), and columns on tables with an `MJ: Entities` FK from being auto-selected as `IsNameField`.
  - `@memberjunction/ng-explorer-core` & `@memberjunction/ng-explorer-app`: Fix infinite loading screen hang when navigating to an invalid or unmatched URL by handling `NavigationError` / `NavigationCancel` in `ShellComponent.ngOnInit` and falling back to the active workspace tab or landing app when a deep link fails to resolve.
- bfa2621: The floating chat overlay now follows the shell's chrome policy. `Shell.ChatOverlay.Enabled` already switched the bubble platform-wide, but a host's `BaseShellChromePolicy` could narrow search, notifications and the app switcher per user and not the overlay, so a host that owns its own AI surface for one audience (a learner portal) had to hide the bubble with route-scoped CSS.
  - `ShellChromeFlags` gains `chatOverlay`, baselined from `Shell.ChatOverlay.Enabled` and narrow-only like the other booleans: a policy can turn it off, never back on past Instance Config.
  - `ShellComponent.ChromeFlags` exposes the resolved set. `MJExplorerAppComponent.ShowChatOverlay` reads `chatOverlay` from the shell through a view query, falling back to its own Instance Config read until the shell renders. One policy instance, one `Changed`.
  - Tests: the narrowing and widen-ceiling cases in the chrome policy spec, the shell getter, and an explorer-app spec for shell-driven vs fallback.

- Updated dependencies [622f166]
- Updated dependencies [4c6a28b]
- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [d43d86e]
- Updated dependencies [b5955fb]
- Updated dependencies [281724a]
- Updated dependencies [1090caa]
- Updated dependencies [f2248d5]
- Updated dependencies [0ff7523]
- Updated dependencies [f7d5ab5]
- Updated dependencies [b5c11d3]
- Updated dependencies [5d83ba4]
- Updated dependencies [a65dfb8]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [3b7c949]
- Updated dependencies [09c7d57]
- Updated dependencies [f26084f]
- Updated dependencies [1141164]
- Updated dependencies [dae1d31]
- Updated dependencies [4c97994]
- Updated dependencies [cb1e602]
- Updated dependencies [7d9b179]
- Updated dependencies [db4e210]
- Updated dependencies [d296edd]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [68f5c01]
- Updated dependencies [663ff80]
- Updated dependencies [36cdad5]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [5931f0d]
- Updated dependencies [bfa2621]
- Updated dependencies [0a348e2]
- Updated dependencies [33226e0]
- Updated dependencies [5b41d48]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
  - @memberjunction/ai-core-plus@6.2.0-edge.6
  - @memberjunction/core-entities@6.2.0-edge.6
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/ng-shared@6.2.0-edge.6
  - @memberjunction/ng-explorer-core@6.2.0-edge.6
  - @memberjunction/ng-bootstrap@6.2.0-edge.6
  - @memberjunction/ng-auth-services@6.2.0-edge.6
  - @memberjunction/ng-workspace-initializer@6.2.0-edge.6
  - @memberjunction/ng-conversations@6.2.0-edge.6
  - @memberjunction/theme-engine@6.2.0-edge.6
  - @memberjunction/ng-notifications@6.2.0-edge.6
  - @memberjunction/ai-agent-client@6.2.0-edge.6
  - @memberjunction/ng-realtime-channels@6.2.0-edge.6
  - @memberjunction/ng-base-application@6.2.0-edge.6
  - @memberjunction/ng-base-types@6.2.0-edge.6
  - @memberjunction/ng-feedback@6.2.0-edge.6
  - @memberjunction/ng-agent-client@6.2.0-edge.6
  - @memberjunction/ng-explorer-service-worker@6.2.0-edge.6

## 6.2.0-edge.5

### Minor Changes

- 1cb1d52: Login Studio: design the Explorer sign-in page on the default theme.
  - **Schema:** `MJ: Themes` gains `LoginScreen` (published) and `LoginScreenDraft`. `MJThemeEntityExtended`
    refuses a design the login screen cannot draw safely (`StoredLoginDesignProblems` in
    `@memberjunction/theme-engine`, the same contract the editor checks).
  - **App:** Login Studio (`LoginStudioResource`) edits blocks, layout, background and colors, saves a draft
    and publishes it.
  - **Public route:** `GET /auth/login-screen` serves the default Active theme's published design, logos and
    seeds, sanitized (`SanitizePublicLoginScreen`) on the server and again in the browser. Drafts are never
    served to anonymous visitors; signed-in users who can read themes can read them.
  - **Login screen:** `<mj-explorer-app>` draws a published design through `<mj-login-region>` and wears the
    default theme's brand colors before sign-in. A host's `mjLoginSlot` templates still win;
    `UsePublishedLoginScreen = false` keeps the screen as the host's own inputs and CSS draw it.

### Patch Changes

- c159e2f: MJAPI can now live under a path prefix without per-route CDN patches (#5674). A new setting, `MJAPI_BASE_PATH` (default `/`), is the prefix MJAPI mounts every route under. `GRAPHQL_ROOT_PATH` stays only where Apollo listens, and `MJAPI_PUBLIC_URL` stays where the world reaches MJAPI.
  - **`ApiRoute(subpath, { absolute? })`** (new, `@memberjunction/server`): the mount path under `MJAPI_BASE_PATH`, or with `absolute` the public URL (`MJAPI_PUBLIC_URL` + subpath). Also exports `ApiRootPath()`, `ConfiguredPublicUrl()`, `JoinApiRoute()` and `NormalizeApiRootPath()`.
  - **Core mounts** (`/healthcheck`, `/oauth`, `/esignature`, `/media`, `/realtime/sdp-exchange`, `/magic-link`, `/widget`, `/realtime/verify`, `/health/extensions`, `/auth`) are composed under the base path, as are the magic-link and realtime-verify form actions, `CreateMediaAccessToken`'s URL and `CreateUploadStageToken`'s `Url`.
  - **Server extensions:** every `RootPath` is relative to the base path. `PrepareServerExtensionConfigs({ apiRootPath })` composes the mount path (new `ComposeServerExtensionMountPath`), and `ServerExtensionInitContext.apiRootPath` carries it. `graphqlRootPath` is no longer a reserved root, and `CoreReservedServerExtensionRoots()` no longer takes it.
  - **Explorer is told where MJAPI is.** New optional `MJAPI_URI` environment value (`MJEnvironmentConfig`, `WorkspaceEnvironment`, `GraphQLProviderConfigData.MJAPIURL`) and `ResolveMJAPIURL(mjapiUrl)` in `@memberjunction/core`. When set, the auth-provider catalog, the Login Studio sign-in page, the healthcheck poll, the OAuth code exchange and the upload-stage POST use it as given. When unset, each keeps exactly its previous behaviour.
  - Default config changes nothing: with `MJAPI_BASE_PATH` and `MJAPI_URI` unset, every mount path, emitted URL and Explorer request is unchanged, whatever `GRAPHQL_ROOT_PATH` is. REST stays at the origin-absolute `/api/v1`.

  **Opting in (`MJAPI_BASE_PATH=/api`, e.g. behind MJ Central's CloudFront, which forwards `/api/*` unstripped).** Every route moves under the prefix, and nothing on the MJ side reports a caller still using the old address. In the same change:
  - Set `MJAPI_PUBLIC_URL` to the prefixed address (`https://host/api`) so links MJAPI hands out carry it, and set Explorer's `MJAPI_URI` to the same. Server and Explorer switch together: either one alone leaves the login-provider catalog and the healthcheck pointing at the wrong place.
  - Re-register every URL an outside party holds, or keep a temporary edge redirect from the old path: provider webhooks (Open App extensions such as Orders' `/webhooks/payments` and `/webhooks/billcom`, telephony `/telephony/*` and `/meetings/teams`, Slack/Teams messaging, core `/esignature/webhook/:driverKey`), OAuth redirect URIs (`/oauth/callback`), and links already emailed (magic-link invites, realtime-verify links). Carrier URLs MJ registers itself (`BuildCallbackUrl`) follow automatically.
  - Remove CDN behaviors added per route for the old root paths once nothing calls them.
  - **Update your own MJExplorer app.** `packages/MJExplorer` is a starter template, not a published package, so this release does not change your copy. Its `src/main.ts` preloads the sign-in data before Angular starts and must pass `MJAPI_URI` through itself. Add `MJAPI_URI` to your `environment.ts` files, then change the two preload calls:

    ```ts
    AuthProviderCatalog.Preload(environment.GRAPHQL_URI, undefined, environment.MJAPI_URI),
    LoginScreenLoader.Load(environment.GRAPHQL_URI, undefined, environment.MJAPI_URI),
    ```

    If your `environment.ts` is a plain object literal without `MJAPI_URI`, type it as `MJEnvironmentConfig` from `@memberjunction/ng-bootstrap` so the property exists. Everything after bootstrap (healthcheck, OAuth exchange, uploads, the login screen) reads `MJAPI_URI` from the environment you already pass to `MJExplorerAppModule.forRoot()`; no other change is needed. Skipping this step does not break sign-in. The provider list and the Login Studio design just fall back to the compiled defaults.

  Telephony media WebSocket URLs (`/telephony/*/media`) and `/realtime-proxy` do not move.

- 95c7682: The chat overlay's top boundary no longer throws NG0100 when the connectivity banner appears

  `MJExplorerAppComponent.ChatOverlayTopBoundaryPx` read the banner height from the
  `--mj-connectivity-banner-height` custom property with `getComputedStyle`. The banner publishes that
  height from its `@slideDown.done` listener, which runs inside the animation flush while views are
  still refreshing. Explorer is zoneless, so that listener only marks the shell view dirty, and a
  targeted pass never re-reads the shell's binding — but dev-mode check-no-changes does, so every
  later change-detection pass reported:

      NG0100: ExpressionChangedAfterItHasBeenCheckedError ... Previous value: '60'. Current value: '95'.

  The banner now also exposes its height as a `HeightPx` signal (CSS consumers keep using the
  property), and the shell reads it through a `viewChild` query of the banner. The write marks the shell
  view as a stale consumer, so Angular re-refreshes it in the same pass. Dev-mode only — the overlay was
  positioned correctly either way.

- b1e628e: Removes the legacy pre-`mjButton` button system from the Explorer global stylesheet (`_common.scss`): `.mj-btn-primary`, `.mj-btn-secondary`, `.mj-btn-ghost`, `.mj-btn-icon-only`, `.mj-btn-sm`, `.mj-btn-lg`, and the `.mj-btn-icon` child rule, plus two viewport overrides of `.mj-btn`. Buttons use `mjButton` with `variant`/`size` inputs, or the BEM classes `mj-btn mj-btn--<variant> mj-btn--<size>` where a directive cannot be applied. Class-for-class: `mj-btn-primary` → `mj-btn--primary`; `mj-btn-secondary` (transparent, brand border) → `mj-btn--outline`; `mj-btn-ghost` → `mj-btn--flat`; `mj-btn-icon-only` → `mj-btn--icon`; `mj-btn-sm` → `mj-btn--sm`; `mj-btn-lg` → `mj-btn--lg`. Also removes the dead Kendo-era icon-card and skip-icon rule sets (`.mj-icon-card*`, `.mj-card-icon*`, `.mj-card-actions`, `.skip-icon*`, every `.k-*` selector) and tokenizes the stylesheet's remaining hardcoded colors; the modal backdrop now uses `--mj-bg-overlay`. The Files grid's row action buttons now use `mj-btn--flat mj-btn--sm` instead of the undefined `mj-btn-flat mj-btn-sm`. Apps that consume `@memberjunction/ng-explorer-app/dist/styles.scss` and still write any removed class in a template should migrate to `mjButton`. Follow-ups landed in the same change: the parallel single-dash `.mj-btn-*` selectors in `_shared-patterns.scss` and explorer-settings are gone (explorer-settings' unused `_md3-shared.css` is deleted outright); the consumer-less `.mj-modal-overlay` / `.mj-modal` / `.mj-modal-sm..xl` / `.mj-modal-close` / `.mj-modal-confirm*` / `.mj-modal-loading*` rules are removed while `.mj-modal-header/-body/-footer` stay; the Files grid drops its unreachable `.grid-action-btn` / `.action-buttons` component CSS; and the two leftover Kendo drawer `querySelector` calls in the Explorer shell and `MJInitializationService.NavigateToInitialRoute` are removed (a bare `/` initial path is left to the router's default route, which is what already happened).
- Updated dependencies [0d81c53]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [39b35f1]
- Updated dependencies [3080e83]
- Updated dependencies [c159e2f]
- Updated dependencies [29129bd]
- Updated dependencies [db39145]
- Updated dependencies [95c7682]
- Updated dependencies [b14c72f]
- Updated dependencies [5e4205c]
- Updated dependencies [81aea34]
- Updated dependencies [ac9b00b]
- Updated dependencies [b4e2ceb]
- Updated dependencies [9898079]
- Updated dependencies [189b702]
- Updated dependencies [5465489]
- Updated dependencies [83486cf]
- Updated dependencies [d29b5c2]
- Updated dependencies [c7418dc]
- Updated dependencies [0c634ba]
- Updated dependencies [223669e]
- Updated dependencies [5fed75a]
- Updated dependencies [1cb1d52]
- Updated dependencies [542795b]
- Updated dependencies [db39145]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [fcc3f03]
- Updated dependencies [1214eca]
- Updated dependencies [7e72c86]
- Updated dependencies [130cc7e]
- Updated dependencies [5fed75a]
- Updated dependencies [ce758af]
- Updated dependencies [2a7a098]
- Updated dependencies [8420f36]
- Updated dependencies [b1e628e]
- Updated dependencies [1d29837]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [c7d1170]
- Updated dependencies [5f707d1]
- Updated dependencies [dc38250]
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/ai-core-plus@6.2.0-edge.5
  - @memberjunction/ng-conversations@6.2.0-edge.5
  - @memberjunction/ng-explorer-core@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/ng-bootstrap@6.2.0-edge.5
  - @memberjunction/ng-auth-services@6.2.0-edge.5
  - @memberjunction/ng-workspace-initializer@6.2.0-edge.5
  - @memberjunction/theme-engine@6.2.0-edge.5
  - @memberjunction/ng-shared@6.2.0-edge.5
  - @memberjunction/ng-base-application@6.2.0-edge.5
  - @memberjunction/ng-notifications@6.2.0-edge.5
  - @memberjunction/ng-base-types@6.2.0-edge.5
  - @memberjunction/ng-realtime-channels@6.2.0-edge.5
  - @memberjunction/ai-agent-client@6.2.0-edge.5
  - @memberjunction/ng-feedback@6.2.0-edge.5
  - @memberjunction/ng-agent-client@6.2.0-edge.5
  - @memberjunction/ng-explorer-service-worker@6.2.0-edge.5

## 6.2.0-edge.4

### Minor Changes

- 975948b: Realtime Channels v2, third phase: verb-level exposure policy, an Angular adapter that wraps an existing component as a channel, an opt-in DOM rasterizer, a sample game channel, and the channels guide. Existing channels, tool names and hosts are unchanged.

  `minor` because this branch edits `metadata/` earlier (see the first two phases) and adds two new packages. There is no migration and no new entity column.
  - **Verb results obey exposure** (`@memberjunction/ai-core-plus`, `@memberjunction/realtime-runtime`, `@memberjunction/ng-conversations`). A verb whose result carries what the channel holds declares `ReturnsChannelData: 'state' | 'pixels'` on its descriptor entry. When the channel's effective exposure is below that level the dispatcher, and the native-tool route for a channel mounted at start, refuse the whole call with `exposure_restricted` (policy, not redaction: the verb is refused whole and its result is never filtered); the check comes after `InvokableBy` and before parameter validation, so a malformed call cannot probe a withheld verb. The catalog note and the `exposure_changed` note list the verbs that are unavailable and why. New pure helpers `IsVerbWithheld`, `WithheldVerbs` and `DescribeWithheldVerb`; `BuildToolBackedVerbs` accepts a per-verb flag map. Remote Browser flags `GetPageText` and `AchieveGoal` (`'state'`) and `DescribePage` and `LocateElement` (`'pixels'`); the Interactive Component channel flags `GetDataState`, `Validate`, `IsDirty` and custom methods with a non-void return type (merged verb offers are withheld only when every offer is flagged). This replaces the earlier statement that exposure is not a redaction layer over verb results.
  - **`AngularComponentChannel<TComponent>`** (new package `@memberjunction/ng-realtime-channels`). Wraps an existing Angular component as a channel surface without rewriting it: a descriptor plus `ReadSurfaceState`, `ApplySurfaceVerb` and `SurfaceEvents`, and optional `OnSurfaceOpen`, `SurfaceCompletion`, `OnSurfaceBound` and `SurfaceElement`. It owns binding and unbinding, change-driven perception (an event emitted while the agent's verb runs is attributed to the agent), verb resolution, validation and serialization, completion, state of record, and pictures. A verb that arrives before the surface exists waits, bounded (5 s), for the real component and otherwise fails with `surface_unavailable`; it neither runs against a hidden instance nor is acknowledged and applied later.
  - **Opt-in DOM rasterizer** (`@memberjunction/ng-realtime-channels`). `EnableChannelFrameCapture()` registers a bounded `html-to-image` based capturer (3000 nodes, 4 s, one capture at a time, 1024 px longest edge, no web fonts) that fails soft and turns itself off after repeated or unrecoverable failures, logging one reason. Core ships none by default; Explorer opts in (`@memberjunction/ng-explorer-app`), and the Interactive Component channel sources pictures only while the user allows pixels and a video track is up. `InteractiveComponentFrameCapture` is now `ChannelFrameCapture` in the new package, and `html-to-image` moved with it.
  - **Sample channel** (new package `@memberjunction/ng-realtime-channel-examples`). A tic-tac-toe channel built only through the adapter, not a dependency of anything and loaded only when a host imports it, with tests that play whole games (user win, agent win, draw) against the real component with interleaved user clicks and agent verbs, plus collapse and re-expand, resume, exposure and pictures.
  - **Guide.** `guides/REALTIME_CHANNELS_GUIDE.md` (indexed in `guides/README.md`): the contract, writing a channel from scratch, wrapping a component, scoping, opening on demand, visual perception, the Interactive Component channel, publishing from an Open App, and testing.
  - **Per-verb timeout in the adapter** (`@memberjunction/ng-realtime-channels`). `AngularComponentChannel.VerbTimeoutMs` (15 s, overridable) bounds `ApplySurfaceVerb`. On timeout the call fails with `verb_timeout` and a message the agent can act on, the serialized queue is released and the timeout is logged once with the channel and verb. A late result is never delivered, a late failure is logged, and a late success is recorded as a change so the next perception note shows the real state; nothing is rolled back.
  - **Generic `ClientOnlyChannelServer`** (`@memberjunction/ai-agents`, loaded by `@memberjunction/server`). `MJ: AI Agent Channels.ServerPluginClass` is required, so a channel that runs entirely in the browser sets it to `ClientOnlyChannelServer` instead of writing an empty plugin. It takes its channel name from the registry row, contributes no server tools and does not rewrite saves. `InteractiveComponentChannelServer` and `IdentityVerificationChannelServer` are now thin subclasses of it that keep their existing registry keys and behavior.

- 88b85fc: Realtime Channels v2, first phase: a self-describing channel contract, per-agent/app/host channel scoping, a validated `ContextTool` proxy, and a lifted visual-perception pump. Existing channels, tool names and hosts are unchanged.

  `minor` because the branch edits `metadata/entities/JSONType-interfaces/IAgentSettings.ts` (the new `Realtime.Channels` block); there is no migration, and no new entity column.
  - **Channel descriptors** (`@memberjunction/ai-core-plus`, `@memberjunction/realtime-runtime`). `RealtimeChannelDescriptor` (nouns, verbs with parameter schemas and `InvokableBy`, events, inputs/output, display policy, default availability, exposure ceiling) and the new `BaseRealtimeChannelClient` members `GetDescriptor`, `GetState`, `ApplyVerb`, `Events$`, `Output$`, `Open`, `Complete`, `InstanceId`. A channel that implements only the original members is synthesized a descriptor, so nothing changes for it. The Whiteboard, Remote Browser, Media and Client Context channels ship authored descriptors; their native tool names are unchanged. Perception notes are structured and debounced (`[channel:<Key>#<instance>] state_changed {…}`, a snapshot first and then deltas).
  - **Channel scoping.** Code default, then agent (`realtime.channels` in the configuration cascade), then app (`Application.AgentSettings.Realtime.Channels`), then host-declared channels (`StartRealtimeSession(…, { HostChannels })`, which work on connect-only providers with no registry rows). `IsActive = false` on a registry row remains a master kill switch. At mint the browser reports its candidates (`channelCandidatesJson`) and the server returns the resolved policy (`ClientPolicyJson`), narrows the declared tools to match, persists the in-scope channel keys on the session, and drops the excluded channels' server plugins. A client with no server policy resolves the same scope locally, and a client against an older server falls back to the original mint mutation.
  - **`ContextTool` proxy.** Accepts `target: { channel, instance? }`; a targeted call is validated against the addressed verb's parameter schema and returns a structured, model-recoverable error on failure. `on-demand` channels are opened mid-session with `action: "open"`. A catalog note rendered from the descriptors tells the model which channels exist.
  - **App client tools.** `Application.AgentSettings.ClientTools` is now read by the realtime path and resolved through `ResolveClientTools`. `RegisterAppClientTools(tools, owner?)` is owner-keyed (new `UnregisterAppClientTools` / `ClearAppClientTools`); Explorer registers its globals and the active surface under separate owners and clears the previous app's surface tools on an app switch (previously they lingered). `FormatClientToolsForPrompt` is removed: it never had a caller.
  - **Visual perception.** The Whiteboard's change-driven frame pump now lives in the base channel (`EnableVisualPerception`); frames are tagged with the change id of the state they describe. The Whiteboard's behavior is unchanged.
  - **Session config rewrites no longer drop fields.** `RealtimeClientSessionResolver` rebuilt the persisted session config field by field on the run-id and pending-feedback rewrites, dropping `mediaCollectionID` and `directActions`; it now carries the existing config forward.

- 0e5a4cd: Template users: an account set up to be copied, with its pinned apps, views, settings, dashboards and Skip conversations, so a new user starts with all of it.
  - **`User.IsTemplate`** (migration). The User form shows it under Account Settings. A copy is never a template itself.
  - **The `template` preset on `MJ: Users`** copies a template user whole: views, settings, dashboards with their categories and links, conversations with their messages, and the artifacts and versions in them. Dashboard layouts, pinned items and artifact references point at the copies. The planner refuses the preset for any user not flagged `IsTemplate` (`TEMPLATE_SOURCE_REQUIRED`), so one person's private work is never copied to another. Only a template-mode preset may open a Locked edge or copy an entity marked `CloneableFromTemplate` (conversations and their messages); request overrides still cannot.
  - **First sign-in.** `userHandling.newUserTemplate: { email, preset }` in `mj.config.cjs` makes MJAPI create each new user as a copy of that template. Any problem falls back to a plain user, so sign-in never breaks.
  - **`mj user clone`** creates a user as a copy of another: `--from`, `--email`, `--first`, `--last`, `--preset` (default `template`), `--inactive`, `--dry-run`.
  - **Open Apps can ship a template user.** `templateUser: { email, description?, preset?, newUsers?: offer | always | never }` in `mj-app.json`. After install, the installer gets their own copy, from `MJ_INSTALL_USER_EMAIL` / `_FIRST_NAME` / `_LAST_NAME` or prompts. The template can also be set for later sign-ins (`MJ_INSTALL_TEMPLATE_FOR_NEW_USERS`). The step only warns on failure; it never fails the install.
  - **Explorer** shows a red banner while a template user is signed in, because everything changed there reaches every later copy.

  Fixes found on the way:
  - **CurrentUser** now returns `IsTemplate`, `FirstLast` and the `Employee*` fields. It returned null for every `UserInfo` field missing from its hand-written list. The list is now `SessionUserFields`, with a test that it covers every field the client requests.
  - **Artifact version saves inside a transaction.** `MJArtifactVersionEntityServer` read attributes through the global provider. On a server's per-request provider, inside a clone's transaction, each read waited about 30 s on the transaction's own locks. A 23-version copy took 11 minutes instead of seconds. It now reads through the entity's provider.
  - **Copies keep their rows' order.** The dependency walker reads children oldest first (`__mj_CreatedAt`). A row whose remapped column points only at its own ancestors, such as a copied user's messages naming the new user, now saves within the graph save instead of after it. Copied conversations kept their messages, but showed each answer above its question.
  - **User copies keep dashboard and view names.** The entities' `(copy)` rename applies only where a name could collide. A user copy owns its rows, so the rename only mislabelled them.
  - Record cloning: `Child.JoinField` preset keys, case-insensitive key lookup in JSON remap, Golden Layout and top-level-array JSON remap paths, and a descendant's `JsonRemap` merged with the entity's own.
  - A conversation message can be created during a clone save (`CloneContext`) by a user who doesn't own the conversation yet. Updates and deletes are still checked.

### Patch Changes

- bb3028a: A Config dashboard's tab has an AI assistant: a resizable side pane that chats, in text or in a Gemini 3.8 Live voice session, with the new **Dashboards Expert** agent, which the Dashboards application pins through its `AgentSettings`.
  - **Client tools.** The tab gives the agent client tools: `GetDashboardState`, `GetDashboardScreenshot` and `SearchSources` read the dashboard and find views, queries, entities and artifacts; `AddPanel`, `RemovePanel`, `MovePanel`, `ResizePanel` and `UpdatePanelSettings` make in-memory edits, one at a time, that put the tab in edit mode and that Cancel discards; and `RequestSaveDashboard` and `RequestPinToHome` ask the user in a confirm dialog, so a save or a Home pin happens only when the user confirms it. The edit and request tools take the `dashboardId` that `GetDashboardState` returns and refuse a call for a dashboard that is no longer open.
  - **`DashboardResource`** (`@memberjunction/ng-explorer-core`, the dashboard tab) adds the AI pane's members: the pane state `ChatOpen`, `CopilotExpanded`, `MainSizePct`, `CopilotSizePct`, `CopilotMinPct`, `CopilotMaxPct` and `ShowCloseChatConfirm`; the chat state `ChatAgentId`, `ChatAgentName`, `ChatAgentError`, `ChatConversation`, `ChatConversationId`, `ChatIsNewConversation`, `ChatPendingMessage`, `ChatPendingAttachments`, `ChatAppContext`, `ChatApplicationId` and `ChatEnvironmentId`; the open save or pin confirm, `AgentConfirm`, with `OnAgentConfirm()`; and the methods `ToggleChat()`, `CloseChat()`, `OnCloseChatConfirmed()`, `OnCloseChatCancelled()`, `ToggleCopilotExpanded()`, `OnCopilotSplitDragEnd()`, `OnChatConversationCreated()`, `OnChatRealtimeConversationReady()`, `OnChatPendingMessageConsumed()`, `OnChatNavigationRequest()` and `OnChatOpenEntityRecord()`.
  - **Layout editor** (`@memberjunction/ng-dashboard-viewer`). The package exports the pure layout editor behind the tab's edit tools (`InsertPanel`, `MovePanel`, `ResizePanel`, `RemovePanelFromLayout`, `SimplifyLayout`, `FindPanelPath`, `DescribePath`, `LayoutEditError`, `PANEL_PLACEMENTS`) and its types `PanelPlacement`, `PanelPosition`, `LayoutPathStep` and `SimplifiedLayoutNode`. `DashboardViewerComponent` adds `ApplyLayout()`, which shows a layout that these functions built, and `GetPanelPath()`, which gives a panel's address in the layout. The viewer's `AddPanel` returns the new panel's ID and honours its position: its optional `location` argument is now a `PanelPosition`, not a `LayoutLocation`, so a caller that passes a `LayoutLocation` must change, and a position that is not valid throws `LayoutEditError`. `UpdatePanelConfig()` now returns a `Promise` that settles when the layout is rebuilt (it rejects when the rebuild fails). A subclass that overrides `AddPanel()` or `addPanel()` must take a `PanelPosition` and return `Promise<string | null>`, and one that overrides `UpdatePanelConfig()` or `updatePanelConfig()` must return `Promise<void>`. Each panel's content element has a `data-panel-id` attribute.
  - **Screenshots** (`@memberjunction/ng-shared`). The package adds `CaptureElementJpeg`, with the types `ElementCaptureOptions` and `ElementCapture`, the defaults `ELEMENT_CAPTURE_DEFAULTS`, and the helpers `ComputePixelRatio()` and `StripDataUrlPrefix()`.
  - **Client tool results.** A client tool result now reaches the model in full: the results of one `ClientTools` step go into one message that expires after 3 turns, and the optional Loop prompt parameter `clientToolResultMaxChars` truncates them with a visible note. In `@memberjunction/ai-agents` it is `LoopAgentTypePromptParams.clientToolResultMaxChars`, and `DEFAULT_LOOP_AGENT_PROMPT_PARAMS` sets it to `-1` (no cap); code that builds its own `Required<LoopAgentTypePromptParams>` must add it.
  - **Images in tool results.** A result can also carry images (`Media`: JPEG, PNG or WebP, at most 4 items of at most 2,000,000 decoded bytes each), which `ParseClientToolMedia` (`@memberjunction/ai-core-plus`) checks in `RespondToClientToolRequest`, a bad item giving a failed tool result; the agent client sends them, and the agent and prompt runner pass them to the model as image blocks that expire after 2 turns, while the step output keeps only their metadata. `@memberjunction/ai-core-plus` adds `ClientToolMediaItem` (`MimeType`, `Base64`, optional `Width` and `Height`), `ClientToolMediaParse` and `CLIENT_TOOL_MEDIA_LIMITS`, and an optional `Media` on `ClientToolResponse` and `ClientToolResultSummary`; `@memberjunction/ai-agent-client` adds an optional `Media` on `ClientToolResult`.
  - **`RespondToClientToolRequest`** (`@memberjunction/server`) takes a new optional GraphQL argument, `media`: a string that holds the images as a JSON array. In TypeScript, `ClientToolRequestResolver.RespondToClientToolRequest()` has the new parameter before the context, so a direct caller that passes the context by position, or a subclass that overrides the method, must change. The agent client's mutation always names the `media` argument, so it needs a server from this release: an older server rejects every client tool response (`Unknown argument "media"`), and each client tool call then fails when it times out. A `result` that is not valid JSON now also gives a failed tool result, so the agent no longer waits for the request to time out.
  - **Media in the agent and prompt runner.** `BaseAgent`'s protected `contentToString()` now turns an image, audio, video or file block into a short stub (for example `[image omitted]`), not its base64 text, and its protected `estimateTokens()` counts each such block as 1,600 tokens. The prompt runner keeps the content blocks that a user message already has when it adds file blocks, and it no longer changes the caller's message objects when it replaces media that the model cannot read.
  - **Voice.** Voice tool results stay text, since the Explorer shell strips `Media` before a realtime session sees them (`WithoutMedia()`, `@memberjunction/ng-explorer-app`). A voice session's delegated run (`invoke-target-agent`) receives the browser session ID and the app context from the session start (`ExecuteRelayedToolInput.BrowserSessionID` and `AppContext`, `@memberjunction/ai-agents`), so the delegated agent can call the page's client tools; a scoped anonymous caller's run, which executes as the system user, gets no app context. The server does not store an app context whose JSON is longer than 256,000 characters, and the delegated runs then get none. A voice session also keeps its direct actions when a delegated run pauses for the user's answer. In `@memberjunction/realtime-runtime`, a surface client tool whose handler returns `Success: false` gives the voice model a failed result, and `RealtimeSessionRuntime.SendVideoFrame` returns whether the frame was sent; a subclass that overrides it must return a `boolean`.
  - **Agent context.** The sub-agent catalog lists only Active relationship targets. The Explorer shell keeps the page's additional context when it rebuilds the app-context snapshot while the page's tab is attached, clears it when the tab is detached, and restores it when the tab is reattached. The client tools a page registered now follow the same rule: only the detach of that page's own tab clears them, so the detach of another tab no longer takes the open dashboard's tools away from the agent. In `@memberjunction/ng-shared`, `AgentContextUpdate` gains `Lifecycle` (`'Detached'` or `'Reattached'`), which `NavigationService.NotifyResourceDetached()` and `NotifyResourceReattached()` set; the detach of another tab now sends an update with only `Caller` and `Lifecycle`, not an empty `AgentClientTools` list.
  - **Chat area** (`@memberjunction/ng-conversations`). The chat area's empty-state composer now receives the host's default agent, application and app context, so a voice call can start before the first message, and the dashboard tab adopts the conversation that call created when it ends.

- Updated dependencies [96d6ec2]
- Updated dependencies [a709bb6]
- Updated dependencies [432cb73]
- Updated dependencies [e4c355e]
- Updated dependencies [6dce70c]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [a4b23b7]
- Updated dependencies [49f26d9]
- Updated dependencies [7384dd6]
- Updated dependencies [88e6902]
- Updated dependencies [bb3028a]
- Updated dependencies [6dc3aa9]
- Updated dependencies [24fce37]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
- Updated dependencies [cc0814d]
- Updated dependencies [1ce4217]
- Updated dependencies [7316ac3]
- Updated dependencies [91be34f]
- Updated dependencies [f325baa]
- Updated dependencies [45ba6be]
- Updated dependencies [08b3d7b]
- Updated dependencies [20650af]
- Updated dependencies [dbc3462]
- Updated dependencies [4fb501e]
- Updated dependencies [c388714]
- Updated dependencies [5a5f8d5]
- Updated dependencies [666d078]
- Updated dependencies [ae78a45]
- Updated dependencies [b2f8b5b]
- Updated dependencies [4cff918]
- Updated dependencies [dcfdda4]
- Updated dependencies [d714f25]
- Updated dependencies [989b3d0]
- Updated dependencies [4889ca0]
- Updated dependencies [1ea4085]
- Updated dependencies [975948b]
- Updated dependencies [22c9074]
- Updated dependencies [88b85fc]
- Updated dependencies [891dc77]
- Updated dependencies [0a952ee]
- Updated dependencies [ee81865]
- Updated dependencies [a70af2d]
- Updated dependencies [aee2d53]
- Updated dependencies [84fc9d4]
- Updated dependencies [038f7dc]
- Updated dependencies [87babe6]
- Updated dependencies [54cd610]
- Updated dependencies [1bed7f7]
- Updated dependencies [6328ed3]
- Updated dependencies [b6b3990]
- Updated dependencies [20d1f4a]
- Updated dependencies [f0c78c3]
- Updated dependencies [6a19f78]
- Updated dependencies [e402de5]
- Updated dependencies [74d9357]
- Updated dependencies [a5b4a72]
- Updated dependencies [eee025e]
- Updated dependencies [02bb563]
- Updated dependencies [afe9eb4]
- Updated dependencies [90829e3]
- Updated dependencies [aac148b]
- Updated dependencies [f2f6f4b]
- Updated dependencies [382b9aa]
- Updated dependencies [0a3a56a]
- Updated dependencies [7a08dc1]
- Updated dependencies [005612e]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [57fea6a]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
  - @memberjunction/ai-core-plus@6.2.0-edge.4
  - @memberjunction/ng-conversations@6.2.0-edge.4
  - @memberjunction/core-entities@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/ng-explorer-core@6.2.0-edge.4
  - @memberjunction/ng-bootstrap@6.2.0-edge.4
  - @memberjunction/ai-agent-client@6.2.0-edge.4
  - @memberjunction/ng-shared@6.2.0-edge.4
  - @memberjunction/ng-realtime-channels@6.2.0-edge.4
  - @memberjunction/ng-base-application@6.2.0-edge.4
  - @memberjunction/ng-workspace-initializer@6.2.0-edge.4
  - @memberjunction/ng-base-types@6.2.0-edge.4
  - @memberjunction/ng-notifications@6.2.0-edge.4
  - @memberjunction/ng-feedback@6.2.0-edge.4
  - @memberjunction/ng-auth-services@6.2.0-edge.4
  - @memberjunction/ng-agent-client@6.2.0-edge.4
  - @memberjunction/ng-explorer-service-worker@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [5037000]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [279b93e]
- Updated dependencies [66fd011]
- Updated dependencies [093e0dd]
- Updated dependencies [f41442f]
- Updated dependencies [196160a]
- Updated dependencies [bea2386]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [d0a8dbf]
- Updated dependencies [fbad999]
- Updated dependencies [ec97ad4]
- Updated dependencies [b1b6d3d]
- Updated dependencies [49e0bd8]
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/ng-conversations@6.2.0-edge.3
  - @memberjunction/ng-explorer-core@6.2.0-edge.3
  - @memberjunction/ng-shared@6.2.0-edge.3
  - @memberjunction/ng-base-application@6.2.0-edge.3
  - @memberjunction/ai-core-plus@6.2.0-edge.3
  - @memberjunction/ng-bootstrap@6.2.0-edge.3
  - @memberjunction/ng-workspace-initializer@6.2.0-edge.3
  - @memberjunction/ng-base-types@6.2.0-edge.3
  - @memberjunction/ng-notifications@6.2.0-edge.3
  - @memberjunction/ai-agent-client@6.2.0-edge.3
  - @memberjunction/ng-auth-services@6.2.0-edge.3
  - @memberjunction/ng-agent-client@6.2.0-edge.3
  - @memberjunction/ng-feedback@6.2.0-edge.3
  - @memberjunction/ng-explorer-service-worker@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [f555162]
- Updated dependencies [043f418]
- Updated dependencies [e97d95c]
- Updated dependencies [2552b1e]
- Updated dependencies [5114c10]
- Updated dependencies [21f9e15]
- Updated dependencies [75d4e8c]
- Updated dependencies [a3d6182]
- Updated dependencies [28fdf22]
- Updated dependencies [4248fb3]
- Updated dependencies [f3c6161]
- Updated dependencies [0adaf76]
- Updated dependencies [513e608]
- Updated dependencies [ef43cf3]
- Updated dependencies [ea4080e]
- Updated dependencies [b44c7cf]
- Updated dependencies [26c0178]
- Updated dependencies [594f2e0]
- Updated dependencies [705ab4e]
- Updated dependencies [96daca8]
- Updated dependencies [aa912ca]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
- Updated dependencies [8766e99]
  - @memberjunction/ai-core-plus@6.2.0-edge.2
  - @memberjunction/ng-conversations@6.2.0-edge.2
  - @memberjunction/ng-explorer-core@6.2.0-edge.2
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/ng-bootstrap@6.2.0-edge.2
  - @memberjunction/ng-workspace-initializer@6.2.0-edge.2
  - @memberjunction/ng-shared@6.2.0-edge.2
  - @memberjunction/ai-agent-client@6.2.0-edge.2
  - @memberjunction/ng-auth-services@6.2.0-edge.2
  - @memberjunction/ng-base-application@6.2.0-edge.2
  - @memberjunction/ng-base-types@6.2.0-edge.2
  - @memberjunction/ng-feedback@6.2.0-edge.2
  - @memberjunction/ng-notifications@6.2.0-edge.2
  - @memberjunction/ng-agent-client@6.2.0-edge.2
  - @memberjunction/ng-explorer-service-worker@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

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

- Updated dependencies [a50948e]
- Updated dependencies [0eeb89d]
- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [67f6c85]
- Updated dependencies [eb3a8d3]
- Updated dependencies [e1dd673]
- Updated dependencies [307da67]
- Updated dependencies [f78fd63]
- Updated dependencies [6aa41c7]
- Updated dependencies [67f6c85]
- Updated dependencies [a7da50b]
- Updated dependencies [1d43161]
- Updated dependencies [7110019]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [8a26af6]
- Updated dependencies [6b08ebf]
- Updated dependencies [9845c00]
- Updated dependencies [e2fa695]
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/ai-core-plus@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/ng-conversations@6.2.0-edge.1
  - @memberjunction/ai-agent-client@6.2.0-edge.1
  - @memberjunction/ng-explorer-core@6.2.0-edge.1
  - @memberjunction/ng-auth-services@6.2.0-edge.1
  - @memberjunction/ng-base-application@6.2.0-edge.1
  - @memberjunction/ng-bootstrap@6.2.0-edge.1
  - @memberjunction/ng-explorer-service-worker@6.2.0-edge.1
  - @memberjunction/ng-feedback@6.2.0-edge.1
  - @memberjunction/ng-notifications@6.2.0-edge.1
  - @memberjunction/ng-shared@6.2.0-edge.1
  - @memberjunction/ng-workspace-initializer@6.2.0-edge.1
  - @memberjunction/ng-base-types@6.2.0-edge.1
  - @memberjunction/ng-agent-client@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- e225ece: Login screen: a composable Explorer surface — theme it, rearrange it, extend it.

  The sign-in page was the one Explorer surface a deployment could not adapt without forking the
  component or writing CSS against its internal class names. It is now customized the same three
  ways the rest of MJ is, each additive and each defaulting to today's rendering:
  - **Tokens** — a `--mj-login-*` group covers the whole surface: `--mj-login-banner-bg` (the story
    panel's background; the stock gradient is its default, so a theme can retarget just the
    `--mj-login-grad-*` stops or replace the value outright), banner text and logo, the
    editorial split, the panel surface, the picker width, and both card surfaces. Only the gradient
    stops carry dark-mode values — everything else either references a semantic token that swaps on
    its own or is theme-constant by design. Documented in THEMING.md.
  - **Layout** — `LoginLayout`: `'split'` (stock), `'split-reverse'` (mirrored; DOM order unchanged,
    so the story stays first for a screen reader), `'centered'` (one column: story on a full-bleed
    banner background, sign-in options in a card on top). A layout moves regions; it never drops one.
  - **Content** — `LoginHeading`, `LoginShowPoweredBy`, `LoginBannerAlignment`, `LoginBannerTitle`,
    `LoginBannerSubtitle`, `LoginBannerLogoLabel`, and `LoginCards`: a `MJLoginCard[]` of tiles
    (icon, title, text, optional sanitized link) each naming its region, so content a deployment
    wants to add is configuration rather than markup.
  - **Slots** — the `mjLoginSlot` directive (the shape of `mjChatSlot` in `ng-conversations`) projects
    templates into `bannerContent` (replaces the brand block), `bannerFooter`, `panelHeader` and
    `panelFooter`. Replace-vs-augment is stated per slot; a footer slot takes over from that region's
    cards. `<mj-login-picker>` is deliberately not replaceable — a host surrounds sign-in, not owns it.

  Also fixes a latent clipping bug this made easy to hit: the app shell sets
  `html, body { overflow: hidden }`, so login content taller than the viewport was unreachable — which
  already affected a tenant with many identity providers on a short screen. Both columns now scroll
  their own content and centre with auto margins rather than `justify-content: center`, which would
  strand the overflow above the scroll origin.

  Review follow-ups: the card's focus ring took `border-radius: inherit`, which resolves to `0` on a
  pseudo-element (the property is not inherited, and `inherit` takes from the originating anchor
  rather than the positioned card), so it drew square around a rounded tile; the login screen gains
  the repo's first `@media (forced-colors: active)` block, since Windows High Contrast substitutes
  the card fill, border token and hover tint away and this is the one surface a user meets before
  any other; and landscape phones are handled, where the width-only breakpoints left the sign-in
  controls off the bottom of the screen.

  The stacked layout's banner is now sized by its height rule rather than by a flex grow ratio. It
  carried `flex: var(--mj-login-banner-flex, 1.05)`, whose shorthand sets flex-basis to `0%`, so
  every `height` in the stacked breakpoints was dead — invisible until the sign-in column gained
  `overflow-y: auto`, which dropped its automatic minimum size to zero and handed the layout to the
  ratio. So THIS DOES CHANGE the stacked banner for an app that binds nothing: 183px to 92px at
  844x390 and 277px to 196px at 820x560, in both cases returning the sign-in options to the screen.
  Portrait is deliberately unchanged at 422px.

  Two tokens are added alongside `--mj-login-panel-text` — `--mj-login-panel-text-secondary` and
  `--mj-login-panel-text-muted` — so a themed panel carries the picker's whole text ramp instead of
  only its body colour. Both default to the semantic tokens.

  Apart from the stacked banner above, no behaviour or visual change for an app that binds nothing,
  projects nothing and themes nothing.

- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [37891d3]
- Updated dependencies [6ad6434]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [a8be410]
- Updated dependencies [b87e4ac]
- Updated dependencies [d665a6e]
- Updated dependencies [90eea38]
- Updated dependencies [e225ece]
- Updated dependencies [c157749]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [7658d68]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [575bfae]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [3977917]
- Updated dependencies [d61b425]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [f0db019]
- Updated dependencies [8a5d2c0]
- Updated dependencies [2c590b0]
- Updated dependencies [fc3da91]
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/ai-core-plus@6.2.0-edge.0
  - @memberjunction/ng-conversations@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/ng-explorer-core@6.2.0-edge.0
  - @memberjunction/ng-auth-services@6.2.0-edge.0
  - @memberjunction/ng-shared@6.2.0-edge.0
  - @memberjunction/ng-bootstrap@6.2.0-edge.0
  - @memberjunction/ng-base-application@6.2.0-edge.0
  - @memberjunction/ng-workspace-initializer@6.2.0-edge.0
  - @memberjunction/ng-base-types@6.2.0-edge.0
  - @memberjunction/ng-notifications@6.2.0-edge.0
  - @memberjunction/ai-agent-client@6.2.0-edge.0
  - @memberjunction/ng-feedback@6.2.0-edge.0
  - @memberjunction/ng-agent-client@6.2.0-edge.0
  - @memberjunction/ng-explorer-service-worker@6.2.0-edge.0

## 6.1.0

### Minor Changes

- 048c5ce: feat(auth): metadata-driven pluggable authentication providers

  Authentication providers are now discovered the MJ way — a `@RegisterClass(BaseAuthProvider, 'x')`
  subclass plus a row in the new `MJ: Authentication Providers` entity, resolved at runtime through
  `ClassFactory` by `DriverClass`. Adding a provider requires no core edits.
  - **New entity** `__mj.AuthenticationProvider`, with the OIDC connection fields as columns, an
    optional `CredentialID` for the rare provider needing server-side secrets, and login-picker
    presentation fields. Driver configuration is split by trust boundary: `AdditionalConfiguration`
    is server-only, `ClientConfiguration` is published to the browser.
  - **`AuthProviderEngine`** loads the catalog at startup and registers it with `AuthProviderFactory`.
  - **Layered resolution** — `mj.config.cjs` `authProviders[]` remains fully supported as the baseline
    and fallback, so existing deployments are unaffected and need no changes.
  - **`GET /auth/providers`** publishes the non-secret catalog to the pre-auth browser (rate-limited,
    mounted ahead of the auth middleware, allow-list projection).
  - **`<mj-login-picker>`** — a reusable, app-agnostic multi-IdP picker built on `mjButton`, rendered
    only when 2+ client-visible providers exist. Single-provider deployments look exactly as before.
  - `AuthProviderFactory` no longer carries a hard-wired list of built-in provider imports; the
    package entry point and the class-registration manifests already covered registration.
  - **Environment-variable configuration is now pluggable too.** The hard-coded block in MJServer's
    config that enumerated Entra / Auth0 / Cognito inline is replaced by an optional
    `configFromEnvironment` static on each provider class (`IEnvironmentConfigurableProvider`),
    collected through the ClassFactory registry by `AuthProviderFactory.discoverFromEnvironment()`.
    A third-party provider can now offer the same "set two variables and you're done" experience
    with no change to MJ core. The three existing mappings are preserved byte-for-byte; **Okta**
    (`OKTA_DOMAIN` + `OKTA_CLIENT_ID`) and **WorkOS** (`WORKOS_CLIENT_ID`) gain env-var support they
    did not previously have.

### Patch Changes

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

- Updated dependencies [4273317]
- Updated dependencies [634aa8c]
- Updated dependencies [834f8d7]
- Updated dependencies [a987913]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [b915983]
- Updated dependencies [b895f92]
- Updated dependencies [b895f92]
- Updated dependencies [1bced7c]
- Updated dependencies [b7819d2]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [3b893b4]
- Updated dependencies [c1fea88]
- Updated dependencies [22ec804]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [2792d97]
- Updated dependencies [3fa1fb8]
- Updated dependencies [1a2ce13]
- Updated dependencies [0d3094c]
- Updated dependencies [241c2c1]
- Updated dependencies [255d506]
- Updated dependencies [0ec1980]
- Updated dependencies [199eb2b]
- Updated dependencies [1940a4d]
- Updated dependencies [e7f1f88]
- Updated dependencies [07cb22e]
- Updated dependencies [deea1a3]
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
- Updated dependencies [2d14c62]
- Updated dependencies [394d276]
- Updated dependencies [c996a56]
- Updated dependencies [de6eb14]
- Updated dependencies [b9de989]
- Updated dependencies [38d4482]
- Updated dependencies [ea003fc]
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
- Updated dependencies [919f0c7]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [d66a26a]
- Updated dependencies [c643ba3]
- Updated dependencies [e9e9873]
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [34d9501]
- Updated dependencies [8288711]
- Updated dependencies [5f33ca8]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [d26e202]
- Updated dependencies [48ff99f]
- Updated dependencies [076fa5d]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [8d0d45a]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [394d276]
- Updated dependencies [dd6d1f0]
- Updated dependencies [9fc0e2d]
- Updated dependencies [71ccf29]
- Updated dependencies [a8710bf]
- Updated dependencies [ceb8e46]
- Updated dependencies [b46330e]
- Updated dependencies [8b78695]
- Updated dependencies [cdd25c0]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [e1ebab9]
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
- Updated dependencies [5fc861f]
- Updated dependencies [1748491]
- Updated dependencies [ea2d1da]
- Updated dependencies [4cdfdcf]
- Updated dependencies [0db6105]
- Updated dependencies [938cd9e]
- Updated dependencies [dbaa967]
- Updated dependencies [d7feeae]
- Updated dependencies [7fefca2]
- Updated dependencies [a1a8989]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [34d19a9]
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
- Updated dependencies [394d276]
- Updated dependencies [ac96bb6]
- Updated dependencies [d078c54]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [ca4feb4]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [768980d]
- Updated dependencies [1c0d586]
  - @memberjunction/ng-explorer-core@6.1.0
  - @memberjunction/ai-core-plus@6.1.0
  - @memberjunction/ng-conversations@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/ng-bootstrap@6.1.0
  - @memberjunction/ng-agent-client@6.1.0
  - @memberjunction/ng-auth-services@6.1.0
  - @memberjunction/ng-base-application@6.1.0
  - @memberjunction/ng-base-types@6.1.0
  - @memberjunction/ng-explorer-service-worker@6.1.0
  - @memberjunction/ng-feedback@6.1.0
  - @memberjunction/ng-notifications@6.1.0
  - @memberjunction/ng-shared@6.1.0
  - @memberjunction/ng-workspace-initializer@6.1.0
  - @memberjunction/ai-agent-client@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [a987913]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [919f0c7]
- Updated dependencies [076fa5d]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [4cdfdcf]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core-entities@6.1.0-edge.7
  - @memberjunction/ng-bootstrap@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/ng-conversations@6.1.0-edge.7
  - @memberjunction/ai-core-plus@6.1.0-edge.7
  - @memberjunction/ng-base-application@6.1.0-edge.7
  - @memberjunction/ng-explorer-core@6.1.0-edge.7
  - @memberjunction/ng-shared@6.1.0-edge.7
  - @memberjunction/ng-workspace-initializer@6.1.0-edge.7
  - @memberjunction/ng-base-types@6.1.0-edge.7
  - @memberjunction/ng-notifications@6.1.0-edge.7
  - @memberjunction/ai-agent-client@6.1.0-edge.7
  - @memberjunction/ng-auth-services@6.1.0-edge.7
  - @memberjunction/ng-feedback@6.1.0-edge.7
  - @memberjunction/ng-agent-client@6.1.0-edge.7
  - @memberjunction/ng-explorer-service-worker@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

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

- Updated dependencies [634aa8c]
- Updated dependencies [2c826f7]
- Updated dependencies [b915983]
- Updated dependencies [1bced7c]
- Updated dependencies [b7819d2]
- Updated dependencies [c1fea88]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0d3094c]
- Updated dependencies [241c2c1]
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
- Updated dependencies [ceb8e46]
- Updated dependencies [cdd25c0]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [1748491]
- Updated dependencies [ea2d1da]
- Updated dependencies [0db6105]
- Updated dependencies [938cd9e]
- Updated dependencies [dbaa967]
- Updated dependencies [7fefca2]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [ac96bb6]
  - @memberjunction/ai-core-plus@6.1.0-edge.6
  - @memberjunction/ng-conversations@6.1.0-edge.6
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/ng-agent-client@6.1.0-edge.6
  - @memberjunction/ng-auth-services@6.1.0-edge.6
  - @memberjunction/ng-base-application@6.1.0-edge.6
  - @memberjunction/ng-base-types@6.1.0-edge.6
  - @memberjunction/ng-bootstrap@6.1.0-edge.6
  - @memberjunction/ng-explorer-core@6.1.0-edge.6
  - @memberjunction/ng-explorer-service-worker@6.1.0-edge.6
  - @memberjunction/ng-feedback@6.1.0-edge.6
  - @memberjunction/ng-notifications@6.1.0-edge.6
  - @memberjunction/ng-shared@6.1.0-edge.6
  - @memberjunction/ng-workspace-initializer@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/ai-agent-client@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [4273317]
- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [22ec804]
- Updated dependencies [3fa1fb8]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [d66a26a]
- Updated dependencies [34d9501]
- Updated dependencies [5f33ca8]
- Updated dependencies [dd6d1f0]
- Updated dependencies [71ccf29]
- Updated dependencies [a8710bf]
- Updated dependencies [8b78695]
- Updated dependencies [e1ebab9]
- Updated dependencies [5fc861f]
- Updated dependencies [d7feeae]
- Updated dependencies [905820a]
- Updated dependencies [34d19a9]
  - @memberjunction/ng-explorer-core@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/ai-core-plus@6.1.0-edge.5
  - @memberjunction/ng-conversations@6.1.0-edge.5
  - @memberjunction/ng-bootstrap@6.1.0-edge.5
  - @memberjunction/ng-shared@6.1.0-edge.5
  - @memberjunction/ng-workspace-initializer@6.1.0-edge.5
  - @memberjunction/ng-feedback@6.1.0-edge.5
  - @memberjunction/ng-base-application@6.1.0-edge.5
  - @memberjunction/ng-base-types@6.1.0-edge.5
  - @memberjunction/ng-notifications@6.1.0-edge.5
  - @memberjunction/ai-agent-client@6.1.0-edge.5
  - @memberjunction/ng-auth-services@6.1.0-edge.5
  - @memberjunction/ng-agent-client@6.1.0-edge.5
  - @memberjunction/ng-explorer-service-worker@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [e2ad3c0]
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
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/ng-bootstrap@6.1.0-edge.4
  - @memberjunction/ng-explorer-core@6.1.0-edge.4
  - @memberjunction/ai-core-plus@6.1.0-edge.4
  - @memberjunction/ng-conversations@6.1.0-edge.4
  - @memberjunction/ng-base-application@6.1.0-edge.4
  - @memberjunction/ng-shared@6.1.0-edge.4
  - @memberjunction/ng-workspace-initializer@6.1.0-edge.4
  - @memberjunction/ng-base-types@6.1.0-edge.4
  - @memberjunction/ng-notifications@6.1.0-edge.4
  - @memberjunction/ai-agent-client@6.1.0-edge.4
  - @memberjunction/ng-auth-services@6.1.0-edge.4
  - @memberjunction/ng-agent-client@6.1.0-edge.4
  - @memberjunction/ng-feedback@6.1.0-edge.4
  - @memberjunction/ng-explorer-service-worker@6.1.0-edge.4

## 6.1.0-edge.3

### Minor Changes

- 048c5ce: feat(auth): metadata-driven pluggable authentication providers

  Authentication providers are now discovered the MJ way — a `@RegisterClass(BaseAuthProvider, 'x')`
  subclass plus a row in the new `MJ: Authentication Providers` entity, resolved at runtime through
  `ClassFactory` by `DriverClass`. Adding a provider requires no core edits.
  - **New entity** `__mj.AuthenticationProvider`, with the OIDC connection fields as columns, an
    optional `CredentialID` for the rare provider needing server-side secrets, and login-picker
    presentation fields. Driver configuration is split by trust boundary: `AdditionalConfiguration`
    is server-only, `ClientConfiguration` is published to the browser.
  - **`AuthProviderEngine`** loads the catalog at startup and registers it with `AuthProviderFactory`.
  - **Layered resolution** — `mj.config.cjs` `authProviders[]` remains fully supported as the baseline
    and fallback, so existing deployments are unaffected and need no changes.
  - **`GET /auth/providers`** publishes the non-secret catalog to the pre-auth browser (rate-limited,
    mounted ahead of the auth middleware, allow-list projection).
  - **`<mj-login-picker>`** — a reusable, app-agnostic multi-IdP picker built on `mjButton`, rendered
    only when 2+ client-visible providers exist. Single-provider deployments look exactly as before.
  - `AuthProviderFactory` no longer carries a hard-wired list of built-in provider imports; the
    package entry point and the class-registration manifests already covered registration.
  - **Environment-variable configuration is now pluggable too.** The hard-coded block in MJServer's
    config that enumerated Entra / Auth0 / Cognito inline is replaced by an optional
    `configFromEnvironment` static on each provider class (`IEnvironmentConfigurableProvider`),
    collected through the ClassFactory registry by `AuthProviderFactory.discoverFromEnvironment()`.
    A third-party provider can now offer the same "set two variables and you're done" experience
    with no change to MJ core. The three existing mappings are preserved byte-for-byte; **Okta**
    (`OKTA_DOMAIN` + `OKTA_CLIENT_ID`) and **WorkOS** (`WORKOS_CLIENT_ID`) gain env-var support they
    did not previously have.

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [3b893b4]
- Updated dependencies [199eb2b]
- Updated dependencies [e7f1f88]
- Updated dependencies [07cb22e]
- Updated dependencies [deea1a3]
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
- Updated dependencies [68b9cf0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
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
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/ng-bootstrap@6.1.0-edge.3
  - @memberjunction/ai-core-plus@6.1.0-edge.3
  - @memberjunction/ng-base-types@6.1.0-edge.3
  - @memberjunction/ng-shared@6.1.0-edge.3
  - @memberjunction/ng-notifications@6.1.0-edge.3
  - @memberjunction/ng-explorer-core@6.1.0-edge.3
  - @memberjunction/ng-auth-services@6.1.0-edge.3
  - @memberjunction/ng-conversations@6.1.0-edge.3
  - @memberjunction/ai-agent-client@6.1.0-edge.3
  - @memberjunction/ng-base-application@6.1.0-edge.3
  - @memberjunction/ng-workspace-initializer@6.1.0-edge.3
  - @memberjunction/ng-agent-client@6.1.0-edge.3
  - @memberjunction/ng-feedback@6.1.0-edge.3
  - @memberjunction/ng-explorer-service-worker@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [2792d97]
- Updated dependencies [255d506]
- Updated dependencies [59def38]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [9fc0e2d]
- Updated dependencies [fccd0b2]
- Updated dependencies [9a29da4]
- Updated dependencies [0967ba7]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [768980d]
- Updated dependencies [1c0d586]
  - @memberjunction/ng-conversations@6.1.0-edge.2
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai-core-plus@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/ng-explorer-core@6.1.0-edge.2
  - @memberjunction/ng-bootstrap@6.1.0-edge.2
  - @memberjunction/ng-base-application@6.1.0-edge.2
  - @memberjunction/ng-shared@6.1.0-edge.2
  - @memberjunction/ng-workspace-initializer@6.1.0-edge.2
  - @memberjunction/ng-base-types@6.1.0-edge.2
  - @memberjunction/ng-notifications@6.1.0-edge.2
  - @memberjunction/ai-agent-client@6.1.0-edge.2
  - @memberjunction/ng-auth-services@6.1.0-edge.2
  - @memberjunction/ng-agent-client@6.1.0-edge.2
  - @memberjunction/ng-feedback@6.1.0-edge.2
  - @memberjunction/ng-explorer-service-worker@6.1.0-edge.2

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
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ng-agent-client@6.1.0-edge.1
  - @memberjunction/ng-auth-services@6.1.0-edge.1
  - @memberjunction/ng-base-application@6.1.0-edge.1
  - @memberjunction/ng-base-types@6.1.0-edge.1
  - @memberjunction/ng-conversations@6.1.0-edge.1
  - @memberjunction/ng-explorer-core@6.1.0-edge.1
  - @memberjunction/ng-explorer-service-worker@6.1.0-edge.1
  - @memberjunction/ng-feedback@6.1.0-edge.1
  - @memberjunction/ng-notifications@6.1.0-edge.1
  - @memberjunction/ng-shared@6.1.0-edge.1
  - @memberjunction/ng-workspace-initializer@6.1.0-edge.1
  - @memberjunction/ai-core-plus@6.1.0-edge.1
  - @memberjunction/ng-bootstrap@6.1.0-edge.1
  - @memberjunction/ai-agent-client@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [b895f92]
- Updated dependencies [b895f92]
- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [ea003fc]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [d26e202]
- Updated dependencies [27e4d09]
- Updated dependencies [8d0d45a]
  - @memberjunction/ng-conversations@6.1.0-edge.0
  - @memberjunction/ng-bootstrap@6.1.0-edge.0
  - @memberjunction/ng-explorer-core@6.1.0-edge.0
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/ng-shared@6.1.0-edge.0
  - @memberjunction/ng-base-application@6.1.0-edge.0
  - @memberjunction/ng-auth-services@6.1.0-edge.0
  - @memberjunction/ng-feedback@6.1.0-edge.0
  - @memberjunction/ng-workspace-initializer@6.1.0-edge.0
  - @memberjunction/ai-core-plus@6.1.0-edge.0
  - @memberjunction/ng-base-types@6.1.0-edge.0
  - @memberjunction/ng-notifications@6.1.0-edge.0
  - @memberjunction/ai-agent-client@6.1.0-edge.0
  - @memberjunction/ng-agent-client@6.1.0-edge.0
  - @memberjunction/ng-explorer-service-worker@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ai-agent-client@6.0.0
  - @memberjunction/ai-core-plus@6.0.0
  - @memberjunction/ng-bootstrap@6.0.0
  - @memberjunction/ng-auth-services@6.0.0
  - @memberjunction/ng-base-application@6.0.0
  - @memberjunction/ng-explorer-core@6.0.0
  - @memberjunction/ng-shared@6.0.0
  - @memberjunction/ng-workspace-initializer@6.0.0
  - @memberjunction/ng-base-types@6.0.0
  - @memberjunction/ng-conversations@6.0.0
  - @memberjunction/ng-feedback@6.0.0
  - @memberjunction/ng-notifications@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/ng-agent-client@6.0.0
  - @memberjunction/ng-explorer-service-worker@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [1e048ef]
- Updated dependencies [a8fc549]
  - @memberjunction/ng-bootstrap@5.51.0
  - @memberjunction/ng-explorer-core@5.51.0
  - @memberjunction/core@5.51.0
  - @memberjunction/ng-shared@5.51.0
  - @memberjunction/ng-workspace-initializer@5.51.0
  - @memberjunction/ai-agent-client@5.51.0
  - @memberjunction/ai-core-plus@5.51.0
  - @memberjunction/ng-auth-services@5.51.0
  - @memberjunction/ng-base-application@5.51.0
  - @memberjunction/ng-base-types@5.51.0
  - @memberjunction/ng-conversations@5.51.0
  - @memberjunction/ng-feedback@5.51.0
  - @memberjunction/ng-notifications@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/ng-agent-client@5.51.0
  - @memberjunction/ng-explorer-service-worker@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [1c991f7]
- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [28c1dcd]
- Updated dependencies [d36131a]
- Updated dependencies [8580aef]
- Updated dependencies [35fb5e3]
- Updated dependencies [abab5dc]
- Updated dependencies [ce6374c]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [fe1b8e7]
- Updated dependencies [dd04a24]
  - @memberjunction/ng-explorer-core@5.50.0
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/ng-conversations@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ai-core-plus@5.50.0
  - @memberjunction/ng-bootstrap@5.50.0
  - @memberjunction/ng-workspace-initializer@5.50.0
  - @memberjunction/ng-base-application@5.50.0
  - @memberjunction/ng-shared@5.50.0
  - @memberjunction/ng-base-types@5.50.0
  - @memberjunction/ng-notifications@5.50.0
  - @memberjunction/ai-agent-client@5.50.0
  - @memberjunction/ng-auth-services@5.50.0
  - @memberjunction/ng-feedback@5.50.0
  - @memberjunction/ng-agent-client@5.50.0
  - @memberjunction/ng-explorer-service-worker@5.50.0

## 5.49.0

### Minor Changes

- c220620: Extend Instance Config coverage to the remaining Explorer shell chrome so white-labeled deployments can hide developer chrome through metadata instead of CSS. New `Shell.Notifications.Enabled`, `Shell.AppSwitcher.Enabled`, `Shell.AppNav.Enabled`, and `Shell.UpdateToasts.Enabled` keys (all default `true`, gating both desktop and mobile), following the existing `Shell.SearchBar.Enabled` pattern; the floating chat-overlay bubble is wired to the pre-existing-but-unread `Shell.ChatOverlay.Enabled` key rather than a new one. Home quick-launch is deliberately excluded (already controllable via Applications metadata/roles).

### Patch Changes

- Updated dependencies [d3f9d77]
- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [02c8a15]
- Updated dependencies [505c8b5]
- Updated dependencies [1a15bd2]
- Updated dependencies [b52ffa8]
- Updated dependencies [85575cf]
- Updated dependencies [14e2117]
- Updated dependencies [3993034]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [c220620]
- Updated dependencies [70c658c]
  - @memberjunction/ng-explorer-core@5.49.0
  - @memberjunction/core@5.49.0
  - @memberjunction/ai-core-plus@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/ng-conversations@5.49.0
  - @memberjunction/ng-bootstrap@5.49.0
  - @memberjunction/ng-workspace-initializer@5.49.0
  - @memberjunction/ng-feedback@5.49.0
  - @memberjunction/ai-agent-client@5.49.0
  - @memberjunction/ng-auth-services@5.49.0
  - @memberjunction/ng-base-application@5.49.0
  - @memberjunction/ng-shared@5.49.0
  - @memberjunction/ng-base-types@5.49.0
  - @memberjunction/ng-notifications@5.49.0
  - @memberjunction/ng-agent-client@5.49.0
  - @memberjunction/ng-explorer-service-worker@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [c20723a]
- Updated dependencies [bda123a]
- Updated dependencies [f613d0d]
- Updated dependencies [d1e1a15]
  - @memberjunction/ng-conversations@5.48.0
  - @memberjunction/ng-explorer-core@5.48.0
  - @memberjunction/core@5.48.0
  - @memberjunction/ng-shared@5.48.0
  - @memberjunction/ng-bootstrap@5.48.0
  - @memberjunction/ng-workspace-initializer@5.48.0
  - @memberjunction/ai-agent-client@5.48.0
  - @memberjunction/ai-core-plus@5.48.0
  - @memberjunction/ng-auth-services@5.48.0
  - @memberjunction/ng-base-application@5.48.0
  - @memberjunction/ng-base-types@5.48.0
  - @memberjunction/ng-feedback@5.48.0
  - @memberjunction/ng-notifications@5.48.0
  - @memberjunction/ng-agent-client@5.48.0
  - @memberjunction/ng-explorer-service-worker@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/ai-agent-client@5.47.0
  - @memberjunction/ai-core-plus@5.47.0
  - @memberjunction/ng-bootstrap@5.47.0
  - @memberjunction/ng-auth-services@5.47.0
  - @memberjunction/ng-base-application@5.47.0
  - @memberjunction/ng-explorer-core@5.47.0
  - @memberjunction/ng-shared@5.47.0
  - @memberjunction/ng-workspace-initializer@5.47.0
  - @memberjunction/ng-base-types@5.47.0
  - @memberjunction/ng-conversations@5.47.0
  - @memberjunction/ng-feedback@5.47.0
  - @memberjunction/ng-notifications@5.47.0
  - @memberjunction/ng-agent-client@5.47.0
  - @memberjunction/ng-explorer-service-worker@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
  - @memberjunction/core@5.46.0
  - @memberjunction/ai-agent-client@5.46.0
  - @memberjunction/ai-core-plus@5.46.0
  - @memberjunction/ng-bootstrap@5.46.0
  - @memberjunction/ng-auth-services@5.46.0
  - @memberjunction/ng-base-application@5.46.0
  - @memberjunction/ng-explorer-core@5.46.0
  - @memberjunction/ng-shared@5.46.0
  - @memberjunction/ng-workspace-initializer@5.46.0
  - @memberjunction/ng-base-types@5.46.0
  - @memberjunction/ng-conversations@5.46.0
  - @memberjunction/ng-feedback@5.46.0
  - @memberjunction/ng-notifications@5.46.0
  - @memberjunction/ng-agent-client@5.46.0
  - @memberjunction/ng-explorer-service-worker@5.46.0

## 5.45.1

### Patch Changes

- Updated dependencies [572d219]
  - @memberjunction/ai-core-plus@5.45.1
  - @memberjunction/ng-conversations@5.45.1
  - @memberjunction/ng-bootstrap@5.45.1
  - @memberjunction/ng-explorer-core@5.45.1
  - @memberjunction/ng-shared@5.45.1
  - @memberjunction/ng-workspace-initializer@5.45.1
  - @memberjunction/ai-agent-client@5.45.1
  - @memberjunction/ng-feedback@5.45.1
  - @memberjunction/ng-notifications@5.45.1
  - @memberjunction/ng-agent-client@5.45.1
  - @memberjunction/ng-auth-services@5.45.1
  - @memberjunction/ng-base-application@5.45.1
  - @memberjunction/ng-explorer-service-worker@5.45.1
  - @memberjunction/ng-base-types@5.45.1
  - @memberjunction/core@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [13716e4]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [6e10f66]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [ad9f4a3]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/ng-bootstrap@5.45.0
  - @memberjunction/ng-conversations@5.45.0
  - @memberjunction/ng-explorer-core@5.45.0
  - @memberjunction/ai-core-plus@5.45.0
  - @memberjunction/ai-agent-client@5.45.0
  - @memberjunction/ng-auth-services@5.45.0
  - @memberjunction/ng-base-application@5.45.0
  - @memberjunction/ng-shared@5.45.0
  - @memberjunction/ng-workspace-initializer@5.45.0
  - @memberjunction/ng-base-types@5.45.0
  - @memberjunction/ng-feedback@5.45.0
  - @memberjunction/ng-notifications@5.45.0
  - @memberjunction/ng-agent-client@5.45.0
  - @memberjunction/ng-explorer-service-worker@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [3633fbb]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [f8be8a0]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [914acd4]
- Updated dependencies [18b5bf0]
- Updated dependencies [be5ab50]
- Updated dependencies [45df197]
- Updated dependencies [aa9102d]
- Updated dependencies [0476455]
- Updated dependencies [2f9b863]
  - @memberjunction/ai-agent-client@5.44.0
  - @memberjunction/ai-core-plus@5.44.0
  - @memberjunction/ng-conversations@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/ng-explorer-core@5.44.0
  - @memberjunction/ng-shared@5.44.0
  - @memberjunction/ng-auth-services@5.44.0
  - @memberjunction/ng-bootstrap@5.44.0
  - @memberjunction/ng-agent-client@5.44.0
  - @memberjunction/ng-workspace-initializer@5.44.0
  - @memberjunction/ng-feedback@5.44.0
  - @memberjunction/ng-notifications@5.44.0
  - @memberjunction/ng-base-application@5.44.0
  - @memberjunction/ng-base-types@5.44.0
  - @memberjunction/ng-explorer-service-worker@5.44.0

## 5.43.0

### Patch Changes

- a95ef89: fix(open-app): `mj app` runtime-load + lifecycle correctness, plus installer/Explorer fixes

  The next-applicable subset of the OpenApp lifecycle audit — runtime-load and install/upgrade/remove correctness — across four packages:
  - **`@memberjunction/open-app-engine`.** Makes an installed Open App actually take effect and the lifecycle reversible/repeatable: installed server packages load at boot from `dynamicPackages.server[]` (and their generated GraphQL resolvers enter the live schema), and installed client packages are recorded in `dynamicPackages.client[]`; install status + reinstall correctness (npm-install failure leaves the app `Disabled` not falsely `Active`; an `Error`-state app is reinstallable; rollback drops only a schema we created; migrations baseline so a `V1` migration is never skipped); atomic upgrade dependency rewrite; and remove data-safety (DB-first ordering, co-tenant shared-schema guard, and metadata cleanup committed in one transaction on PostgreSQL). Also removes an app's **own `Application` row on uninstall** — an app's metadata-sync migration registers an `Application` (fixed UUID) grouping its entities; removal previously left it orphaned, so a reinstall's migration re-`INSERT`ed the same UUID and failed on `PK_Application_ID`. Removal now deletes an Application **wholly owned** by the removed schema (best-effort, after the atomic metadata commit; an Application that also groups other apps' entities, or one with user-added dependents, is left intact and reused). +unit tests.
  - **`@memberjunction/cli`.** The Open App client load mechanism now lives in distributed packages instead of bespoke MJExplorer files. `mj codegen manifest` gains `--open-app-client-bootstrap`: after generating the class-registrations manifest, it appends a managed, idempotent block of side-effect imports — one per installed Open App client package recorded in `dynamicPackages.client[]` — so the apps' `@RegisterClass` decorators run when the client bundle loads. The block is rebuilt on every run, so it tracks install/remove/enable/disable (each of which edits `dynamicPackages.client`). This lets MJExplorer drop its hand-written `ensure-open-app-bootstrap.mjs` script, the separate generated bootstrap file, and the extra `app.module.ts` import — keeping the app paper-thin (changes there don't auto-distribute like npm packages). +unit tests for the pure block transform.
  - **`@memberjunction/installer`.** The configure phase wrote a real `.env` (DB credentials, API keys) but emitted no `.gitignore`, so a freshly scaffolded project could commit secrets via `git init && git add .`. It now guarantees a `.gitignore` ignoring `.env`/`.env.*` (keeping `.env.example`); idempotent — appends only missing entries, never rewriting user lines.
  - **`@memberjunction/ng-explorer-app`.** Fixes an MJExplorer login crash where `MJNotificationService.Instance` was read before DI constructed the singleton (surfaced by magic-link's instant, no-redirect login) — the service is now injected into `MJExplorerAppComponent` so it's constructed before `handleLogin` runs.

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
- Updated dependencies [3eaa05a]
  - @memberjunction/core@5.43.0
  - @memberjunction/ai-core-plus@5.43.0
  - @memberjunction/ng-conversations@5.43.0
  - @memberjunction/ai-agent-client@5.43.0
  - @memberjunction/ng-bootstrap@5.43.0
  - @memberjunction/ng-auth-services@5.43.0
  - @memberjunction/ng-base-application@5.43.0
  - @memberjunction/ng-explorer-core@5.43.0
  - @memberjunction/ng-shared@5.43.0
  - @memberjunction/ng-workspace-initializer@5.43.0
  - @memberjunction/ng-base-types@5.43.0
  - @memberjunction/ng-feedback@5.43.0
  - @memberjunction/ng-notifications@5.43.0
  - @memberjunction/ng-agent-client@5.43.0
  - @memberjunction/ng-explorer-service-worker@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [313c1c5]
- Updated dependencies [256ab06]
- Updated dependencies [9b9b484]
- Updated dependencies [e7c2437]
- Updated dependencies [08c016c]
- Updated dependencies [5fde509]
- Updated dependencies [4ec1732]
- Updated dependencies [2f225e4]
- Updated dependencies [0fa3cbc]
- Updated dependencies [e4235fd]
- Updated dependencies [3ee0f22]
- Updated dependencies [a5d4a15]
- Updated dependencies [da5a3dd]
  - @memberjunction/ng-explorer-core@5.42.0
  - @memberjunction/ai-core-plus@5.42.0
  - @memberjunction/core@5.42.0
  - @memberjunction/ng-conversations@5.42.0
  - @memberjunction/ng-bootstrap@5.42.0
  - @memberjunction/ng-feedback@5.42.0
  - @memberjunction/ng-workspace-initializer@5.42.0
  - @memberjunction/ng-shared@5.42.0
  - @memberjunction/ai-agent-client@5.42.0
  - @memberjunction/ng-auth-services@5.42.0
  - @memberjunction/ng-base-application@5.42.0
  - @memberjunction/ng-base-types@5.42.0
  - @memberjunction/ng-notifications@5.42.0
  - @memberjunction/ng-agent-client@5.42.0
  - @memberjunction/ng-explorer-service-worker@5.42.0

## 5.41.0

### Minor Changes

- cd6c5f0: Realtime AI Agents wave 3: consolidated v5.41 migration (sessions, channels, co-agent schema) with the AIAgentCoAgent affinity registry replacing AIAgentPairedAgent — typed relationship vocabulary (CoAgent implemented; Peer/Delegate/Fallback/Reviewer/Observer reserved), type-level co-agent defaults as junction rows (removing the only FK cycle in core MJ), and the full code sweep (engine cache, resolver resolution chain, server-side invariants, client pairing reads, regenerated manifests). Realtime UX: progressive-disclosure voice console with persisted captions preference, user-owned composer and tabs toggles, audio-reactive visuals; whiteboard pages/multi-select and review-persistence fixes. Gemini Live triggering turns ride realtime text so widget clicks/typed input/narration speak immediately on native-audio models. CodeGen: single-winner IsNameField enforcement with eligibility guardrail fixes, SCC-based cycle diagnostics, and clean-database bootstrap robustness (conditional engine registry datasets).

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [6f227ab]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [4b30726]
- Updated dependencies [ef5a5d7]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
- Updated dependencies [1568bae]
- Updated dependencies [4b3fb9d]
- Updated dependencies [fb2a22f]
- Updated dependencies [c5d93a0]
  - @memberjunction/core@5.41.0
  - @memberjunction/ng-conversations@5.41.0
  - @memberjunction/ng-bootstrap@5.41.0
  - @memberjunction/ai-core-plus@5.41.0
  - @memberjunction/ng-notifications@5.41.0
  - @memberjunction/ai-agent-client@5.41.0
  - @memberjunction/ng-auth-services@5.41.0
  - @memberjunction/ng-base-application@5.41.0
  - @memberjunction/ng-explorer-core@5.41.0
  - @memberjunction/ng-shared@5.41.0
  - @memberjunction/ng-workspace-initializer@5.41.0
  - @memberjunction/ng-base-types@5.41.0
  - @memberjunction/ng-feedback@5.41.0
  - @memberjunction/ng-agent-client@5.41.0
  - @memberjunction/ng-explorer-service-worker@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ng-bootstrap@5.40.2
- @memberjunction/ng-explorer-core@5.40.2
- @memberjunction/ng-conversations@5.40.2
- @memberjunction/ng-workspace-initializer@5.40.2
- @memberjunction/ai-agent-client@5.40.2
- @memberjunction/ai-core-plus@5.40.2
- @memberjunction/ng-auth-services@5.40.2
- @memberjunction/ng-base-application@5.40.2
- @memberjunction/ng-explorer-service-worker@5.40.2
- @memberjunction/ng-shared@5.40.2
- @memberjunction/ng-agent-client@5.40.2
- @memberjunction/ng-base-types@5.40.2
- @memberjunction/ng-feedback@5.40.2
- @memberjunction/ng-notifications@5.40.2
- @memberjunction/core@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ai-agent-client@5.40.1
  - @memberjunction/ai-core-plus@5.40.1
  - @memberjunction/ng-bootstrap@5.40.1
  - @memberjunction/ng-auth-services@5.40.1
  - @memberjunction/ng-base-application@5.40.1
  - @memberjunction/ng-explorer-core@5.40.1
  - @memberjunction/ng-shared@5.40.1
  - @memberjunction/ng-workspace-initializer@5.40.1
  - @memberjunction/ng-base-types@5.40.1
  - @memberjunction/ng-conversations@5.40.1
  - @memberjunction/ng-feedback@5.40.1
  - @memberjunction/ng-notifications@5.40.1
  - @memberjunction/ng-agent-client@5.40.1
  - @memberjunction/ng-explorer-service-worker@5.40.1

## 5.40.0

### Minor Changes

- 253a188: Knowledge Hub Classify redesign
  - **Clustering**: new `@memberjunction/clustering-engine` (framework-agnostic fetch → cluster → reduce → LLM-name pipeline), a "Run Cluster Analysis" action, a `RunClusterAnalysis` GraphQL resolver, a `GraphQLClusterClient` transport, and the Angular `ClusteringService` thinned to delegate to the server.
  - **View-type plug-in architecture (entity viewer)**: `ViewType` registry + `ViewTypeEngine` + `IViewTypeDescriptor`/`IViewRenderer`/`IViewPropSheet` contracts in `ng-entity-viewer`, with Grid/Cards/Timeline/Map descriptors. The host now **dynamic-mounts** any registered plug-in view type (via `ViewContainerRef`) with zero host changes, and the switcher shows the active type's icon + label, collapsing from an icon strip to a dropdown as the list grows. **Cluster view type** added in `@memberjunction/ng-clustering` (descriptor + `IViewRenderer` wrapper over the scatter + `IViewPropSheet` + an Entity-Document availability engine) — available on any entity with vectors, reusing the same `ClusteringService`. The active view type persists to `UserView.ViewTypeID` (new source of truth; backfilled from the legacy `DisplayState.defaultMode`) and per-view-type config to `UserView.DisplayState.viewTypeConfigs` (new typed `IViewTypeConfigEntry`). `ViewType.Icon` is now `ExtendedType='Icon'` for the admin icon picker. See `packages/Angular/Generic/entity-viewer/VIEW_TYPE_PLUGINS.md`.
  - **Classify UX**: per-tab scroll fix, Refresh buttons, meaningful content-item display names, loading states, `BaseEntityEvent` reactivity, and load-more pagination.
  - **Audit & analytics**: direct tag→prompt-run lineage (`AIPromptRunID` + `Reasoning` on Content Item Tags), `ClassifyAnalyticsEngine`, reusable item grid + drilldown, and an Overview analytics section.
  - **Setup & onboarding**: contextual prompt injection (org/content-type/source aggregation), `generateSeedTaxonomy` (clustering-backed) + resolver, source-form domain-context UI, org-context editor, inline Entity Document creation, seed-taxonomy review, and a guided setup wizard.
  - **Visualize surface**: Knowledge Hub "Clusters" tab generalized to a "Visualize" host with Clusters / Tag Cloud modes, a `TagCloudEngine`, and a shared record drilldown.
  - **Foundations**: `ApplicationSettingEngine` (global + app-scoped settings), and the `tag-engine` → `tag-engine-base` split so browser code no longer pulls server-only AI dependencies.
  - **Fix**: stop server-only packages (`templates` → `aiengine`/`ai-provider-bundle`, storage, vector-DB and LLM provider SDKs) from leaking into the browser class-registration manifest, which previously broke the MJExplorer cold build. Added CLAUDE.md guardrails to the Bootstrap and BootstrapLite packages.

### Patch Changes

- 7bbfd62: Add PreShellGuard for request-scoped TenantContext and auth fixes in MJServer CurrentUserContextResolver
- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [7bbfd62]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
- Updated dependencies [40e90fa]
- Updated dependencies [6957711]
  - @memberjunction/core@5.40.0
  - @memberjunction/ng-bootstrap@5.40.0
  - @memberjunction/ng-auth-services@5.40.0
  - @memberjunction/ng-explorer-core@5.40.0
  - @memberjunction/ng-shared@5.40.0
  - @memberjunction/ng-conversations@5.40.0
  - @memberjunction/ai-agent-client@5.40.0
  - @memberjunction/ai-core-plus@5.40.0
  - @memberjunction/ng-base-application@5.40.0
  - @memberjunction/ng-workspace-initializer@5.40.0
  - @memberjunction/ng-base-types@5.40.0
  - @memberjunction/ng-feedback@5.40.0
  - @memberjunction/ng-notifications@5.40.0
  - @memberjunction/ng-agent-client@5.40.0
  - @memberjunction/ng-explorer-service-worker@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [bd95e83]
- Updated dependencies [3c53858]
- Updated dependencies [3b29882]
- Updated dependencies [d1cc0ad]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [9bc2916]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/ng-explorer-core@5.39.0
  - @memberjunction/ai-core-plus@5.39.0
  - @memberjunction/ng-bootstrap@5.39.0
  - @memberjunction/ai-agent-client@5.39.0
  - @memberjunction/ng-auth-services@5.39.0
  - @memberjunction/ng-base-application@5.39.0
  - @memberjunction/ng-shared@5.39.0
  - @memberjunction/ng-workspace-initializer@5.39.0
  - @memberjunction/ng-base-types@5.39.0
  - @memberjunction/ng-conversations@5.39.0
  - @memberjunction/ng-feedback@5.39.0
  - @memberjunction/ng-notifications@5.39.0
  - @memberjunction/ng-agent-client@5.39.0
  - @memberjunction/ng-explorer-service-worker@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [6b6c321]
- Updated dependencies [67d6562]
- Updated dependencies [4ee0b06]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [6a571d3]
- Updated dependencies [275afda]
- Updated dependencies [d285996]
- Updated dependencies [8bd97f3]
- Updated dependencies [6a3ac36]
- Updated dependencies [918d663]
- Updated dependencies [c0b40c0]
- Updated dependencies [b2e6782]
- Updated dependencies [d5a51b3]
- Updated dependencies [a529993]
- Updated dependencies [60947be]
- Updated dependencies [2ee14f1]
- Updated dependencies [ebb0e3d]
  - @memberjunction/ai-core-plus@5.38.0
  - @memberjunction/ng-base-application@5.38.0
  - @memberjunction/core@5.38.0
  - @memberjunction/ng-shared@5.38.0
  - @memberjunction/ng-explorer-core@5.38.0
  - @memberjunction/ng-conversations@5.38.0
  - @memberjunction/ng-workspace-initializer@5.38.0
  - @memberjunction/ng-bootstrap@5.38.0
  - @memberjunction/ai-agent-client@5.38.0
  - @memberjunction/ng-auth-services@5.38.0
  - @memberjunction/ng-base-types@5.38.0
  - @memberjunction/ng-feedback@5.38.0
  - @memberjunction/ng-notifications@5.38.0
  - @memberjunction/ng-agent-client@5.38.0
  - @memberjunction/ng-explorer-service-worker@5.38.0

## 5.37.0

### Patch Changes

- 86a9d0e: Make the floating chat-agents overlay bubble user-draggable (mouse, touch, or pen) so it can be moved out of the way of underlying app buttons it would otherwise occlude. Position persists per-user; the expanded panel anchors to the bubble's location and clamps so the chat interface always stays visible. MJExplorer passes its shell-header height as a top boundary so the bubble cannot be dragged into the header.
- Updated dependencies [86a9d0e]
- Updated dependencies [22b775f]
- Updated dependencies [4f15f31]
  - @memberjunction/ng-conversations@5.37.0
  - @memberjunction/ai-core-plus@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/ai-agent-client@5.37.0
  - @memberjunction/ng-bootstrap@5.37.0
  - @memberjunction/ng-explorer-core@5.37.0
  - @memberjunction/ng-shared@5.37.0
  - @memberjunction/ng-workspace-initializer@5.37.0
  - @memberjunction/ng-feedback@5.37.0
  - @memberjunction/ng-notifications@5.37.0
  - @memberjunction/ng-auth-services@5.37.0
  - @memberjunction/ng-base-application@5.37.0
  - @memberjunction/ng-base-types@5.37.0
  - @memberjunction/ng-agent-client@5.37.0
  - @memberjunction/ng-explorer-service-worker@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/ng-explorer-core@5.36.0
  - @memberjunction/ng-bootstrap@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ai-agent-client@5.36.0
  - @memberjunction/ng-shared@5.36.0
  - @memberjunction/ng-workspace-initializer@5.36.0
  - @memberjunction/ng-conversations@5.36.0
  - @memberjunction/ng-feedback@5.36.0
  - @memberjunction/ng-notifications@5.36.0
  - @memberjunction/ai-core-plus@5.36.0
  - @memberjunction/ng-base-application@5.36.0
  - @memberjunction/ng-base-types@5.36.0
  - @memberjunction/ng-auth-services@5.36.0
  - @memberjunction/ng-agent-client@5.36.0
  - @memberjunction/ng-explorer-service-worker@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [2c905e3]
- Updated dependencies [c1f1cad]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [383784c]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/ng-conversations@5.35.0
  - @memberjunction/ai-agent-client@5.35.0
  - @memberjunction/ai-core-plus@5.35.0
  - @memberjunction/ng-shared@5.35.0
  - @memberjunction/ng-explorer-core@5.35.0
  - @memberjunction/ng-bootstrap@5.35.0
  - @memberjunction/ng-auth-services@5.35.0
  - @memberjunction/ng-base-application@5.35.0
  - @memberjunction/ng-workspace-initializer@5.35.0
  - @memberjunction/ng-base-types@5.35.0
  - @memberjunction/ng-feedback@5.35.0
  - @memberjunction/ng-notifications@5.35.0
  - @memberjunction/ng-agent-client@5.35.0
  - @memberjunction/ng-explorer-service-worker@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
- Updated dependencies [5abf790]
  - @memberjunction/core@5.34.1
  - @memberjunction/ng-base-application@5.34.1
  - @memberjunction/ai-core-plus@5.34.1
  - @memberjunction/ai-agent-client@5.34.1
  - @memberjunction/ng-bootstrap@5.34.1
  - @memberjunction/ng-auth-services@5.34.1
  - @memberjunction/ng-explorer-core@5.34.1
  - @memberjunction/ng-shared@5.34.1
  - @memberjunction/ng-workspace-initializer@5.34.1
  - @memberjunction/ng-base-types@5.34.1
  - @memberjunction/ng-conversations@5.34.1
  - @memberjunction/ng-feedback@5.34.1
  - @memberjunction/ng-notifications@5.34.1
  - @memberjunction/ng-agent-client@5.34.1
  - @memberjunction/ng-explorer-service-worker@5.34.1

## 5.34.0

### Patch Changes

- b03bfb4: Replace hardcoded colors with semantic design tokens across Angular components and shared styles, restoring correct dark-mode behavior and enabling white-labeling. Also maps the System Diagnostics PerfMon chrome (background, borders, text, controls) to MJ semantic tokens so the panel adapts to the active theme; series colors stay categorical.
- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [b03bfb4]
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [a6a16fa]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [ad61267]
- Updated dependencies [72cb92e]
  - @memberjunction/ng-bootstrap@5.34.0
  - @memberjunction/ng-explorer-core@5.34.0
  - @memberjunction/ai-agent-client@5.34.0
  - @memberjunction/ai-core-plus@5.34.0
  - @memberjunction/ng-auth-services@5.34.0
  - @memberjunction/ng-base-application@5.34.0
  - @memberjunction/ng-explorer-service-worker@5.34.0
  - @memberjunction/ng-shared@5.34.0
  - @memberjunction/ng-workspace-initializer@5.34.0
  - @memberjunction/ng-agent-client@5.34.0
  - @memberjunction/ng-base-types@5.34.0
  - @memberjunction/ng-conversations@5.34.0
  - @memberjunction/ng-feedback@5.34.0
  - @memberjunction/ng-notifications@5.34.0
  - @memberjunction/core@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [97ed790]
- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/ng-explorer-core@5.33.0
  - @memberjunction/core@5.33.0
  - @memberjunction/ng-bootstrap@5.33.0
  - @memberjunction/ng-workspace-initializer@5.33.0
  - @memberjunction/ai-agent-client@5.33.0
  - @memberjunction/ng-shared@5.33.0
  - @memberjunction/ng-conversations@5.33.0
  - @memberjunction/ng-feedback@5.33.0
  - @memberjunction/ng-notifications@5.33.0
  - @memberjunction/ai-core-plus@5.33.0
  - @memberjunction/ng-auth-services@5.33.0
  - @memberjunction/ng-base-application@5.33.0
  - @memberjunction/ng-base-types@5.33.0
  - @memberjunction/ng-agent-client@5.33.0
  - @memberjunction/ng-explorer-service-worker@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ai-agent-client@5.32.0
  - @memberjunction/ai-core-plus@5.32.0
  - @memberjunction/ng-bootstrap@5.32.0
  - @memberjunction/ng-auth-services@5.32.0
  - @memberjunction/ng-base-application@5.32.0
  - @memberjunction/ng-explorer-core@5.32.0
  - @memberjunction/ng-shared@5.32.0
  - @memberjunction/ng-workspace-initializer@5.32.0
  - @memberjunction/ng-base-types@5.32.0
  - @memberjunction/ng-conversations@5.32.0
  - @memberjunction/ng-feedback@5.32.0
  - @memberjunction/ng-notifications@5.32.0
  - @memberjunction/ng-agent-client@5.32.0
  - @memberjunction/ng-explorer-service-worker@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- cc2dea9: Add service worker app-shell pre-cache for MJExplorer-style apps via new shipped package `@memberjunction/ng-explorer-service-worker`. Targets ~700ms perceived warm-load improvement by serving the JS/CSS/HTML shell from a local cache on subsequent visits.

  **New package** `@memberjunction/ng-explorer-service-worker`:
  - `MJServiceWorkerModule.forRoot({ enabled, pollIntervalMs })` wraps `ServiceWorkerModule.register` with `registerWhenStable:30000`.
  - `UpdateNotificationService` — RxJS wrapper around `SwUpdate.versionUpdates`. Auto-polls every 15 minutes (default) while the tab is visible; suspends polling when hidden; fires an immediate check when the tab regains visibility. Exposes `window.__mjUpdateNotificationService__` debug hook for ops/QA console use.
  - `<mj-update-notification>` standalone toast — slide-up entrance, pulsing brand-tinted icon, two-line title/subtitle, "Reload now" + "Later" + × close. All MJ design tokens, `prefers-reduced-motion` aware.
  - `ngsw-config.json` shipped at the package root — pre-tuned (app-shell prefetch, lazy assets, GraphQL/auth/MSAL exclusions). Cache strategy updates flow to consumers via `npm update`.

  **Wired into `@memberjunction/ng-explorer-app`**: `MJExplorerAppModule.forRoot(environment)` now internally calls `MJServiceWorkerModule.forRoot({ enabled: production && enableServiceWorker })` and renders `<mj-update-notification />` in the shell. Consumers get SW + UI transparently — no `app.module.ts` / `app.component.ts` edits required. Adds `@memberjunction/ng-explorer-service-worker` as a regular dep (transitively pulls in `@angular/service-worker`).

  **Typed kill switch**: `enableServiceWorker?: boolean` added to `MJEnvironmentConfig` in `@memberjunction/ng-bootstrap` with JSDoc. When false (default) or `production: false`, no SW is registered — app behaves exactly as today. Combined gate is `production && enableServiceWorker`.

  **Consumer enablement (two opt-in edits, both required)**:
  1. `angular.json` production config: `"serviceWorker": "../../node_modules/@memberjunction/ng-explorer-service-worker/ngsw-config.json"`
  2. `environment.ts`: `enableServiceWorker: true`

  Either omitted = no SW. No code changes required in MJExplorer or any downstream consumer.

  **Safety**: Single-line kill switch in `environment.ts` plus removal of the `serviceWorker` line from `angular.json` fully disables the system. Worst-case incident response is one config flip + redeploy. Failure mode is bounded — users see the previous working version until reload.

  **Verified end-to-end locally** across multiple successive prod-build cycles: SW registration, asset caching, manifest detection on tab refocus, manual `checkForUpdate()` from console, downloaded-version waiting state, reload-to-activate, wipe-and-reinstall recovery. 11 unit tests cover the service. See plan doc `plans/service-worker-app-shell.md` for design rationale, mermaid diagrams, and honest pros/cons review.

  Remaining work (post-merge, tracked in plan doc): ops runbook, cross-browser smoke (Safari iOS, Firefox, Edge), staged production rollout, copy cleanup of `(test build #N)` markers left in toast text from verification cycles.

- 0e3365f: Unify the theme storage system to a single localStorage key (`mj-theme`) and eliminate the brief light-mode flash dark-mode users saw on every page load.

  **Root cause of the original flash:** the inline pre-paint script in `index.html` correctly set `data-theme` on first paint based on the user's preference, but `MJExplorerAppComponent.applyLoginTheme()` then ran during Angular bootstrap and re-read a _different_ localStorage key (`'mj-login-theme'`), overriding the script's correct decision before `ThemeService` eventually overrode it back. Result: visible flash on every reload.

  **Fix:** all three theme-aware paths now read/write the same `mj-theme` key.

  `@memberjunction/ng-shared-generic`:
  - `ThemeService.applyBaseThemeAttribute()` mirrors the resolved base theme (`light` or `dark`) to `localStorage['mj-theme']` on every theme application — including initial load from server preference, manual `SetTheme()` calls, and OS-change responses for `'system'` preference. The mirrored value is the _resolved_ base, so the inline pre-paint script can apply the right theme synchronously without needing to read server preference or evaluate `'system'`.
  - `ThemeService.Reset()` deliberately preserves the key (commented why) so the login screen retains the correct theme through logout.

  `@memberjunction/ng-auth-services`:
  - `MJExplorerAuthBase.preservedLocalStorageKeys` now contains `'mj-theme'` (was `'mj-login-theme'`) so the unified key survives logout.

  `@memberjunction/ng-explorer-app`:
  - `MJExplorerAppComponent.THEME_STORAGE_KEY` changed from `'mj-login-theme'` to `'mj-theme'`. The login-screen toggle (`ToggleTheme()`) now writes the unified key. `applyLoginTheme()` reads the unified key with the same lookup the inline script uses, so Angular bootstrap doesn't override the script's decision.

  `@memberjunction/ng-explorer-service-worker`:
  - README backport snippet updated to read only `mj-theme`.

  **Migration impact:** Users with `mj-theme` already populated (most logged-in users after the previous Option B work) see zero impact and instant correct theme on every reload. Users with only the legacy `mj-login-theme` from older versions see one flash on their first visit after this lands; `ThemeService` then writes `mj-theme` on next theme application and they're flash-free forever after. The legacy fallback read was deliberately dropped for code simplicity — the one-time migration flash is an acceptable cost.

  Verified end-to-end via Playwright in a logged-in browser session against a production build: `data-theme` is correctly set at `DOMContentLoaded` and stays consistent through Angular bootstrap. No flash observed. Logout/preserve unit tests in `@memberjunction/ng-auth-services` updated and all 5 pass.

- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [cc2dea9]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
- Updated dependencies [0e3365f]
  - @memberjunction/ai-agent-client@5.31.0
  - @memberjunction/ai-core-plus@5.31.0
  - @memberjunction/ng-bootstrap@5.31.0
  - @memberjunction/ng-auth-services@5.31.0
  - @memberjunction/ng-base-application@5.31.0
  - @memberjunction/ng-explorer-core@5.31.0
  - @memberjunction/ng-shared@5.31.0
  - @memberjunction/ng-workspace-initializer@5.31.0
  - @memberjunction/ng-agent-client@5.31.0
  - @memberjunction/ng-base-types@5.31.0
  - @memberjunction/ng-conversations@5.31.0
  - @memberjunction/ng-feedback@5.31.0
  - @memberjunction/ng-notifications@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/ng-explorer-service-worker@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai-agent-client@5.30.1
- @memberjunction/ai-core-plus@5.30.1
- @memberjunction/ng-bootstrap@5.30.1
- @memberjunction/ng-auth-services@5.30.1
- @memberjunction/ng-base-application@5.30.1
- @memberjunction/ng-explorer-core@5.30.1
- @memberjunction/ng-shared@5.30.1
- @memberjunction/ng-workspace-initializer@5.30.1
- @memberjunction/ng-agent-client@5.30.1
- @memberjunction/ng-conversations@5.30.1
- @memberjunction/ng-feedback@5.30.1
- @memberjunction/ng-notifications@5.30.1
- @memberjunction/core@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
- Updated dependencies [216ddc3]
  - @memberjunction/core@5.30.0
  - @memberjunction/ai-core-plus@5.30.0
  - @memberjunction/ng-bootstrap@5.30.0
  - @memberjunction/ng-explorer-core@5.30.0
  - @memberjunction/ng-conversations@5.30.0
  - @memberjunction/ng-base-application@5.30.0
  - @memberjunction/ng-shared@5.30.0
  - @memberjunction/ng-notifications@5.30.0
  - @memberjunction/ai-agent-client@5.30.0
  - @memberjunction/ng-auth-services@5.30.0
  - @memberjunction/ng-workspace-initializer@5.30.0
  - @memberjunction/ng-feedback@5.30.0
  - @memberjunction/ng-agent-client@5.30.0

## 5.29.0

### Patch Changes

- 5c7a57f: Add in-app feedback system with mj-dialog UI, GitHub App authentication for issue creation, and shell header integration. Feedback submissions create formatted GitHub issues with labels, severity, environment info, and browser details.
- Updated dependencies [5c7a57f]
- Updated dependencies [e02e24e]
- Updated dependencies [98bad3a]
  - @memberjunction/ng-feedback@5.29.0
  - @memberjunction/ng-explorer-core@5.29.0
  - @memberjunction/ng-bootstrap@5.29.0
  - @memberjunction/core@5.29.0
  - @memberjunction/ng-conversations@5.29.0
  - @memberjunction/ng-workspace-initializer@5.29.0
  - @memberjunction/ai-agent-client@5.29.0
  - @memberjunction/ai-core-plus@5.29.0
  - @memberjunction/ng-auth-services@5.29.0
  - @memberjunction/ng-base-application@5.29.0
  - @memberjunction/ng-shared@5.29.0
  - @memberjunction/ng-notifications@5.29.0
  - @memberjunction/ng-agent-client@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [2542615]
- Updated dependencies [115e4da]
  - @memberjunction/ng-shared@5.28.0
  - @memberjunction/core@5.28.0
  - @memberjunction/ng-bootstrap@5.28.0
  - @memberjunction/ng-explorer-core@5.28.0
  - @memberjunction/ng-workspace-initializer@5.28.0
  - @memberjunction/ai-agent-client@5.28.0
  - @memberjunction/ai-core-plus@5.28.0
  - @memberjunction/ng-auth-services@5.28.0
  - @memberjunction/ng-base-application@5.28.0
  - @memberjunction/ng-conversations@5.28.0
  - @memberjunction/ng-notifications@5.28.0
  - @memberjunction/ng-agent-client@5.28.0

## 5.27.1

### Patch Changes

- 6c39ff0: Replace 30s polling heartbeat with socket-primary server connectivity, using /healthcheck only as a fallback when the GraphQL socket is disconnected. Fix CORS on the /healthcheck route and derive the health URL via `new URL('/healthcheck', base)` so it resolves correctly regardless of the GRAPHQL_URI suffix.
- Updated dependencies [6c39ff0]
  - @memberjunction/ng-explorer-core@5.27.1
  - @memberjunction/ai-agent-client@5.27.1
  - @memberjunction/ai-core-plus@5.27.1
  - @memberjunction/ng-auth-services@5.27.1
  - @memberjunction/ng-base-application@5.27.1
  - @memberjunction/ng-shared@5.27.1
  - @memberjunction/ng-workspace-initializer@5.27.1
  - @memberjunction/ng-agent-client@5.27.1
  - @memberjunction/ng-conversations@5.27.1
  - @memberjunction/ng-notifications@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/ng-bootstrap@5.27.1

## 5.27.0

### Patch Changes

- 6fd2886: Add server connectivity heartbeat service with warning banner that alerts users when the API connection is lost.
- Updated dependencies [4357090]
- Updated dependencies [6fd2886]
  - @memberjunction/ng-conversations@5.27.0
  - @memberjunction/ng-explorer-core@5.27.0
  - @memberjunction/ng-bootstrap@5.27.0
  - @memberjunction/ng-workspace-initializer@5.27.0
  - @memberjunction/ai-agent-client@5.27.0
  - @memberjunction/ai-core-plus@5.27.0
  - @memberjunction/ng-auth-services@5.27.0
  - @memberjunction/ng-base-application@5.27.0
  - @memberjunction/ng-shared@5.27.0
  - @memberjunction/ng-agent-client@5.27.0
  - @memberjunction/ng-notifications@5.27.0
  - @memberjunction/core@5.27.0

## 5.26.0

### Patch Changes

- 55de456: Fix missing dependencies across 17 packages that accumulated while knip dependency checking was silently broken. Repair knip infrastructure: disable crashing vitest plugin, harden CI workflow to fail-fast on tool crashes instead of silently passing, and fix hardcoded Angular version in auto-fix script.
- Updated dependencies [a1002f4]
  - @memberjunction/core@5.26.0
  - @memberjunction/ai-core-plus@5.26.0
  - @memberjunction/ng-bootstrap@5.26.0
  - @memberjunction/ng-base-application@5.26.0
  - @memberjunction/ng-explorer-core@5.26.0
  - @memberjunction/ng-shared@5.26.0
  - @memberjunction/ng-conversations@5.26.0
  - @memberjunction/ng-notifications@5.26.0
  - @memberjunction/ng-workspace-initializer@5.26.0
  - @memberjunction/ai-agent-client@5.26.0
  - @memberjunction/ng-auth-services@5.26.0
  - @memberjunction/ng-agent-client@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [a24ff53]
- Updated dependencies [008a62d]
- Updated dependencies [5e2a64f]
- Updated dependencies [1eb9f6e]
  - @memberjunction/core@5.25.0
  - @memberjunction/ng-conversations@5.25.0
  - @memberjunction/ng-explorer-core@5.25.0
  - @memberjunction/ng-bootstrap@5.25.0
  - @memberjunction/ng-auth-services@5.25.0
  - @memberjunction/ng-workspace-initializer@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [3a35955]
- Updated dependencies [1912726]
  - @memberjunction/ng-bootstrap@5.24.0
  - @memberjunction/ng-explorer-core@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/ng-auth-services@5.24.0
  - @memberjunction/ng-conversations@5.24.0
  - @memberjunction/ng-workspace-initializer@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/ng-explorer-core@5.23.0
  - @memberjunction/ng-bootstrap@5.23.0
  - @memberjunction/ng-auth-services@5.23.0
  - @memberjunction/ng-workspace-initializer@5.23.0
  - @memberjunction/ng-conversations@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [a42aba6]
- Updated dependencies [e5993ff]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/ng-bootstrap@5.22.0
  - @memberjunction/ng-chat-overlay@5.22.0
  - @memberjunction/ng-explorer-core@5.22.0
  - @memberjunction/ng-auth-services@5.22.0
  - @memberjunction/ng-workspace-initializer@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/ng-bootstrap@5.21.0
  - @memberjunction/ng-auth-services@5.21.0
  - @memberjunction/ng-explorer-core@5.21.0
  - @memberjunction/ng-workspace-initializer@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/ng-bootstrap@5.20.0
  - @memberjunction/ng-auth-services@5.20.0
  - @memberjunction/ng-explorer-core@5.20.0
  - @memberjunction/ng-workspace-initializer@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ng-bootstrap@5.19.0
- @memberjunction/ng-auth-services@5.19.0
- @memberjunction/ng-explorer-core@5.19.0
- @memberjunction/ng-workspace-initializer@5.19.0
- @memberjunction/core@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [931740a]
  - @memberjunction/ng-bootstrap@5.18.0
  - @memberjunction/ng-explorer-core@5.18.0
  - @memberjunction/ng-workspace-initializer@5.18.0
  - @memberjunction/ng-auth-services@5.18.0
  - @memberjunction/core@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/ng-bootstrap@5.17.0
  - @memberjunction/ng-explorer-core@5.17.0
  - @memberjunction/ng-workspace-initializer@5.17.0
  - @memberjunction/ng-auth-services@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [179a4ce]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/ng-workspace-initializer@5.16.0
  - @memberjunction/ng-bootstrap@5.16.0
  - @memberjunction/ng-auth-services@5.16.0
  - @memberjunction/ng-explorer-core@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/ng-bootstrap@5.15.0
  - @memberjunction/ng-auth-services@5.15.0
  - @memberjunction/ng-explorer-core@5.15.0
  - @memberjunction/ng-workspace-initializer@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [8fe1124]
- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/ng-auth-services@5.14.0
  - @memberjunction/core@5.14.0
  - @memberjunction/ng-bootstrap@5.14.0
  - @memberjunction/ng-explorer-core@5.14.0
  - @memberjunction/ng-workspace-initializer@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [1bb9b86]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/ng-explorer-core@5.13.0
  - @memberjunction/ng-bootstrap@5.13.0
  - @memberjunction/ng-auth-services@5.13.0
  - @memberjunction/ng-workspace-initializer@5.13.0

## 5.12.0

### Patch Changes

- a57b8d5: Migrate all hardcoded CSS colors to design tokens for dark mode and white-label support. Introduces `--mj-*` semantic CSS custom properties in `_tokens.scss` with full `[data-theme="dark"]` overrides. Migrates 1,544 of 1,659 hardcoded hex values (93%) across 72+ CSS files to semantic tokens. Adds logo token system (`--mj-logo-mark`, `--mj-logo-color`) for themeable branding. Fixes dark mode theming for CodeMirror, AG Grid v35, and Kendo popups. No API or behavioral changes — CSS only.
- e87d153: design tokens phase 1
- 108673e: MSAL Token refresh improvements
- Updated dependencies [05f19ff]
- Updated dependencies [a57b8d5]
- Updated dependencies [e87d153]
- Updated dependencies [7def002]
- Updated dependencies [d92502e]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/ng-bootstrap@5.12.0
  - @memberjunction/ng-explorer-core@5.12.0
  - @memberjunction/ng-auth-services@5.12.0
  - @memberjunction/ng-workspace-initializer@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
- Updated dependencies [fc2bd47]
  - @memberjunction/core@5.11.0
  - @memberjunction/ng-explorer-core@5.11.0
  - @memberjunction/ng-bootstrap@5.11.0
  - @memberjunction/ng-workspace-initializer@5.11.0
  - @memberjunction/ng-auth-services@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ng-bootstrap@5.10.1
- @memberjunction/ng-auth-services@5.10.1
- @memberjunction/ng-explorer-core@5.10.1
- @memberjunction/ng-workspace-initializer@5.10.1
- @memberjunction/core@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/ng-bootstrap@5.10.0
  - @memberjunction/ng-auth-services@5.10.0
  - @memberjunction/ng-explorer-core@5.10.0
  - @memberjunction/ng-workspace-initializer@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [194ddf2]
  - @memberjunction/core@5.9.0
  - @memberjunction/ng-bootstrap@5.9.0
  - @memberjunction/ng-explorer-core@5.9.0
  - @memberjunction/ng-auth-services@5.9.0
  - @memberjunction/ng-workspace-initializer@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/ng-bootstrap@5.8.0
  - @memberjunction/ng-explorer-core@5.8.0
  - @memberjunction/ng-workspace-initializer@5.8.0
  - @memberjunction/ng-auth-services@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/ng-bootstrap@5.7.0
  - @memberjunction/ng-explorer-core@5.7.0
  - @memberjunction/ng-auth-services@5.7.0
  - @memberjunction/ng-workspace-initializer@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [d24a7ff]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/ng-explorer-core@5.6.0
  - @memberjunction/ng-bootstrap@5.6.0
  - @memberjunction/ng-auth-services@5.6.0
  - @memberjunction/ng-workspace-initializer@5.6.0

## 5.5.0

### Patch Changes

- 7ca2459: Viewing System fixes, CodeGen cleanup, startup performance
- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [7ca2459]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/ng-explorer-core@5.5.0
  - @memberjunction/ng-bootstrap@5.5.0
  - @memberjunction/ng-auth-services@5.5.0
  - @memberjunction/ng-workspace-initializer@5.5.0

## 5.4.1

### Patch Changes

- 8789e86: moved design tokens + added doc
  - @memberjunction/ng-explorer-core@5.4.1
  - @memberjunction/ng-bootstrap@5.4.1
  - @memberjunction/ng-workspace-initializer@5.4.1
  - @memberjunction/ng-auth-services@5.4.1
  - @memberjunction/core@5.4.1

## 5.4.0

### Patch Changes

- 081d657: regression fixes
- 6bcfa1c: unified design tokens
- Updated dependencies [c9a760c]
- Updated dependencies [6bcfa1c]
  - @memberjunction/ng-bootstrap@5.4.0
  - @memberjunction/ng-explorer-core@5.4.0
  - @memberjunction/ng-workspace-initializer@5.4.0
  - @memberjunction/ng-auth-services@5.4.0
  - @memberjunction/core@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ng-bootstrap@5.3.1
- @memberjunction/ng-auth-services@5.3.1
- @memberjunction/ng-explorer-core@5.3.1
- @memberjunction/ng-workspace-initializer@5.3.1
- @memberjunction/core@5.3.1

## 5.3.0

### Patch Changes

- @memberjunction/ng-explorer-core@5.3.0
- @memberjunction/ng-bootstrap@5.3.0
- @memberjunction/ng-workspace-initializer@5.3.0
- @memberjunction/ng-auth-services@5.3.0
- @memberjunction/core@5.3.0

## 5.2.0

### Patch Changes

- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
- Updated dependencies [4618227]
  - @memberjunction/core@5.2.0
  - @memberjunction/ng-bootstrap@5.2.0
  - @memberjunction/ng-explorer-core@5.2.0
  - @memberjunction/ng-auth-services@5.2.0
  - @memberjunction/ng-workspace-initializer@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [f426d43]
  - @memberjunction/ng-bootstrap@5.1.0
  - @memberjunction/ng-auth-services@5.1.0
  - @memberjunction/ng-explorer-core@5.1.0
  - @memberjunction/ng-workspace-initializer@5.1.0
  - @memberjunction/core@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [786a390]
- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/ng-bootstrap@5.0.0
  - @memberjunction/core@5.0.0
  - @memberjunction/ng-auth-services@5.0.0
  - @memberjunction/ng-explorer-core@5.0.0
  - @memberjunction/ng-workspace-initializer@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/ng-bootstrap@4.4.0
  - @memberjunction/ng-auth-services@4.4.0
  - @memberjunction/ng-explorer-core@4.4.0
  - @memberjunction/ng-workspace-initializer@4.4.0

## 4.3.1

### Patch Changes

- f1b4a98: Restore singleton packages as regular dependencies in Angular Bootstrap and Explorer packages, and fix false positive error detection in CLI migrate command.
- Updated dependencies [f1b4a98]
  - @memberjunction/ng-bootstrap@4.3.1
  - @memberjunction/ng-auth-services@4.3.1
  - @memberjunction/ng-explorer-core@4.3.1
  - @memberjunction/ng-workspace-initializer@4.3.1
  - @memberjunction/core@4.3.1

## 4.3.0

### Patch Changes

- @memberjunction/ng-bootstrap@4.3.0
- @memberjunction/ng-explorer-core@4.3.0
- @memberjunction/ng-workspace-initializer@4.3.0

## 4.2.0

### Patch Changes

- Updated dependencies [d2938db]
  - @memberjunction/ng-auth-services@4.2.0
  - @memberjunction/ng-bootstrap@4.2.0
  - @memberjunction/ng-explorer-core@4.2.0
  - @memberjunction/ng-workspace-initializer@4.2.0
  - @memberjunction/core@4.2.0

## 4.1.0

### Minor Changes

- 2ea241f: metadata

### Patch Changes

- Updated dependencies [77839a9]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/ng-explorer-core@4.1.0
  - @memberjunction/ng-bootstrap@4.1.0
  - @memberjunction/ng-auth-services@4.1.0
  - @memberjunction/ng-workspace-initializer@4.1.0

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
- Updated dependencies [7aa23e7]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/ng-bootstrap@4.0.0
  - @memberjunction/ng-auth-services@4.0.0
  - @memberjunction/ng-explorer-core@4.0.0
  - @memberjunction/ng-workspace-initializer@4.0.0
  - @memberjunction/core@4.0.0

## 3.4.0

### Patch Changes

- 3a71e4e: Fix large text field corruptions, cross-platform improvements, more robust environment variable parsing for boolean values
- Updated dependencies [a7db1cc]
- Updated dependencies [3a71e4e]
- Updated dependencies [a3961d5]
  - @memberjunction/ng-explorer-core@3.4.0
  - @memberjunction/ng-bootstrap@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/ng-workspace-initializer@3.4.0
  - @memberjunction/ng-auth-services@3.4.0

## 3.3.0

### Patch Changes

- @memberjunction/ng-explorer-core@3.3.0
- @memberjunction/ng-workspace-initializer@3.3.0
- @memberjunction/ng-bootstrap@3.3.0
- @memberjunction/ng-auth-services@3.3.0
- @memberjunction/core@3.3.0

## 3.2.0

### Patch Changes

- Updated dependencies [293d656]
- Updated dependencies [582ca0c]
- Updated dependencies [470bc9d]
  - @memberjunction/ng-explorer-core@3.2.0
  - @memberjunction/ng-bootstrap@3.2.0
  - @memberjunction/ng-workspace-initializer@3.2.0
  - @memberjunction/ng-auth-services@3.2.0
  - @memberjunction/core@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/ng-bootstrap@3.1.1
- @memberjunction/ng-workspace-initializer@3.1.1
- @memberjunction/ng-explorer-core@3.1.1
- @memberjunction/ng-auth-services@3.1.1
- @memberjunction/core@3.1.1

## 3.0.0

### Major Changes

- f25f757: The foundation for MemberJunction v3.0's improved architecture, making it easier for developers to adopt and customize MJ for their needs.

### Patch Changes

- Updated dependencies [906a21b]
- Updated dependencies [f25f757]
  - @memberjunction/ng-explorer-core@3.0.0
  - @memberjunction/ng-workspace-initializer@3.0.0
  - @memberjunction/ng-bootstrap@3.0.0
  - @memberjunction/ng-auth-services@3.0.0
  - @memberjunction/core@3.0.0
