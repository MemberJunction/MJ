/**
 * @fileoverview {@link LiveKitWebhookParser}: verifies and reads LiveKit's server webhooks.
 *
 * LiveKit posts room and participant events (`room_started`, `participant_joined`, `participant_left`, …) to a URL
 * configured on the project, signed with the project's API secret. For phone calls the event MJ acts on is a **SIP
 * participant joining a room**: it is how MJ learns that a call arrived and which number was dialed. This parser checks
 * the signature (a forged event must never make MJ start an agent) and reduces the SDK's protobuf event to a plain value.
 *
 * @module @memberjunction/livekit-room-server
 */

import { WebhookReceiver } from 'livekit-server-sdk';
import { LiveKitTokenService, type LiveKitServerConfig } from './livekit-token-service';
import { LIVEKIT_PARTICIPANT_KIND_SIP, LIVEKIT_SIP_ATTRIBUTES } from './livekit-sip-service';
import { RoomAudioPlayer } from './room-audio/room-audio-player';

/** A LiveKit webhook event reduced to what MJ looks at. */
export interface LiveKitRoomWebhookEvent {
  /** The event name, e.g. `participant_joined`. */
  Event: string;
  RoomName: string;
  ParticipantIdentity: string;
  /** True when the participant is a phone (SIP) participant. */
  IsSipParticipant: boolean;
  /** The caller's number, for a SIP participant (`sip.phoneNumber`). */
  CallerNumber?: string;
  /** The number that was dialed, for a SIP participant (`sip.trunkPhoneNumber`). */
  DialedNumber?: string;
  /** LiveKit's call id, for a SIP participant. */
  SipCallID?: string;
}

/** The part of the SDK receiver the parser uses (so tests inject a fake). */
export interface WebhookReceiverLike {
  receive(body: string, authHeader?: string): Promise<{
    event: string;
    room?: { name: string };
    participant?: { identity: string; kind: number; attributes: { [key: string]: string } };
  }>;
}

/** Verifies and parses LiveKit webhooks. */
export class LiveKitWebhookParser {
  private readonly receiver: WebhookReceiverLike;

  /**
   * @param config Explicit credentials; omitted fields fall back to the `LIVEKIT_*` environment variables.
   * @param receiver Injectable receiver (tests); defaults to the SDK's `WebhookReceiver`.
   * @throws {Error} when no receiver is injected and the API key and secret are not configured.
   */
  constructor(config?: Partial<LiveKitServerConfig>, receiver?: WebhookReceiverLike) {
    if (receiver) {
      this.receiver = receiver;
      return;
    }
    const apiKey = config?.ApiKey ?? process.env.LIVEKIT_API_KEY ?? '';
    const apiSecret = config?.ApiSecret ?? process.env.LIVEKIT_API_SECRET ?? '';
    if (!new LiveKitTokenService(config).IsConfigured) {
      throw new Error('LiveKit webhooks cannot be verified: LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET are not all set.');
    }
    this.receiver = new WebhookReceiver(apiKey, apiSecret);
  }

  /**
   * Verifies the request's signature and returns the event.
   *
   * One event is also acted on here, because every LiveKit webhook MJ receives passes through this method: on a
   * verified `room_finished` the room's {@link RoomAudioPlayer} playbacks (hold music) are stopped, so a bot never
   * outlives its room. That cleanup runs in the background and never throws.
   *
   * @param body The raw request body (the signature covers the exact bytes, so do not re-serialise parsed JSON).
   * @param authHeader The request's `Authorization` header.
   * @throws {Error} when the signature is missing or does not verify.
   */
  public async Parse(body: string, authHeader?: string): Promise<LiveKitRoomWebhookEvent> {
    const event = await this.receiver.receive(body, authHeader);
    const participant = event.participant;
    const isSip = participant?.kind === LIVEKIT_PARTICIPANT_KIND_SIP;
    const attributes = participant?.attributes ?? {};
    const roomName = event.room?.name ?? '';
    if (event.event === 'room_finished' && roomName) {
      void RoomAudioPlayer.Instance.StopAllInRoom(roomName);
    }
    return {
      Event: event.event,
      RoomName: roomName,
      ParticipantIdentity: participant?.identity ?? '',
      IsSipParticipant: isSip,
      CallerNumber: isSip ? attributes[LIVEKIT_SIP_ATTRIBUTES.CallerNumber] : undefined,
      DialedNumber: isSip ? attributes[LIVEKIT_SIP_ATTRIBUTES.DialedNumber] : undefined,
      SipCallID: isSip ? attributes[LIVEKIT_SIP_ATTRIBUTES.CallID] : undefined,
    };
  }
}
