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
} from './channels/base-realtime-channel-client';

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
