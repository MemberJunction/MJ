/**
 * Strongly-typed shape of `AIRemoteBrowserProvider.SupportedFeatures` (the
 * `MJ: AI Remote Browser Providers` entity), bound to the column via JSONType metadata so
 * CodeGen emits a typed accessor.
 *
 * A *remote browser provider* is a backend that hosts a real, live browser the Remote Browser
 * channel drives while an agent talks — self-hosted headless Chrome (MJ orchestrates a
 * lightweight container) or a browser-as-a-service (Browserbase / Steel / Browserless /
 * Hyperbrowser). Every backend sits on the SAME primitive: a Chrome DevTools Protocol (CDP)
 * endpoint that `@memberjunction/computer-use` attaches to. These flags declare what each
 * backend's driver supports. The Remote Browser engine **gates** every optional driver call on
 * the matching flag; `BaseRemoteBrowserProvider` additionally throws
 * `RemoteBrowserCapabilityNotSupportedError` if a feature is claimed here but the driver hasn't
 * implemented it (defense-in-depth — exactly like the bridge `IBridgeProviderFeatures` model).
 * All properties are optional — an omitted flag means the feature is **not** supported.
 *
 * Holding these as JSON (rather than dedicated BIT columns) keeps the table simple and lets new
 * backend capabilities be added without a schema migration — just extend this interface.
 *
 * NOTE: control *mode* (AgentOnly / ViewOnly / Collaborative) is NOT a feature flag — it is a
 * per-provider default (`DefaultControlMode`) plus a per-channel / runtime override. A mode only
 * has to be *supported* by the underlying capabilities here (Collaborative needs
 * {@link IRemoteBrowserProviderFeatures.HumanTakeover}; ViewOnly/Collaborative need
 * {@link IRemoteBrowserProviderFeatures.LiveView}).
 *
 * See `/plans/realtime/realtime-bridges-architecture.md` (§4d).
 */
export interface IRemoteBrowserProviderFeatures {
    // ── Control substrate & strategies ──────────────────────────────────────────
    /**
     * The backend exposes a raw CDP endpoint MJ's computer-use layer connects to and drives
     * directly. This is the UNIVERSAL substrate — every backend supports it — and the default
     * control strategy: the realtime agent emits tool calls and our adapter executes DOM actions.
     */
    RawCdpControl?: boolean;
    /**
     * The backend offers a FIRST-PARTY AI-control harness invoked via its API (e.g. Browserbase
     * Stagehand's act/extract/observe). An optional accelerator for heavy, robust, autonomous
     * automation — the engine may delegate high-level intents to it where available and opted-in,
     * instead of the default computer-use loop. (OSS Stagehand-over-CDP is a control *strategy*
     * the engine can run over RawCdpControl on any backend; this flag is specifically a provider's
     * own hosted harness.)
     */
    NativeAIControl?: boolean;

    // ── Viewing & collaboration ─────────────────────────────────────────────────
    /**
     * The backend exposes a live-view stream / embeddable session URL so humans can watch the
     * browser without MJ encoding frames itself. Required for ViewOnly and Collaborative modes.
     */
    LiveView?: boolean;
    /**
     * A human can take the wheel — their pointer/keyboard events route into the backend's browser.
     * Required for Collaborative mode (e.g. a trainer agent: demonstrate, then "your turn").
     */
    HumanTakeover?: boolean;
    /**
     * A continuous video stream of the viewport is available (CDP `Page.startScreencast` for
     * self-host, or the provider's live-view stream) — the source for the channel's ScreenOut
     * track when screen-sharing the browser into a meeting.
     */
    ScreenStreaming?: boolean;

    // ── Operational capabilities ────────────────────────────────────────────────
    /** Anti-bot stealth / fingerprint evasion for sites that block automation. */
    Stealth?: boolean;
    /** Outbound traffic routes through a (geo-)proxy / controlled egress. */
    ProxyEgress?: boolean;
    /** The backend records the session (video / trace) for later review. */
    SessionRecording?: boolean;
    /** Persistent browser profiles / authenticated contexts survive across sessions. */
    PersistentContext?: boolean;
    /** Multiple tabs / pages within one session. */
    MultiTab?: boolean;
    /** File downloads triggered in the browser are captured and retrievable. */
    FileDownloads?: boolean;
    /** Built-in CAPTCHA solving. */
    CaptchaSolving?: boolean;
}
