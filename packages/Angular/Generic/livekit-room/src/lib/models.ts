import type { LiveKitDevice } from '@memberjunction/livekit-room-core';

/** One chat message rendered in the chat panel (sourced from the LiveKit data channel). */
export interface LiveKitChatMessage {
    /** The sender's display name. */
    Sender: string;
    /** The sender's participant identity, when known. */
    SenderIdentity?: string;
    /** The message text. */
    Text: string;
    /** Epoch-ms timestamp. */
    Timestamp: number;
    /** Whether the local user sent this message. */
    IsLocal: boolean;
}

/** A selection emitted by the device menu. */
export interface LiveKitDeviceSelection {
    /** The device kind being switched. */
    Kind: LiveKitDevice['Kind'];
    /** The selected device id. */
    DeviceId: string;
}

/** The set of devices the device menu renders. */
export interface LiveKitDeviceLists {
    /** Available microphones. */
    Microphones: LiveKitDevice[];
    /** Available cameras. */
    Cameras: LiveKitDevice[];
    /** Available speakers (audio outputs). */
    Speakers: LiveKitDevice[];
}

/** The data-channel topic the chat panel publishes/consumes under. */
export const LIVEKIT_CHAT_TOPIC = 'lk-chat';
