import { IRemoteBrowserProviderFeatures } from './remote-browser-features';

/**
 * How control of the remote browser is shared between the agent and humans — a per-provider default
 * (`MJ: AI Remote Browser Providers.DefaultControlMode`) that the `RemoteBrowserChannel` config
 * overrides per-channel and at runtime.
 *
 * This is **distinct from** {@link RemoteBrowserControlStrategy}: the *mode* is the human/agent
 * sharing policy, the *strategy* is the mechanism by which the agent decides what to do.
 *
 * - `AgentOnly` — only the agent drives; no human takeover (e.g. a hands-off sales demo).
 * - `ViewOnly` — the agent drives while humans **watch** the live view but cannot take the wheel.
 *   Requires the backend's `LiveView` capability.
 * - `Collaborative` — a human can **grab the wheel** (e.g. a trainer agent: demonstrate a task, then
 *   "your turn, try X"). Requires both `LiveView` (to watch) and `HumanTakeover` (to drive).
 *
 * @see `/plans/realtime/realtime-bridges-architecture.md` §4d-i.
 */
export type RemoteBrowserControlMode = 'AgentOnly' | 'ViewOnly' | 'Collaborative';

/**
 * The mechanism by which the agent decides *what to click/type/navigate* — a pluggable strategy
 * gated by capability, orthogonal to the {@link RemoteBrowserControlMode}.
 *
 * - `ComputerUse` — MJ's own perception→action loop over the universal CDP substrate
 *   (`@memberjunction/computer-use`). The default; works on every backend that exposes
 *   `RawCdpControl`. The right fit for a realtime co-agent that is already a powerful brain emitting
 *   tool calls while it talks.
 * - `NativeAI` — delegate high-level intents to the backend's own first-party AI-control harness
 *   (e.g. Browserbase Stagehand, Hyperbrowser agent). An optional accelerator for heavy, robust
 *   autonomous automation; it runs its own model loop, so it is offered, never the default. Requires
 *   the backend's `NativeAIControl` capability.
 *
 * @see `/plans/realtime/realtime-bridges-architecture.md` §4d-i ("Control is a pluggable STRATEGY").
 */
export type RemoteBrowserControlStrategy = 'ComputerUse' | 'NativeAI';

/**
 * Determines whether a {@link RemoteBrowserControlMode} is valid given a backend's capabilities.
 *
 * A mode is only valid when the backend supports the capabilities it requires:
 * - `AgentOnly` — always valid (the agent drives; no viewing/takeover prerequisite).
 * - `ViewOnly` — requires `LiveView` (humans must be able to watch).
 * - `Collaborative` — requires `LiveView` **and** `HumanTakeover` (humans watch *and* can take over).
 *
 * @param mode The control mode to validate.
 * @param features The backend's capability flags.
 * @returns `true` when the backend can support the mode, `false` otherwise.
 */
export function isControlModeSupported(
    mode: RemoteBrowserControlMode,
    features: IRemoteBrowserProviderFeatures,
): boolean {
    switch (mode) {
        case 'AgentOnly':
            return true;
        case 'ViewOnly':
            return features.LiveView === true;
        case 'Collaborative':
            return features.LiveView === true && features.HumanTakeover === true;
        default:
            // Exhaustive — `mode` is `never` here; any unhandled member is a compile error above.
            return false;
    }
}

/**
 * Resolves which {@link RemoteBrowserControlStrategy} the engine should use for a backend, honoring an
 * optional caller preference.
 *
 * **Precedence (highest to lowest):**
 * 1. **`NativeAI`** — chosen *only* when the backend advertises `NativeAIControl` **and** the caller
 *    did not explicitly pin `ComputerUse`. (A caller preference of `'NativeAI'` is honored only if the
 *    backend actually supports it; an explicit `'ComputerUse'` always suppresses native delegation.)
 * 2. **`ComputerUse`** — the universal default, chosen whenever the backend exposes the
 *    `RawCdpControl` substrate and native control was not selected above.
 * 3. **`ComputerUse`** — also the fallback when neither flag is set, because CDP-connect is the one
 *    primitive every backend is expected to provide; emitting `ComputerUse` lets the caller surface a
 *    clear downstream error if the backend genuinely cannot be driven, rather than this helper
 *    inventing an unsupported strategy.
 *
 * @param features The backend's capability flags.
 * @param preferred An optional caller preference; `'ComputerUse'` pins the universal loop and
 *  suppresses native delegation even when the backend supports it.
 * @returns The resolved control strategy.
 */
export function resolveControlStrategy(
    features: IRemoteBrowserProviderFeatures,
    preferred?: RemoteBrowserControlStrategy,
): RemoteBrowserControlStrategy {
    if (features.NativeAIControl === true && preferred !== 'ComputerUse') {
        return 'NativeAI';
    }
    return 'ComputerUse';
}
