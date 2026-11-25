# Guided Tours Developer Guide

Guided Tours is a first-class, metadata-driven onboarding and in-app guidance framework across MemberJunction Explorer, standalone Angular apps, external HTML/React pages (`<mj-tour-host>` / `mj-tours.js`), and AI agents.

This guide covers architecture, authoring, semantic anchoring, interactive `ComponentSpec` steps, two-phase metadata sync, two-stage external embedding with Content Security Policy (CSP) guidance, agent directors, and CI verification.

---

## 1. Architecture & Layering

Guided Tours follows MJ's strict UI layering (`guides/UI_LAYERING_GUIDE.md`) so the same tour definition runs identically in Explorer, custom Angular apps, external web pages, and Node verification harnesses:

| Package / Layer | `mjUILayer` | Responsibilities |
|---|---|---|
| `@memberjunction/graph` (`packages/Graph`) | `runtime` | Zero-dependency DAG algorithms, `GraphTraversalEngine`, cycle detection, and Sugiyama layered graph layout |
| `@memberjunction/tours-runtime` (`packages/Tours/Runtime`) | `runtime` | Pure-TS `TourSession`, `tour-graph-compiler.ts`, standard step/anchor/completion/trigger/eligibility/director plugins, `TourSignals`, `TourAgentToolkit`, `ITourHost` contracts |
| `TourEngine` (`@memberjunction/core-entities`) | Both tiers | Client/server metadata & run cache, `ObserveProperty` streams, `Tours.Enabled` kill switch, resolved via `TourEngine.GetProviderInstance(this.ProviderToUse, TourEngine)` |
| `@memberjunction/ng-tours` (`packages/Angular/Generic/tours`) | `widgets` | Single Light DOM Angular renderer set (`@layer mj-tours-defaults`, `mjt-` prefix), SVG cutout spotlight, `[mjTourAnchor]` / `AnchorRegistry`, two-stage `<mj-tour-host>` element + `mj-tours.js` bundle |
| Explorer & `Tour Studio` (`packages/Angular/Explorer/*`) | `surface` / `shell` | `ExplorerTourHost`, shell launcher, `OmnibarToursProvider`, Home learning-path checklist, clickable `"tour"` notifications, and `TourStudioDashboard` |
| `@memberjunction/tours-server` (`packages/Tours/Server`) | Server | Entity server subclasses, `TourPublisherService` canonical snapshotting, `BaseTourServerPredicate`, 5 `Tours.*` Remote Operations, and 4 server Actions |
| `packages/MJServer/src/realtimeWidget/` | Server | Shared embed-surface guest session minting/refresh (`WidgetSessionService` + `WidgetRouter`) and RV4/RV5 visitor identity lifecycle for both widgets and `MJ: Tour Surfaces` |

---

## 2. Authoring Tours & Two-Phase Metadata Sync

### 2.1 Why Two-Phase Sync (`tours` -> `tour-publications`) Exists

`MJ: Tour Runs.TourVersionID` is non-nullable so telemetry always pins an immutable snapshot (`MJ: Tour Versions`). During `mj sync push`, `MJ: Tours` saves *before* its nested `MJ: Tour Steps` and `MJ: Tour Step Paths` rows. If a seeded tour shipped in `Status: "Active"`, saving the tour first and each step afterwards would mint intermediate partial versions.

To avoid partial snapshots, seeded tours use two-phase metadata sync (mirroring `metadata/rubrics/` -> `metadata/rubric-publications/`):

1. **`metadata/tours/`**: Author shipped tours with `"Status": "Draft"` and nested `MJ: Tour Steps`, `MJ: Tour Step Paths`, `MJ: Tour Prerequisites`, and `MJ: Tour Triggers`.
2. **`metadata/tour-publications/`**: Ordered immediately after `tours` in `metadata/.mj-sync.json`, setting `"Status": "Active"` for shipped tour `primaryKey` UUIDs.
3. **`MJTourEntityServer` & `TourPublisherService`**: When a tour transitions to `Active` (or is saved while `Active`), `TourPublisherService.SnapshotIfChanged()` computes a canonical SHA-256 `ContentHash` of sorted steps, paths, `Goal`, `StartLocation`, and `Configuration`.
   - If `ContentHash` matches `CurrentVersionID`, **no new version is created** (repeated `mj sync push` runs remain idempotent).
   - If `ContentHash` differs, `VersionNumber = max + 1` is inserted in `MJ: Tour Versions` and `Tour.CurrentVersionID` is updated.
   - `MJTourVersionEntityServer` enforces immutability (`Definition` and `VersionNumber` cannot mutate after save, and `Delete()` refuses while referenced by `Tour.CurrentVersionID` or `TourRun.TourVersionID`).

### 2.2 Step Schema Validation (`MJTourStepEntityServer`)

Every `MJ: Tour Step Types` row can declare a JSON Schema in `ConfigSchema`. `MJTourStepEntityServer.ValidateAsync()` validates `TourStep.Configuration` against the parent `TourStepType.ConfigSchema` before save.

All JSON columns in metadata (`Configuration`, `Anchor`, `Completion`, `Prepare`, `SkipWhen`, `Goal`, `StartLocation`, `LaunchPolicy`, `ConfigSchema`) MUST be formatted as **native nested JSON objects** (never escaped JSON strings) per `metadata/CLAUDE.md`.

### 2.3 Host-Admin Overrides

Host administrators should never edit shipped `MJ: Tours` rows directly. Customizations belong in **`MJ: Tour Overrides`** (`Global`, `Role`, or `User` scope) so upgrades preserve local policies.

---

## 3. Anchoring & Contextual Tours

`AnchorRegistry` resolves a step's `Anchor` using the first strategy that finds a visible target:

1. **Registered (`Strategy: "Registered"`)**: Add `data-mj-tour-anchor="<prefix>.<feature>"` or `[mjTourAnchor]="'...'"` in HTML templates. Exported core anchors also live in `packages/Angular/Generic/tours/src/core-anchor-manifest.json`.
2. **Semantic (`FormField`, `FormSection`, `FormRailGroup`, `FormToolbarAction`, `NavItem`, `RailPage`, `AppSwitcher`, `GridColumn`, `Omnibar`, `ChatComposer`)**: Resolve via metadata and `FormAnchorNavigator` rather than fragile selectors. For `NavItem`, target `DriverClass` or `Key`, never display `Label`.
3. **Accessible Role (`Role`)**: Match ARIA role + accessible name for third-party controls.
4. **CSS `Selector`**: Last resort; emits a `tour-anchors` warning unless excused with `"tour-anchors-allow-selector"` in step `Configuration`.

### Contextual Parameterized Anchors

Semantic anchors and step copy support context placeholders such as `{{Context.Record.EntityName}}`. For example, `core.records` uses:

```json
{
  "Strategy": "FormSection",
  "Entity": "{{Context.Record.EntityName}}",
  "Section": "Details"
}
```

This lets one authored tour guide users on *any* entity record form.

---

## 4. Typed Configuration & Localization

`MJ: Tours.Configuration`, `MJ: Tour Steps.Configuration`, `MJ: Tour Step Paths.Configuration`, and `MJ: Learning Paths.Configuration` are backed by strongly-typed JSONType interfaces (`ITourConfiguration`, `ITourStepConfiguration`, `ITourStepPathConfiguration`, `ILearningPathConfiguration`). Authors can supply BCP 47 locale overrides directly under `Configuration.localizations`:

```json
{
  "Variant": "welcome",
  "PrimaryButtonText": "Show me around",
  "localizations": {
    "es": {
      "Title": "Bienvenido a MemberJunction",
      "Body": "Tómate dos minutos para conocer las aplicaciones y Sage.",
      "NextButtonText": "Empezar"
    }
  }
}
```

---

## 5. Interactive `ComponentSpec` Steps & Custom Step Types

Teams can embed interactive React `ComponentSpec` widgets inside tours in two ways without Angular deployments:

1. **Ad-hoc `EmbeddedComponent` step**: Set `Configuration.ComponentID` (or `ComponentName` / inline `ComponentSpec`) on a step using step type `EmbeddedComponent`. See `metadata/tours/.core-welcome.json` (`workspace-pick` -> `Tour Workspace Quick Configurator`).
2. **Reusable custom `TourStepType` backed by `ComponentID`**: Create an `MJ: Tour Step Types` row with `DriverClass: "EmbeddedComponent"`, `RendererClass: "EmbeddedComponent"`, and `ComponentID: "@lookup:MJ: Components.Name=...&Namespace=..."`. See `Interactive Readiness Check` in `metadata/tour-step-types/.tour-step-types.json` and its use in `metadata/tours/.builder-tour-authoring.json`.

### Interactive Event Contract

The renderer supplies `data`, `step`, `session`, and `callbacks.OnEvent(eventName, payload)` props:

- **`callbacks.OnEvent('chooseBranch', { choiceKey: 'data' })`**: Emits a branch choice into `TourSession` for conditional `MJ: Tour Step Paths` evaluation.
- **`callbacks.OnEvent('completeStep', payload)`**: Emits `CompletionEventName` (or `tours.component.completed.<StepKey>`) on `TourSignals` and advances the step.

---

## 6. External Web Embedding & Guest Surfaces

Guided Tours supports non-Explorer Angular apps, React apps, and plain HTML pages via the **two-stage Light DOM element architecture** (`@memberjunction/ng-tours`):

- **Stage-1 vanilla shell (`mj-tours.js`)**: ~10 KB gzipped IIFE. Registers `<mj-tour-host>`, exports `MountTours()` and `RegisterAnchor()`, runs the `MutationObserver` over `[data-mj-tour-anchor]`, and evaluates lightweight triggers. Zero Angular/RxJS/MJ imports — pages where no tour launches never download Angular.
- **Stage-2 session bundle (`mj-tours-session.js` + lazy `chunks/`)**: Loaded via `import()` only when a tour starts or a beacon opens. Boots in Light DOM under `@layer mj-tours-defaults` with `mjt-` CSS prefixing. Heavy renderers (`AskAgent`, `Media`, `EmbeddedComponent`) stay in lazy split chunks.

### 6.1 Plain HTML / Script Host Example

```html
<button data-mj-tour-anchor="public.docs.search">Search Docs</button>

<mj-tour-host
  surface-key="ts_your_public_surface_key"
  api-url="https://api.example.com"
  csp-nonce="REPLACE_WITH_REQUEST_NONCE">
</mj-tour-host>

<script src="https://cdn.example.com/mj-tours.js" nonce="REPLACE_WITH_REQUEST_NONCE" defer></script>
```

You can also initialize imperatively via `MountTours({ surfaceKey, apiUrl, basePath })` or run offline in **static inline mode** (`InlineTourSource` + `MemoryProgressStore`).

### 6.2 Shared Guest Sessions (`MJ: Tour Surfaces`)

`WidgetSessionService` and `WidgetRouter` (`/widget/session`, `/widget/session/refresh`, `/widget/forget`, `/widget/resolve-identity`) support both `MJ: Conversation Widget Instances` (`pk_live_*` / `widgetKey`) and `MJ: Tour Surfaces` (`ts_*` / `surfaceKey`):

- **Origin fail-closed & rate limits**: Requests must pass `EvaluateTourSurfaceMint()` (`Status === 'Active'`, `AuthStrategy !== 'MJ User'`, exact `AllowedOrigins` match) and per-surface `RateLimitPerMinute`.
- **Shared chat + tour sessions**: Setting `MJ: Tour Surfaces.ConversationWidgetInstanceID` mints one unified RS256 guest JWT and `VisitorKey` shared by `<mj-tour-host>` and `<mj-realtime-widget>`.
- **Zero-CRUD `Tour Guest` role**: Guest tokens carry verified `SurfaceID` (via `Tour Surface` scope or linked `mj_widget_id`) and `VisitorKey` (falling back to `mj_sid`). `Tours.GetSurfaceTours` and `Tours.RecordEvents` derive identity strictly from verified JWT claims and enforce surface tour assignment (`MJ: Tour Surface Tours`).
- **RV4 Claim & RV5 Forget**: Signing in triggers `Tours.ClaimGuestRuns` / `ClaimGuestTourRuns` to re-attribute anonymous runs (`UserID IS NULL`) to the verified user; `ForgetVisitor` deletes guest-only `TourRun` + `TourRunStep` rows and strips `VisitorKey` from claimed runs.

### 6.3 Content Security Policy (CSP) Guidance

When deploying `<mj-tour-host>` or `mj-tours.js` under strict CSP:

- **`script-src`**: Allow your host origin / CDN serving `mj-tours.js`, `mj-tours-session.js`, and lazy `chunks/*.js` (or attach `'nonce-...'`). Never requires `'unsafe-eval'`.
- **`style-src`**: Pass `csp-nonce="<nonce>"` on `<mj-tour-host>` (or `<meta name="CSP_NONCE">`) so injected `@layer mj-tours-defaults` stylesheets carry the request nonce without needing `'unsafe-inline'`.
- **`connect-src`**: Allow the MJAPI base URL (`https://api.example.com`) for `/widget/session*`, `/graphql` (`Tours.GetSurfaceTours`, `Tours.RecordEvents`), and optional voice WebSocket endpoints.

---

## 7. Sage Realtime Voice Guide, Driving Verbs, Remote Operations & Actions

### 7.1 Direct Reuse of MJ Realtime Widgets (`Chrome="bar"`)

Guided Tours embeds MemberJunction's existing realtime widget suite directly rather than maintaining a separate voice component:

- **`<mj-realtime-session-overlay Chrome="bar">`** (`@memberjunction/ng-conversations`) and **`<mj-realtime-widget chrome="bar">`** (`@memberjunction/ng-realtime-widget`) render a compact horizontal bar composing `<mj-realtime-agent-orb>` (`--mj-realtime-orb-size: 26px`), `<mj-audio-meter>` (60fps outside-Angular 7-bar smoother), and `<mj-media-controls>` (circular mute button + device picker) over the shared root `RealtimeSessionService`.
- `<mj-tour-host>` exposes `[VoiceBarTemplate]` (with `TourVoiceBarContext`) so MJ Explorer projects `<mj-realtime-session-overlay Chrome="bar" [AgentName]="'Sage'">` directly into the Precision Tour Card footer and Side-Panel presenter while keeping `@memberjunction/ng-tours` and `mj-tours.js` completely decoupled from `ng-conversations`.
- **Live Session Handoff**: When a user starts a tour with **Walk through with Sage** (or asks Sage during an active voice call to start a tour), `ExplorerTourHost` sets `RealtimeSessionService.SetMinimized(true)` so the full-screen call overlay steps aside and the same live Sage session renders inside the tour card's `Chrome="bar"` footer with zero re-mint or duplicate audio tracks.

### 7.2 `TourChannel`, Client Tools & 3-Tier Driving Safety Gate

Global client tools are registered in `metadata/client-tool-definitions/.tour-client-tools.json` and surfaced by `TourAgentToolkit`, paired with the headless `TourChannel` (`ServerPluginClass: "ClientOnlyChannelServer"`, `ClientPluginClass: "TourChannel"`):

- **Global tools**: `StartTour`, `ListTours`, `GetActiveTour`, `PauseTour`, `ResumeTour`, `StopTour`.
- **Active-session tools & `TourChannel` verbs**:
  - `TourGetState` / `TourGetVisibleAnchors`
  - `TourHighlight` / `highlight({ anchorKey, caption, durationMs })` — projects a secondary **Sage Pointer Ring + mini caption** (`Session.SetPointerHighlight`) onto any visible anchor without moving the step's primary spotlight.
  - `TourSelectChoice` / `selectChoice({ choiceKey })` — selects a branch option on `Choice` steps by voice and advances along matching `MJ: Tour Step Paths`.
  - `TourAdvanceStep` / `advanceStep`, `TourGoBack` / `goBack`, `TourGoToStep` / `goToStep`, `TourPrepareStep` / `prepareStep`.
  - `TourDemonstrateStep` / `demonstrateStep({ confirmedMutation })` — executes `Session.DemonstrateCurrentStep(...)` under a **3-tier safety gate**:
    1. **Verify Mode Lockout**: Always refused (`verify_mode_locked`) when `DirectorType === 'Verify'` so competency assessments remain genuine.
    2. **Tier 1 & Tier 2 (Navigation & Surface Actions)**: Safe navigation/focus (`Prepare`) runs immediately; host surface actions (`Host.DemonstrateStep` / `ContextTool`) run when `AllowAgentActions = true` or when the user explicitly clicks **Show me**.
    3. **Tier 3 (Mutating Writes)**: Steps or actions declaring `RequiresMutationConfirmation: true` (such as `Save`, `Delete`, or `Publish`) pause and surface an inline `[Confirm]` / `[Cancel]` bar (`Session.PendingDemonstrationConfirmation`) on the tour card before executing.

### 7.3 Server Remote Operations & Predicates

| Remote Operation | Purpose | Guest-Accessible |
|---|---|---|
| `Tours.RecordEvents` | Persists batched `MJ: Tour Runs` & `MJ: Tour Run Steps`; auto-pauses active triggers on high `AnchorResolution === 'Failed'` rate | Yes (verified claims only) |
| `Tours.EvaluatePredicates` | Batches `BaseTourServerPredicate` checks (`HasRecords`, `QueryReturnsRows`, `AuthorizationHeld`) strictly as caller `contextUser` | Yes (caller permissions) |
| `Tours.GetSurfaceTours` | Returns active `TourVersion` snapshots assigned to a `TourSurface` + visitor/user prior runs | Yes (verified claims only) |
| `Tours.ClaimGuestRuns` | Re-attributes guest `VisitorKey` runs (`UserID IS NULL`) to the authenticated user | No |
| `Tours.PublishTour` | Validates pathway via `ValidateTourGraph`, snapshots `MJ: Tour Versions`, sets `CurrentVersionID` / `Status` | No |

### 7.4 Server Actions (`@memberjunction/tours-server`)

Declared in `metadata/actions/.tour-actions.json`:

- `Start Tour For User` — creates a `Pending` run and a clickable `MJ: User Notifications` row (`ResourceConfiguration` JSON `{"type":"tour", ...}`).
- `Suggest Tours` — ranks active eligible tours by priority, unmet prerequisites, and app/entity/query context.
- `Get Tour Progress` — summarizes tour & learning path completion for a user.
- `Assign Learning Path` — assigns a learning path to a user or every active user in a role with notifications.

---

## 8. Authoring Guided Tours in Downstream OpenApps & BizApps

Downstream OpenApps (`mj-bizapps-common`, `mj-bizapps-sales`, `mj-bizapps-contracts`, `more-cheese-demo`, etc.) ship Guided Tours with zero changes to OpenApp Engine:

1. **Migrations-Only Delivery + Teardown Cleanup**:
   - Author JSON files in `metadata/tours/`, `metadata/tour-publications/`, and `metadata/learning-paths/`, push with `sqlLogging` enabled during release prep, and ship the consolidated `V...__Metadata_Sync.sql` migration.
   - If the OpenApp declares `migrations.teardownDirectory` in `mj-app.json`, include inverse `DELETE` statements for its seeded `__mj.LearningPath` and `__mj.Tour` rows (`WHERE TourKey LIKE '<prefix>.%'`), since dropping the app's own schema does not remove rows in `__mj`.
2. **Per-App `allowedPrefixes` in `.mj-standards.json`**:
   - Configure `tour-anchors` at the repo root with the app's prefix (e.g. `["common."]`, `["sales."]`, `["contracts."]`, `["cheese."]`). Downstream tours can still reference core MJ shell anchors exported in `@memberjunction/ng-tours/core-anchor-manifest.json` (such as `core.shell.app-switcher`, `core.shell.omnibar`, `core.shell.chat`).
3. **Cross-App `LearningPath` & `TourPrerequisite` Composability**:
   - Only use hard `TourID` foreign keys (`@lookup:MJ: Tours.TourKey=...` in `LearningPathTour` or `TourPrerequisite`) for tours inside the same repo or in apps listed in `mj-app.json` `dependencies`.
   - For optional peer apps, gate via `TourPrerequisite` with `PrerequisiteType: "Application"` (`Condition: { "RequiredApplicationName": "Sales" }`) or ship cross-suite tracks (such as `suite.lead-to-ledger`) in a thin metadata-only OpenApp declaring the participating BizApps as dependencies.

---

## 9. Global App Discovery & Dual-Layer Semantic Vector Search

1. **First-Visit Proactive Offers & Global "All Apps" Catalog**:
   - `ExplorerTourHost` runs `TourTriggerCoordinator` (`@memberjunction/tours-runtime`) on application/navigation transitions, surfacing non-blocking bottom-right `.mjt-offer-toast` prompts for `FirstVisit` triggers while enforcing `OffersEnabled` and session interruption budgets.
   - The Explorer header **Tours & Help** popover exposes **For This Screen**, **All Apps**, and **Paths** tabs (`ExplorerTourHost.GetAllToursByApplication()`), grouping every eligible active tour by application with `Completed` / `In Progress` badges so users can replay or explore any tour anytime.
2. **Client-Side `< 15 ms` WASM Vector Search (`OmnibarSemanticIndexService`)**:
   - Indexes both whole tours (`tour:<TourKey>`) and individual steps (`tour-step:<TourKey>:<StepKey>`) into Explorer's `float32` `SimpleVectorService` over the shared `bge-small-en-v1.5` WASM Web Worker.
   - Natural-language queries in `Cmd+K` or `?` match whole tours or deep-link straight to the relevant step via `StartTour(tourKey, { StartAtStepKey })`.
3. **Server-Side `MJ: Entity Documents` Embeddings (`Tours Search` & `Tour Steps Search`)**:
   - Seeded in `metadata/entity-documents/.entity-documents.json` using the in-process `Simple Vector Service Provider` + `gte-small (Local)` model (`Entity Vector Sync - Daily` job — zero API keys), powering `Provider.SearchEntity`, `SearchEngine` hybrid RRF, Knowledge Hub, and server-side Sage agent runs.

---

## 10. CI Verification

1. **`tour-anchors` standards check** (`.mj-standards.json`, severity `error`): validates `allowedPrefixes` (`core.`, `admin.`, `builder.` in core MJ), verifies every literal `Registered` anchor key against HTML templates or `core-anchor-manifest.json`, validates semantic `FormField`/`FormSection` entity/field names against generated entities, and flags raw `Selector` usage.
   ```bash
   npx mj standards check --check tour-anchors
   ```
2. **`ui-layers` standards check**: ensures `@memberjunction/tours-runtime` and `@memberjunction/graph` never import Angular/Router/Explorer, and `@memberjunction/ng-tours` never imports Router or Explorer.
3. **Server, Runtime & UI Unit/DOM Tests**:
   ```bash
   cd packages/Tours/Runtime && npm test
   cd packages/Tours/Server && npm test
   cd packages/Angular/Generic/tours && npm test
   cd packages/MJServer && npx vitest run src/__tests__/tourSurfaceSession.test.ts src/__tests__/visitorIdentity.tourRuns.test.ts src/__tests__/WidgetSessionService.test.ts src/__tests__/widget.test.ts
   ```
