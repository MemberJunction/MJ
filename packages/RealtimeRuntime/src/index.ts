/**
 * @fileoverview Public entry point for `@memberjunction/realtime-runtime`.
 *
 * Framework-agnostic orchestration for MemberJunction **client-direct realtime co-agent sessions**:
 * minting a session, resolving the provider's client driver, wiring transcripts and captions,
 * relaying tool calls, pacing delegation progress narration, managing interactive channels, relaying
 * usage, and tearing all of it down cleanly.
 *
 * ## Why this package exists
 *
 * This code shipped inside `@memberjunction/ng-conversations` as an `@Injectable` Angular service.
 * It was never Angular-specific — its own header noted it stays component-free so it "must stay
 * importable in plain-node tests" — but living in an Angular package made it unusable from any
 * other host. A React Native app, a React or Vue surface, or a headless test harness had no way to
 * drive a realtime session except by reimplementing ~2,700 lines that already existed, and then
 * watching the two copies drift apart at the next protocol change.
 *
 * Extracting it follows the precedent set by `@memberjunction/conversations-runtime`, which did the
 * same for chat orchestration. The Angular service remains — as a thin adapter that supplies the
 * browser's media host and the `@Injectable` shell — so Explorer is unchanged.
 *
 * ## What a host must provide
 *
 * Exactly one thing: an {@link IRealtimeMediaHost}. Microphone acquisition and audio recording are
 * platform decisions (permission UX, container format, where bytes live), so they sit behind that
 * seam. Everything else in a realtime session is portable and lives here.
 *
 * @module @memberjunction/realtime-runtime
 */

// The session runtime itself — the orchestration a host subclasses or composes.
export { RealtimeSessionRuntime } from './session/RealtimeSessionRuntime';

// Session-facing types a host or UI binds to.
export {
    REALTIME_RECORDING_CONSENT_KEY,
    type RealtimeConnectionState,
    type RealtimeCaption,
    type RealtimeDelegationProgress,
    type RealtimeDelegationResult,
    type RealtimeClientToolHandler,
    type RealtimeChannelFocusEvent,
    type RealtimeDelegationNarration,
    type RealtimeThoughtNarration,
    type StartRealtimeClientSessionResult,
    type RealtimeSessionRunOptions,
} from './session/RealtimeSessionRuntime';

// How a session is minted — the seam an app implements to replace the stock mint.
export {
    DefaultRealtimeSessionLauncher,
    type IRealtimeSessionLauncher,
    type RealtimeSessionLaunchRequest,
    type RealtimeSessionLaunchContext,
} from './session/session-launcher';

// Session events — the server's typed channel back to the session's client, and the client's deadline copy.
export {
    RealtimeSessionEventHub,
    type IRealtimeSessionEventSource,
    type RealtimeSessionEventHubOptions,
    type RealtimeSessionStreamEvent,
    type RealtimeSessionVerificationSnapshot,
} from './session/session-event-hub';
export { ClientSessionDeadline } from './session/client-session-deadline';

// Channel scoping inputs a host supplies at session start.
export {
    type RealtimeHostChannelDeclaration,
    type RealtimeSessionStartOptions,
} from './session/channel-session-scope';

// The user's own per-channel choice of how much the agent may perceive (the "agent can see" control's store).
export {
    InMemoryChannelExposurePreferences,
    ParseExposurePreferences,
    SerializeExposurePreferences,
    UserSettingsExposurePreferences,
    VISUAL_PERCEPTION_SETTING_KEY,
    type IChannelExposurePreferences,
} from './session/channel-exposure-preferences';

// Owner-keyed registration of the client tools a host can run for the `ContextTool` proxy.
export {
    DEFAULT_APP_TOOL_OWNER,
    type AppClientToolRegistration,
    type RealtimeAppClientToolHandler,
} from './session/app-client-tool-registry';

// The platform seam.
export {
    type IRealtimeMediaHost,
    type IRealtimeSessionRecorder,
} from './hosts/IRealtimeMediaHost';

// Interactive channel plugin contract — the client half of the channel registry.
export {
    BaseRealtimeChannelClient,
    type RealtimeChannelContext,
    type RealtimeSurfaceComponentType,
    type ChannelOnboardingDetails,
    type VisualPerceptionOptions,
    type ChannelExposureSettings,
} from './channels/base-realtime-channel-client';

// Channel contract v2 — the runtime half (events, outputs, verb results, `ContextTool` addressing).
// The declarative half (descriptors, scoping, policy) lives in `@memberjunction/ai-core-plus`.
export {
    type RealtimeChannelVerbResult,
    type RealtimeChannelEvent,
    type RealtimeChannelOutput,
    type RealtimeChannelTarget,
    type RealtimeContextActionRequest,
    type RealtimeContextActionResult,
    type RealtimeContextErrorCode,
} from './channels/channel-contract-types';
export { SynthesizeChannelDescriptor, BuildToolBackedVerbs, VerbNameForTool } from './channels/channel-descriptor-synthesis';
export { ChannelActionDispatcher, CHANNEL_OPEN_ACTION, type ChannelDispatchHost, type DispatchableChannel } from './channels/channel-action-dispatcher';
export { ComputeStateDelta, FormatChannelNote, ListChangedPaths, type StateDelta } from './channels/channel-state-delta';
export { FormatParameterList } from './channels/channel-schema-format';
export { BuildChannelCatalogNote, type ChannelCatalogEntry } from './channels/channel-catalog-note';
export {
    VisualPerceptionPump,
    type VisualFrameReason,
    type VisualFrameSink,
    type VisualPerceptionPumpHost,
} from './channels/channel-visual-pump';
export {
    ChannelPerceptionCoalescer,
    DEFAULT_CHANNEL_PERCEPTION_OPTIONS,
    type ChannelPerceptionHost,
    type ChannelPerceptionOptions,
} from './channels/channel-perception';

// Delegation result parsing + narration instruction assembly.
export {
    ParseDelegationResultJson,
    type ParsedDelegationArtifact,
    type ParsedDelegationResult,
    FormatToolName,
} from './session/delegation-result-parser';
export {
    BuildNarrationInstructions,
    DefaultNarrationInstructions,
    type NarrationBuildOptions,
} from './narration/narration-template';
