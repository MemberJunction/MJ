/**
 * @fileoverview Public entry point for `@memberjunction/livekit-room-core`.
 *
 * Framework-agnostic, pure-TypeScript core for the MJ-native realtime room UX. Wraps `livekit-client`
 * into an observable {@link LiveKitRoomController} and supporting helpers, consumable from any framework.
 *
 * @module @memberjunction/livekit-room-core
 */

export {
    LiveKitRoomController,
    defaultRoomFactory,
    defaultRoleResolver,
    type LiveKitRoomFactory,
    type LiveKitRoleResolver,
    type LiveKitRoomControllerOptions,
} from './livekit-room-controller';

export {
    LiveKitAudioMeter,
    AUDIO_METER_BIN_COUNT,
    AUDIO_METER_SILENCE_FLOOR,
    type LiveKitAudioMeterFrame,
} from './audio-meter';

export {
    LiveKitRoomEventBus,
    type LiveKitEventHandler,
    type LiveKitRoomEventMap,
    type LiveKitCancelableEvent,
    type LiveKitBeforeConnectEvent,
    type LiveKitBeforeDisconnectEvent,
    type LiveKitBeforeMediaToggleEvent,
    type LiveKitBeforeSendDataEvent,
    type LiveKitBeforeDeviceSwitchEvent,
    type LiveKitParticipantJoinedEvent,
    type LiveKitParticipantLeftEvent,
    type LiveKitActiveSpeakersEvent,
    type LiveKitDisconnectedEvent,
} from './events';

export type {
    LiveKitConnectionStatus,
    LiveKitDisconnectReason,
    LiveKitParticipantRole,
    LiveKitTrackKind,
    LiveKitParticipantView,
    LiveKitDataMessage,
    LiveKitRoomError,
    LiveKitLocalMediaState,
    LiveKitDevice,
    LiveKitRoomConnectOptions,
    LiveKitRoomState,
    LiveKitTrackSourceMapper,
} from './types';
