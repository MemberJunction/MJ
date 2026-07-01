/**
 * @fileoverview Public API for @memberjunction/realtime-widget + auto-bootstrap when loaded
 * as a browser bundle. Only exports symbols defined in this package (no cross-package
 * re-exports — CLAUDE rule 5).
 *
 * @module @memberjunction/realtime-widget
 */

export * from './types.js';
export { WidgetSessionClient, type FetchLike } from './session/widget-session-client.js';
export type { IWidgetTransport, WidgetProgressCallback, WidgetTurnResult } from './transport/widget-transport.js';
export { MockWidgetTransport } from './transport/mock-widget-transport.js';
export { RuntimeWidgetTransport } from './transport/runtime-widget-transport.js';
export type {
    IVoiceController,
    VoiceControllerCallbacks,
    WidgetVoiceState,
    WidgetVoiceTranscript,
} from './voice/voice-controller.js';
export { MockVoiceController } from './voice/mock-voice-controller.js';
export {
    RealtimeVoiceController,
    type VoiceMintFn,
    type VoiceMintResult,
} from './voice/realtime-voice-controller.js';
export {
    VoiceAbuseGuard,
    DEFAULT_VOICE_LIMITS,
    type VoiceAbuseLimits,
    type VoiceAbortReason,
} from './voice/voice-abuse-guard.js';
export {
    BaseWidgetChannel,
    type WidgetChannelToolDefinition,
    type WidgetChannelContext,
} from './voice/channels/base-widget-channel.js';
export { WidgetChannelHost, type ChannelToolRouteResult } from './voice/channels/widget-channel-host.js';
export { WidgetWhiteboardChannel, LoadWidgetWhiteboardChannel } from './voice/channels/whiteboard-channel.js';
export { SupportWidgetElement, defineSupportWidgetElement, WIDGET_TAG_NAME } from './ui/support-widget-element.js';
export { WIDGET_SHADOW_STYLES } from './ui/tokens.js';
export { mountWidget, bootstrapFromDocument, type WidgetMountDeps } from './loader.js';

import { defineSupportWidgetElement } from './ui/support-widget-element.js';
import { bootstrapFromDocument } from './loader.js';

// When loaded in a browser, register the element and attempt auto-bootstrap from the
// host's [data-widget-key] element. No-ops cleanly server-side or when nothing matches.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    defineSupportWidgetElement();
    const run = (): void => {
        void bootstrapFromDocument();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
        run();
    }
}
