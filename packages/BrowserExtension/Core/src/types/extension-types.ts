/**
 * @fileoverview Core type contracts for the MemberJunction Browser Extension architecture.
 *
 * Defines strongly-typed interfaces for:
 * - Dual-mode browser control (`content-script` default, `debugger-cdp` power mode, `auto` adaptive escalation)
 * - 4-layer configuration cascade (`code → brand/app → agent/playbook/domain → user`)
 * - Shadow-DOM Coach-Mark & Spotlight overlays
 * - Multi-App Context Braiding (`BrowserContextEngine`, anchor matches, cross-app facets, field diffs)
 * - Seamless Session Handoff (`ExtensionSessionHandoffPayload`, Topology A & Topology B)
 * - Guided Cross-Site Playbooks & Model-Blind Secret Vault Pipe (`CopySecretToMJVault`)
 * - White-Label Brand Stamping (`ExtensionBrandProfile`)
 *
 * @module @memberjunction/browser-extension-core
 */

import type { RealtimeChannelExposure } from '@memberjunction/ai-core-plus';
import type { BoundingBox, InteractiveElement, TraceTarget } from '@memberjunction/computer-use/browser-probe';

// ─── 1. Dual-Mode Browser Control & Configuration Cascade ────────────────────

/**
 * Browser control execution backend mode:
 * - `'content-script'`: **(Mode 1 — Recommended Default)** MV3 Content Script + shared `INTERACTIVITYPROBE` DOM grounding + Shadow-DOM Coach-Mark Spotlights. Zero Chrome debugger banner.
 * - `'debugger-cdp'`: **(Mode 2 — Power Mode)** `chrome.debugger` CDP 1.3 attach for `isTrusted: true` mouse/keyboard events, closed Shadow DOM piercing, and cross-origin `<iframe>` inspection.
 * - `'auto'`: **(Mode 3 — Adaptive Escalation)** Runs in `'content-script'` by default; escalates to `'debugger-cdp'` only when a step requires trusted input or cross-origin/closed-shadow piercing, then detaches immediately.
 */
export type BrowserControlBackendMode = 'content-script' | 'debugger-cdp' | 'auto';

/**
 * Concrete execution backend active for a single operation (`'content-script'` or `'debugger-cdp'`).
 */
export type ConcreteBrowserControlBackend = 'content-script' | 'debugger-cdp';

/**
 * Human-AI interaction mode inside the Browser Extension Side Panel:
 * - `'ObserveOnly'`: Ambient sidekick; reads page context (subject to exposure policy) and renders braided entities without acting on the DOM.
 * - `'GuideOnly'`: Co-pilot coaching; draws Coach-Mark Spotlights and callout badges around target elements while waiting for the human to click.
 * - `'Collaborative'`: Agent executes clicks, form fills, and navigation for non-destructive steps; human can pause or take over anytime (`Esc` or page click).
 */
export type ExtensionBrowserControlMode = 'ObserveOnly' | 'GuideOnly' | 'Collaborative';

/**
 * Input layers to the 4-layer configuration cascade for browser control mode and exposure.
 */
export interface BrowserControlCascadeInput {
    /** Layer 2: Brand Default (`mj-extension-brand.json` / `Application.AgentSettings.BrowserExtension`). */
    BrandDefaultBackend?: BrowserControlBackendMode;
    /** Layer 2b: Agent / Application Default (`IAgentSettings.BrowserExtension.DefaultControlBackend`). */
    AgentDefaultBackend?: BrowserControlBackendMode;
    /** Enterprise Safety Ceiling (`IAgentSettings.BrowserExtension.AllowDebuggerCDP`). When `false`, locks runtime to `'content-script'`. */
    AgentAllowDebuggerCDP?: boolean;
    /**
     * Browser Runtime Capability Gate: whether the active browser runtime exposes `chrome.debugger` CDP.
     * Defaults to `true` when undefined; when `false` (e.g. on Firefox or Safari), immediately locks
     * `EffectiveMode` / `ConfiguredMode` to `'content-script'` with `LockedByLayer: 'browser-runtime'`.
     */
    RuntimeSupportsDebuggerCDP?: boolean;
    /** Layer 3: Domain rule or Playbook preferred backend. */
    DomainRuleBackend?: BrowserControlBackendMode;
    /** Layer 3b: Whether the current Playbook step explicitly requires `isTrusted: true` CDP input. */
    PlaybookRequireTrustedInput?: boolean;
    /** Layer 4: User runtime toggle in the Side Panel Trust Bar (persisted per-domain via `UserInfoEngine`). */
    UserRuntimeOverride?: BrowserControlBackendMode;
    /** Runtime signal from `'auto'` mode indicating the previous Content Script action failed due to synthetic event rejection. */
    LastActionRequiresTrustedInput?: boolean;
}

/**
 * Alias for {@link BrowserControlCascadeInput}.
 */
export type ControlModeCascadeInput = BrowserControlCascadeInput;

/**
 * Resolved output of the 4-layer browser control configuration cascade.
 */
export interface BrowserControlCascadeResolution {
    /** Configured mode after applying layers 1-4 and the `AllowDebuggerCDP` / `RuntimeSupportsDebuggerCDP` gates. */
    ConfiguredMode: BrowserControlBackendMode;
    /** Effective mode after applying all runtime and enterprise safety gates (synonym of `ConfiguredMode`). */
    EffectiveMode: BrowserControlBackendMode;
    /** Concrete backend that will execute the current step (`'content-script'` or `'debugger-cdp'`). */
    ActiveBackend: ConcreteBrowserControlBackend;
    /** Which layer determined `ConfiguredMode`. */
    WinningLayer:
        | 'code-default'
        | 'brand-default'
        | 'agent-default'
        | 'domain-or-playbook-rule'
        | 'user-runtime-override'
        | 'enterprise-safety-ceiling'
        | 'browser-runtime';
    /** When locked by a non-overridable ceiling (`'browser-runtime'` or `'enterprise-safety-ceiling'`), identifies that ceiling. */
    LockedByLayer?: 'browser-runtime' | 'enterprise-safety-ceiling' | null;
    /** Whether `chrome.debugger` CDP attachment is permitted by both browser runtime and enterprise policy. */
    DebuggerPermitted: boolean;
    /** Whether the user or agent may switch to `'debugger-cdp'` in the current runtime and enterprise context. */
    AllowSwitchToDebuggerCDP: boolean;
    /** True when `ConfiguredMode === 'auto'` escalated `ActiveBackend` to `'debugger-cdp'` for this step. */
    EscalatedFromAuto: boolean;
    /** Human-readable explanation of the resolution or safety lock. */
    Reason: string;
}

/**
 * Alias for {@link BrowserControlCascadeResolution}.
 */
export type ControlModeCascadeResolution = BrowserControlCascadeResolution;

/**
 * Per-domain user preferences persisted in `MJ: User Settings` under `mj.browserExtension.domainPolicy.v1` via `UserInfoEngine`.
 */
export interface BrowserExtensionDomainPolicyEntry {
    Hostname: string;
    ControlBackend?: BrowserControlBackendMode;
    ControlMode?: ExtensionBrowserControlMode;
    Exposure?: RealtimeChannelExposure;
    UpdatedAtIso: string;
}

// ─── 2. Page State, Coach-Marks & Browser Adapter Contract ───────────────────

/**
 * Sanitized snapshot of the active browser tab's DOM state, interactive elements, and metadata signals.
 */
export interface BrowserPageStateSnapshot {
    /** Full URL of the active tab. */
    Url: string;
    /** Document title (`document.title`). */
    Title: string;
    /** Lowercase hostname (e.g. `'en.wikipedia.org'`). */
    Hostname: string;
    /** Viewport width in CSS pixels. */
    ViewportWidth: number;
    /** Viewport height in CSS pixels. */
    ViewportHeight: number;
    /** Grounded interactive elements from `INTERACTIVITYPROBE` (with sensitive values masked to `'[REDACTED]'`). */
    InteractiveElements: InteractiveElement[];
    /** Sanitized visible text excerpt from the page. */
    VisibleTextExcerpt: string;
    /** OpenGraph metadata (`og:title`, `og:site_name`, `og:description`, etc.). */
    OpenGraph: Record<string, string>;
    /** Parsed Schema.org JSON-LD objects found in `<script type="application/ld+json">`. */
    SchemaOrgEntities: Record<string, unknown>[];
    /** Standard `<meta name="...">` tags. */
    MetaTags: Record<string, string>;
    /** Custom DOM selector text/attribute values keyed by selector expression or logical key. */
    CapturedSignals: Record<string, string>;
    /** True when `SensitivePageGuard` detects a login, password, SSO, or MFA challenge screen. */
    IsAuthOrMfaScreen: boolean;
    /** Concrete control backend that produced this snapshot. */
    ActiveBackend: ConcreteBrowserControlBackend;
    /** ISO timestamp when captured. */
    CapturedAtIso: string;
}

/**
 * Callout placement relative to a Coach-Mark Spotlight ring.
 */
export type BrowserCoachMarkCalloutPosition = 'top' | 'bottom' | 'left' | 'right' | 'auto';

/**
 * Request to draw a Shadow-DOM Coach-Mark Spotlight ring and floating instruction card on the page.
 */
export interface BrowserCoachMarkRequest {
    /** Optional unique identifier for this highlight. */
    HighlightId?: string;
    /** Grounded interactive element index (`[i]` from `INTERACTIVITYPROBE`). */
    Index?: number;
    /** Direct CSS or `xpath=...` selector when highlighting outside the indexed list. */
    Selector?: string;
    /** Optional explicit bounding box when highlighting a region directly. */
    BoundingBox?: BoundingBox;
    /** Primary instruction text shown in the floating callout card. */
    Label: string;
    /** Optional step badge pill text (e.g. `"Step 2 of 4"`). */
    StepBadge?: string;
    /** Preferred callout placement relative to the spotlight ring. Default: `'auto'`. */
    CalloutPosition?: BrowserCoachMarkCalloutPosition;
    /** Optional brand accent color override. */
    AccentColor?: string;
}

/**
 * Request to click an element on the active page.
 */
export interface BrowserClickRequest {
    /** Grounded interactive element index (`[i]`). */
    Index?: number;
    /** CSS or `xpath=...` selector. */
    Selector?: string;
    /** Optional explicit X viewport coordinate. */
    X?: number;
    /** Optional explicit Y viewport coordinate. */
    Y?: number;
    /** Mouse button (`'left'`, `'right'`, `'middle'`). Default: `'left'`. */
    Button?: 'left' | 'right' | 'middle';
    /** Click count (`1` for single click, `2` for double click). Default: `1`. */
    ClickCount?: number;
    /** Optional recorded target fingerprint used by `ReresolveTarget` healing when the selector moved. */
    ExpectedFingerprint?: Partial<TraceTarget>;
    /** When `true`, requests hardware-trusted (`isTrusted: true`) CDP dispatch in `'auto'` mode. */
    RequireTrustedInput?: boolean;
}

/**
 * Request to fill text into an input, textarea, select, or contenteditable element.
 */
export interface BrowserFillInputRequest {
    /** Grounded interactive element index (`[i]`). */
    Index?: number;
    /** CSS or `xpath=...` selector. */
    Selector?: string;
    /** Text value to enter. */
    Value: string;
    /** Clear existing input value before typing. Default: `true`. */
    ClearFirst?: boolean;
    /** Dispatch Enter key after filling. Default: `false`. */
    PressEnter?: boolean;
    /** Optional recorded target fingerprint used by `ReresolveTarget` healing. */
    ExpectedFingerprint?: Partial<TraceTarget>;
    /** When `true`, requests hardware-trusted (`isTrusted: true`) CDP key dispatch in `'auto'` mode. */
    RequireTrustedInput?: boolean;
}

/**
 * Request to scroll the page or a scrollable container.
 */
export interface BrowserScrollRequest {
    Direction: 'up' | 'down' | 'left' | 'right';
    AmountPx?: number;
    Selector?: string;
}

/**
 * Request to pause and wait for a user action on the page.
 */
export interface BrowserWaitForActionRequest {
    ActionKind: 'click' | 'input' | 'submit' | 'navigation';
    Selector?: string;
    UrlPattern?: string;
    TimeoutMs?: number;
}

/**
 * Standardized result envelope returned by all browser control adapter operations.
 */
export interface BrowserOperationResult<TData = Record<string, unknown>> {
    Success: boolean;
    BackendUsed: ConcreteBrowserControlBackend;
    EscalatedToDebugger: boolean;
    Data?: TData;
    ErrorCode?: string;
    ErrorMessage?: string;
}

/**
 * Unified interface implemented by `ContentScriptBrowserAdapter` (Mode 1),
 * `ChromeDebuggerBrowserAdapter` (Mode 2), and `ExtensionBrowserAdapter` (Mode 3 Auto).
 */
export interface IBrowserControlAdapter {
    readonly BackendMode: BrowserControlBackendMode;
    Navigate(url: string): Promise<BrowserOperationResult<{ Url: string }>>;
    GetPageState(): Promise<BrowserOperationResult<BrowserPageStateSnapshot>>;
    ClickElement(request: BrowserClickRequest): Promise<BrowserOperationResult<{
        ClickedIndex?: number;
        Selector?: string;
        Healed: boolean;
    }>>;
    FillInput(request: BrowserFillInputRequest): Promise<BrowserOperationResult<{
        FilledIndex?: number;
        Selector?: string;
        Healed: boolean;
    }>>;
    Scroll(request: BrowserScrollRequest): Promise<BrowserOperationResult<{
        ScrollX: number;
        ScrollY: number;
    }>>;
    HighlightElement(request: BrowserCoachMarkRequest): Promise<BrowserOperationResult<{
        HighlightId: string;
    }>>;
    ClearHighlights(highlightId?: string): Promise<BrowserOperationResult<{
        ClearedCount: number;
    }>>;
    WaitForUserAction(request: BrowserWaitForActionRequest): Promise<BrowserOperationResult<{
        Completed: boolean;
        TriggeredBy: string;
    }>>;
    CaptureScreenshot(): Promise<BrowserOperationResult<{ Base64Jpeg: string }>>;
    DetachDebugger(): Promise<void>;
}

/**
 * Content Script DOM execution bridge interface used by `ContentScriptBrowserAdapter` and `ChromeDebuggerBrowserAdapter`.
 */
export interface IContentScriptDomBridge {
    GetPageState(): Promise<BrowserPageStateSnapshot>;
    ClickElement(request: BrowserClickRequest): Promise<BrowserOperationResult<{
        ClickedIndex?: number;
        Selector?: string;
        Healed: boolean;
    }>>;
    FillInput(request: BrowserFillInputRequest): Promise<BrowserOperationResult<{
        FilledIndex?: number;
        Selector?: string;
        Healed: boolean;
    }>>;
    Scroll(request: BrowserScrollRequest): Promise<BrowserOperationResult<{
        ScrollX: number;
        ScrollY: number;
    }>>;
    HighlightElement(request: BrowserCoachMarkRequest): Promise<BrowserOperationResult<{
        HighlightId: string;
    }>>;
    ClearHighlights(highlightId?: string): Promise<BrowserOperationResult<{
        ClearedCount: number;
    }>>;
    WaitForUserAction(request: BrowserWaitForActionRequest): Promise<BrowserOperationResult<{
        Completed: boolean;
        TriggeredBy: string;
    }>>;
    /** Reads a secret value directly from a DOM selector for model-blind vaulting. */
    ExtractSecretValue(selector: string): Promise<string | null>;
}

/**
 * Transport seam for Chrome DevTools Protocol (`chrome.debugger`) used by `ChromeDebuggerBrowserAdapter`.
 */
export interface IChromeDebuggerTransport {
    Attach(tabId: number): Promise<void>;
    Detach(tabId: number): Promise<void>;
    IsAttached(tabId: number): boolean;
    SendCommand<TResult = Record<string, unknown>>(
        tabId: number,
        method: string,
        params?: Record<string, unknown>
    ): Promise<TResult>;
}

// ─── 3. Multi-App Context Braiding (`BrowserContextEngine`) ──────────────────

/**
 * Signal extraction specification inside a {@link BrowserContextRuleSpec}.
 */
export interface BrowserContextSignalSpec {
    Source:
        | 'FullUrl'
        | 'HostnameRoot'
        | 'UrlRegexGroup'
        | 'OpenGraph'
        | 'SchemaOrgJsonLd'
        | 'MetaTag'
        | 'DomCssSelector'
        | 'DomXPath';
    SelectorOrPattern?: string;
    Normalize?: 'Lowercase' | 'Trim' | 'StripTrailingSlash' | 'HostnameRoot';
}

/**
 * Declarative Anchor Entity lookup rule (`BrowserContextRuleSpec`) mapping a web page's URL & DOM signals
 * to a MemberJunction Entity record.
 */
export interface BrowserContextRuleSpec {
    Name: string;
    UrlPattern: string;
    Signals: BrowserContextSignalSpec[];
    TargetEntityName: string;
    LookupFilterTemplate: string;
    CustomExtractorClass?: string;
    AllowCreateIfUnmatched?: boolean;
    Priority?: number;
}

/**
 * Declarative Cross-App Entity Facet (`BrowserEntityFacetSpec`) braided onto a matched Anchor Entity.
 */
export interface BrowserEntityFacetSpec {
    AnchorEntityName: string;
    FacetEntityName: string;
    ForeignKeyField: string;
    ExtraFilter?: string;
    OrderBy?: string;
    MaxRecords?: number;
    CardTemplate: {
        HeaderTitle: string;
        Icon?: string;
        TitleField: string;
        SubtitleField?: string;
        BadgeField?: string;
        SummaryFields?: string[];
    };
}

/**
 * Anchor Entity record matched in Stage 1 of `BrowserContextEngine`.
 */
export interface BrowserAnchorEntityMatch {
    RuleName: string;
    EntityName: string;
    RecordID: string;
    RecordDisplayName: string;
    RecordFields: Record<string, string | number | boolean | null>;
    ExtractedPageSignals: Record<string, string>;
}

/**
 * Single item card inside a Stage 2 Braided Entity Facet.
 */
export interface BraidedEntityFacetItem {
    RecordID: string;
    Title: string;
    Subtitle?: string;
    Badge?: string;
    SummaryValues: Record<string, string>;
}

/**
 * Stage 2 Braided Entity Facet resolved for an Anchor Entity.
 */
export interface BraidedEntityFacetResult {
    AnchorEntityName: string;
    EntityName: string;
    HeaderTitle: string;
    Icon?: string;
    TotalCount: number;
    Items: BraidedEntityFacetItem[];
}

/**
 * Field-level diff between a web page's extracted signal and an MJ Entity record field.
 */
export interface BrowserEntityFieldDiff {
    FieldName: string;
    FieldLabel: string;
    CurrentEntityValue: string | null;
    ExtractedPageValue: string;
    Status: 'add' | 'update' | 'unchanged';
    SelectedForApply: boolean;
}

/**
 * Combined Stage 1 Anchor + Stage 2 Facets + Field Diffs for a matched entity.
 */
export interface BraidedEntityContextMatch {
    Anchor: BrowserAnchorEntityMatch;
    Facets: BraidedEntityFacetResult[];
    FieldDiffs: BrowserEntityFieldDiff[];
}

/**
 * Unmatched page candidate ready for 1-click record creation when `AllowCreateIfUnmatched` is true.
 */
export interface UnmatchedPageEntityCandidate {
    RuleName: string;
    TargetEntityName: string;
    ProposedFields: BrowserEntityFieldDiff[];
}

/**
 * Complete Multi-App Braided Context payload resolved for the active browser tab.
 */
export interface BraidedPageContextPayload {
    PageSnapshot: BrowserPageStateSnapshot;
    Matches: BraidedEntityContextMatch[];
    UnmatchedCandidates: UnmatchedPageEntityCandidate[];
    ResolvedAtIso: string;
}

// ─── 4. Seamless Session Handoff (Topology A & Topology B) ───────────────────

/**
 * Session continuity topology between MJ web apps and the Extension Side Panel:
 * - `'topology-a-shared-daemon'`: 0ms zero-blip shared session daemon inside the Extension Offscreen/SidePanel host.
 * - `'topology-b-warm-resume'`: Warm mid-session handoff resuming via `LastSessionID` continuity.
 */
export type ExtensionSessionTopology = 'topology-a-shared-daemon' | 'topology-b-warm-resume';

/**
 * Payload sent over `externally_connectable` (`chrome.runtime.sendMessage`) from MJ Central / MJ Explorer.
 */
export interface ExtensionSessionHandoffPayload {
    Topology: ExtensionSessionTopology;
    SessionID: string;
    ConversationID: string;
    AgentID: string;
    HostOrigin: string;
    AuthToken?: string;
    ActivePlaybook?: {
        PlaybookID: string;
        StepIndex: number;
        TargetUrl: string;
    };
}

/**
 * Acknowledgment returned by `ExtensionSessionHandoffCoordinator` to the calling MJ web app.
 */
export interface ExtensionSessionHandoffAck {
    Accepted: boolean;
    ActiveTopology: ExtensionSessionTopology;
    ZeroBlipGuaranteed: boolean;
    ExtensionVersion: string;
    BrandSlug: string;
    ErrorMessage?: string;
}

// ─── 5. Guided Cross-Site Playbooks & Model-Blind Secret Vault Pipe ──────────

/**
 * Single step in a Guided Cross-Site Playbook.
 */
export interface BrowserPlaybookStep {
    StepId: string;
    Title: string;
    Instruction: string;
    Kind:
        | 'Navigate'
        | 'HighlightElement'
        | 'WaitForUserAction'
        | 'ClickElement'
        | 'FillInput'
        | 'CopySecretToMJVault';
    NavigateUrl?: string;
    TargetSelector?: string;
    InputValue?: string;
    CalloutPosition?: BrowserCoachMarkCalloutPosition;
    WaitForActionKind?: 'click' | 'input' | 'submit' | 'navigation';
    ExpectedUrlPattern?: string;
    ExpectedFingerprint?: Partial<TraceTarget>;
    RequireTrustedInput?: boolean;
    RequiresConfirmationGate?: boolean;
    VaultCredentialName?: string;
    VaultTargetFieldName?: string;
}

/**
 * Declarative Guided Playbook definition (e.g. HubSpot OAuth setup, Entra ID App Registration).
 */
export interface BrowserPlaybookDefinition {
    Id: string;
    Name: string;
    Description: string;
    StartUrl?: string;
    PreferredBackend?: BrowserControlBackendMode;
    Steps: BrowserPlaybookStep[];
}

/**
 * Execution outcome of a single `BrowserPlaybookStep`.
 */
export interface BrowserPlaybookStepOutcome {
    StepId: string;
    Kind: BrowserPlaybookStep['Kind'];
    Success: boolean;
    BackendUsed: ConcreteBrowserControlBackend;
    EscalatedToDebugger: boolean;
    HealedSelector?: string;
    VaultedFieldName?: string;
    ErrorMessage?: string;
}

/**
 * Request to pipe a secret directly from the DOM into the MJ Credential Vault without entering LLM context.
 */
export interface ModelBlindSecretVaultRequest {
    SourceSelector: string;
    VaultCredentialName: string;
    CredentialTypeName?: string;
    VaultTargetFieldName: string;
}

/**
 * Model-blind receipt returned after a secret is written to the MJ Credential Vault.
 * Never contains the plaintext secret value.
 */
export interface ModelBlindSecretVaultResult {
    Success: boolean;
    CredentialID?: string;
    VaultTargetFieldName: string;
    SecretByteLength: number;
    RedactedPreview: string;
    ModelBlindVerified: true;
    ErrorMessage?: string;
}

// ─── 6. White-Label Brand Stamping (`ExtensionBrandProfile`) & Multi-Browser ──

/**
 * Supported browser targets for MemberJunction Browser Extension builds:
 * - `'chrome'`: Google Chrome (Chromium MV3 `side_panel` + `service_worker` + `offscreen` + optional `debugger`)
 * - `'edge'`: Microsoft Edge (Chromium MV3 `side_panel` + `service_worker` + `offscreen` + optional `debugger`)
 * - `'firefox'`: Mozilla Firefox 128+ (WebExtensions MV3 `sidebar_action` + `background.scripts` + `browser_specific_settings.gecko`)
 * - `'safari'`: Apple Safari 17+ (WebExtensions MV3 `action.default_popup` + `service_worker` + `safari-extension-metadata.json`)
 */
export type BrowserTarget = 'chrome' | 'edge' | 'firefox' | 'safari';

/**
 * Declarative White-Label Brand Profile consumed by `@memberjunction/browser-extension-builder`
 * (`mj-ext-build`) — hydrated either from `MJ: Brand Kits` + `MJ: Applications.AgentSettings.BrowserExtension`
 * metadata rows via `BuildFromMetadata()` or from a brand profile object/file, and hydrated at runtime
 * by `RuntimeBrandKitHydrator`.
 */
export interface ExtensionBrandProfile {
    /** Unique brand slug (`'mj-copilot'`, `'betty'`, `'sidecar'`). */
    BrandSlug: string;
    /** Store/package display name (max 45 chars). */
    BrandName: string;
    /** Short name for toolbar/launcher (max 12 chars). */
    ShortName: string;
    /** Semver version string (e.g. `'6.2.0'`). */
    Version: string;
    /** Store/package description (max 132 chars). */
    Description: string;
    /** Assistant persona display name (e.g. `'MJ Agent'`, `'Betty'`, `'Sidecar'`). */
    AssistantDisplayName: string;
    /** Brandable label for the conversational agent tab in the Side Panel (defaults to `'Agent'`). */
    AgentTabLabel?: string;
    /** Optional header title rendered in the Side Panel chrome (defaults to `BrandName`). */
    SidePanelHeaderTitle?: string;
    /** Welcome tagline displayed in the Side Panel header. */
    Tagline: string;
    /** Default MemberJunction GraphQL API URL pre-populated in onboarding (e.g. `'http://localhost:4000/graphql'`). */
    DefaultServerUrl?: string;
    /** Default OAuth/OIDC provider key (`'msal' | 'auth0' | 'okta' | 'cognito' | 'custom-oidc'`). */
    DefaultAuthProvider?: 'msal' | 'auth0' | 'okta' | 'cognito' | 'custom-oidc';
    /** Optional keyboard shortcut for toggling the Side Panel (e.g. `'Ctrl+Shift+M'`). */
    KeyboardShortcut?: string;
    /** Optional Firefox Gecko add-on ID (e.g. `'mj-copilot@memberjunction.org'`). */
    FirefoxExtensionID?: string;
    /** Optional macOS/iOS Safari Web Extension bundle identifier (e.g. `'org.memberjunction.copilot.extension'`). */
    SafariBundleIdentifier?: string;
    /** Target browsers supported by this brand build (`['chrome', 'edge', 'firefox', 'safari']`). */
    SupportedBrowsers?: BrowserTarget[];
    /** Optional resolved `MJ: Brand Kits` ID when built from MJ metadata rows. */
    BrandKitID?: string;
    /** Default control backend for this brand (`'content-script'` recommended default). */
    DefaultControlBackend: BrowserControlBackendMode;
    /**
     * When `false`, `"debugger"` is omitted from `manifest.json` completely.
     * When `true`, `"debugger"` is placed in `optional_permissions` on Chromium targets so Mode 1 installs cleanly with zero banner.
     */
    IncludeDebuggerPermission: boolean;
    /** Host permissions placed in `manifest.json`. */
    HostPermissions: string[];
    /** Origins allowed to connect via `externally_connectable` for zero-blip session handoff. */
    ExternallyConnectableMatches: string[];
    /** Default blocked domain patterns for `SensitivePageGuard`. */
    BlockedDomains: string[];
    /** `@memberjunction/theme-engine` brand seeds (`primary`, `accent`, `tertiary`, `neutralChroma`, `vibrancy`, `radius`, `fontFamily`). */
    ThemeSeeds: {
        primary: string;
        accent?: string;
        tertiary?: string;
        neutralChroma?: number;
        vibrancy?: number;
        radius?: number;
        depth?: number;
        fontFamily?: string;
        fontFamilyMono?: string;
    };
    /** Relative icon asset paths in the brand directory. */
    Icons: {
        Icon16: string;
        Icon32: string;
        Icon48: string;
        Icon128: string;
    };
    /** Optional starter prompt chips displayed in the Side Panel. */
    SuggestedPrompts?: string[];
}
