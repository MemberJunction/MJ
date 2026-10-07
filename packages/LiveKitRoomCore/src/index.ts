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
  DefaultRoomFactory, defaultRoomFactory,
  DefaultRoleResolver, defaultRoleResolver,
  type LiveKitRoomFactory,
  type LiveKitRoleResolver,
  type LiveKitRoomControllerOptions,
  type ILiveKitRoomController,
} from './livekit-room-controller';

export {
  LiveKitAudioMeter,
  AUDIO_METER_BIN_COUNT,
  AUDIO_METER_SILENCE_FLOOR,
  AUDIO_METER_ATTACK,
  AUDIO_METER_DECAY,
  type LiveKitAudioMeterFrame,
} from './audio-meter';

export { LiveKitMediaPreview } from './livekit-preview';
export { LIVEKIT_AGENT_CAN_SEE_ATTRIBUTE, LIVEKIT_AGENT_WATCHES_ATTRIBUTE } from './types';
export { ToMediaParticipant, ToMediaDevice, ToMediaDeviceKind, ToLiveKitDeviceKind, ToScreenShareCaptureOptions } from './media-adapters';
export {
  LiveKitPreviewRoomController,
  LIVEKIT_PREVIEW_PEOPLE,
  LIVEKIT_PREVIEW_ROOM_NAME,
  LIVEKIT_PREVIEW_LOCAL_IDENTITY,
  type LiveKitPreviewPerson,
  type LiveKitPreviewRoomOptions,
} from './livekit-preview-room-controller';
export { ApplyNoiseFilter, applyNoiseFilter, ApplyBackgroundEffect, applyBackgroundEffect } from './livekit-effects';

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
  LiveKitParticipantMedia,
  LiveKitDataMessage,
  LiveKitRoomError,
  LiveKitLocalMediaState,
  LiveKitDevice,
  LiveKitRoomConnectOptions,
  LiveKitRoomState,
  LiveKitTrackSourceMapper,
  LiveKitBackgroundEffect,
  LiveKitE2EEOptions,
} from './types';
