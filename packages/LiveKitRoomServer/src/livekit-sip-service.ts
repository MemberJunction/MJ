/**
 * @fileoverview {@link LiveKitSipService}: the server-side LiveKit SIP and room-presence operations MJ needs to put
 * phone calls into rooms.
 *
 * LiveKit SIP is the SIP gateway in front of a LiveKit deployment. A carrier's SIP trunk (Twilio Elastic SIP Trunking,
 * Telnyx, …) points at it; an **inbound trunk** says which numbers LiveKit accepts calls for and a **dispatch rule** says
 * which room an accepted call lands in. This service wraps the three things MJ does with it:
 *
 * - **inbound routing**: make sure an inbound trunk and an `individual` dispatch rule exist, so a call to one of the
 *   configured numbers lands in a fresh room named `<prefix>…` (idempotent: it finds before it creates);
 * - **dial out**: `createSipParticipant`, which makes the room call a phone number and adds that call to the room as a
 *   participant (an outbound call, a fallback leg, a blind transfer to a number);
 * - **presence**: whether a given participant is currently in a room, and removing one (hanging up a SIP leg).
 *
 * The SDK clients are injected (`SipClientLike`, `RoomServiceClientLike`) so the logic is unit-tested without a network.
 * Credentials come from the same `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` the token service uses.
 *
 * @module @memberjunction/livekit-room-server
 */

import { ParticipantInfo_State, RoomServiceClient, SipClient } from 'livekit-server-sdk';
import { LogStatus } from '@memberjunction/core';
import { LiveKitTokenService, type LiveKitServerConfig } from './livekit-token-service';
import { WsToHttpUrl } from './livekit-egress-service';

/** The `ParticipantInfo.Kind` value LiveKit gives a SIP participant (`ParticipantInfo.Kind.SIP`). */
export const LIVEKIT_PARTICIPANT_KIND_SIP = 3;

/** Participant attributes LiveKit SIP sets on a phone participant. */
export const LIVEKIT_SIP_ATTRIBUTES = {
  /** The caller's number. */
  CallerNumber: 'sip.phoneNumber',
  /** The number that was dialed (the trunk number). */
  DialedNumber: 'sip.trunkPhoneNumber',
  CallStatus: 'sip.callStatus',
  CallID: 'sip.callID',
} as const;

/** How long the LiveKit API is given to answer a dial request that waits for the call to be answered. */
export const SIP_DIAL_REQUEST_TIMEOUT_SECONDS = 60;

/** The longest one dialed call may last. A safety ceiling; the call's own duration cap is enforced by MJ. */
export const SIP_DIAL_MAX_DURATION_SECONDS = 3600;

/** The SIP operations the service uses (a `Pick` so tests inject a fake). */
export type SipClientLike = Pick<
  SipClient,
  'createSipParticipant' | 'listSipInboundTrunk' | 'listSipOutboundTrunk' | 'createSipInboundTrunk' | 'listSipDispatchRule' | 'createSipDispatchRule'
>;

/** The room operations the service uses (a `Pick` so tests inject a fake). */
export type RoomServiceClientLike = Pick<RoomServiceClient, 'listParticipants' | 'removeParticipant'>;

/** One participant in a room, reduced to what MJ looks at. */
export interface RoomParticipantSummary {
  Identity: string;
  Name: string;
  /** True for a phone (SIP) participant. */
  IsSip: boolean;
  /** True once the participant's media connection is established. */
  IsConnected: boolean;
  Attributes: Record<string, string>;
}

/** A SIP trunk, reduced to what MJ validates and reports. */
export interface SipTrunkSummary {
  TrunkID: string;
  Name: string;
  Numbers: string[];
}

/** What a dial-out needs. */
export interface DialSipParticipantParams {
  RoomName: string;
  /** The outbound trunk to dial through. */
  TrunkID: string;
  /** The number to dial, E.164. */
  Number: string;
  /** The identity the call joins the room with (stable, so presence can be checked). */
  ParticipantIdentity: string;
  DisplayName?: string;
  /** The caller ID to present. Defaults to the trunk's number. */
  FromNumber?: string;
  /** Seconds the number may ring. */
  RingTimeoutSeconds?: number;
  /** Block until the call is answered (default true). */
  WaitUntilAnswered?: boolean;
}

/** What inbound routing needs. */
export interface EnsureInboundRoutingParams {
  /** The numbers LiveKit accepts calls for. */
  Numbers: string[];
  /** Calls land in a room whose name starts with this. */
  RoomPrefix: string;
  /** A name for anything created. */
  Name?: string;
  /** Source addresses allowed to call the trunk (the carrier's signalling addresses). Empty allows any. */
  AllowedAddresses?: string[];
  /** SIP digest credentials the carrier must present, when the trunk uses them. */
  AuthUsername?: string;
  AuthPassword?: string;
}

/** The outcome of {@link LiveKitSipService.EnsureInboundRouting}. */
export interface InboundRoutingResult {
  TrunkID: string;
  DispatchRuleID: string;
  /** True when this call created the trunk. */
  CreatedTrunk: boolean;
  /** True when this call created the dispatch rule. */
  CreatedDispatchRule: boolean;
}

/** SIP and presence operations against a LiveKit deployment. */
export class LiveKitSipService {
  private readonly config: Partial<LiveKitServerConfig>;
  private sip?: SipClientLike;
  private rooms?: RoomServiceClientLike;

  /**
   * @param config Explicit credentials; omitted fields fall back to the `LIVEKIT_*` environment variables.
   * @param sip Injectable SIP client (tests); defaults to a real `SipClient`, built on first use.
   * @param rooms Injectable room-service client (tests); defaults to a real `RoomServiceClient`, built on first use.
   */
  constructor(config?: Partial<LiveKitServerConfig>, sip?: SipClientLike, rooms?: RoomServiceClientLike) {
    this.config = config ?? {};
    this.sip = sip;
    this.rooms = rooms;
  }

  /** Whether the LiveKit credentials needed to call the API are present. */
  public get IsConfigured(): boolean {
    return new LiveKitTokenService(this.config).IsConfigured;
  }

  // ── presence ─────────────────────────────────────────────────────────────────

  /** The participants currently in a room. A room that does not exist (nobody has joined) has none. */
  public async ListParticipants(roomName: string): Promise<RoomParticipantSummary[]> {
    const participants = await this.roomClient().listParticipants(roomName);
    return participants.map((p) => ({
      Identity: p.identity,
      Name: p.name,
      IsSip: p.kind === LIVEKIT_PARTICIPANT_KIND_SIP,
      IsConnected: p.state === ParticipantInfo_State.JOINED || p.state === ParticipantInfo_State.ACTIVE,
      Attributes: { ...p.attributes },
    }));
  }

  /** Whether a participant with this identity is in the room with an established connection. */
  public async IsParticipantPresent(roomName: string, identity: string): Promise<boolean> {
    const wanted = identity.toLowerCase();
    const participants = await this.ListParticipants(roomName);
    return participants.some((p) => p.IsConnected && p.Identity.toLowerCase() === wanted);
  }

  /** Removes a participant from a room (hangs up a phone leg). */
  public async RemoveParticipant(roomName: string, identity: string): Promise<void> {
    await this.roomClient().removeParticipant(roomName, identity);
  }

  // ── dial out ─────────────────────────────────────────────────────────────────

  /**
   * Calls a number and adds the call to the room. By default the request blocks until the call is answered, so a
   * resolved promise means the other side picked up; a throw means it did not (busy, no answer, refused).
   */
  public async DialIntoRoom(params: DialSipParticipantParams): Promise<void> {
    await this.sipClient().createSipParticipant(params.TrunkID, params.Number, params.RoomName, {
      participantIdentity: params.ParticipantIdentity,
      participantName: params.DisplayName,
      fromNumber: params.FromNumber,
      ringingTimeout: params.RingTimeoutSeconds,
      maxCallDuration: SIP_DIAL_MAX_DURATION_SECONDS,
      waitUntilAnswered: params.WaitUntilAnswered ?? true,
      timeout: SIP_DIAL_REQUEST_TIMEOUT_SECONDS,
    });
  }

  // ── trunks and routing ───────────────────────────────────────────────────────

  /** The inbound trunks LiveKit has, optionally only those that include one of the numbers. */
  public async ListInboundTrunks(numbers?: string[]): Promise<SipTrunkSummary[]> {
    const trunks = await this.sipClient().listSipInboundTrunk(numbers?.length ? { numbers } : undefined);
    return trunks.map((t) => ({ TrunkID: t.sipTrunkId, Name: t.name, Numbers: [...t.numbers] }));
  }

  /** The outbound trunks LiveKit has. */
  public async ListOutboundTrunks(): Promise<SipTrunkSummary[]> {
    const trunks = await this.sipClient().listSipOutboundTrunk();
    return trunks.map((t) => ({ TrunkID: t.sipTrunkId, Name: t.name, Numbers: [...t.numbers] }));
  }

  /** Whether the outbound trunk id exists on this LiveKit deployment. */
  public async OutboundTrunkExists(trunkID: string): Promise<boolean> {
    const trunks = await this.ListOutboundTrunks();
    return trunks.some((t) => t.TrunkID === trunkID);
  }

  /**
   * Makes sure calls to `Numbers` land in a new room named `<RoomPrefix>…`: finds (or creates) the inbound trunk for
   * the numbers and an `individual` dispatch rule with the prefix on it. Safe to run on every start: it only creates
   * what is missing.
   */
  public async EnsureInboundRouting(params: EnsureInboundRoutingParams): Promise<InboundRoutingResult> {
    const name = params.Name ?? 'MemberJunction inbound';
    const existingTrunk = (await this.ListInboundTrunks(params.Numbers)).find((t) => params.Numbers.every((n) => t.Numbers.includes(n)));
    const trunk = existingTrunk ?? (await this.createInboundTrunk(name, params));
    const rule = await this.findDispatchRule(trunk.TrunkID, params.RoomPrefix);
    if (rule) {
      return { TrunkID: trunk.TrunkID, DispatchRuleID: rule, CreatedTrunk: !existingTrunk, CreatedDispatchRule: false };
    }
    const created = await this.sipClient().createSipDispatchRule({ type: 'individual', roomPrefix: params.RoomPrefix }, { name: `${name} dispatch`, trunkIds: [trunk.TrunkID] });
    LogStatus(`[LiveKitSip] created dispatch rule ${created.sipDispatchRuleId} (rooms '${params.RoomPrefix}…') on trunk ${trunk.TrunkID}.`);
    return { TrunkID: trunk.TrunkID, DispatchRuleID: created.sipDispatchRuleId, CreatedTrunk: !existingTrunk, CreatedDispatchRule: true };
  }

  private async createInboundTrunk(name: string, params: EnsureInboundRoutingParams): Promise<SipTrunkSummary> {
    const created = await this.sipClient().createSipInboundTrunk(name, params.Numbers, {
      allowedAddresses: params.AllowedAddresses?.length ? params.AllowedAddresses : undefined,
      authUsername: params.AuthUsername,
      authPassword: params.AuthPassword,
    });
    LogStatus(`[LiveKitSip] created inbound trunk ${created.sipTrunkId} for ${params.Numbers.length} number(s).`);
    return { TrunkID: created.sipTrunkId, Name: created.name, Numbers: [...created.numbers] };
  }

  /** The id of an `individual` dispatch rule on the trunk whose room prefix matches, if there is one. */
  private async findDispatchRule(trunkID: string, roomPrefix: string): Promise<string | undefined> {
    const rules = await this.sipClient().listSipDispatchRule({ trunkIds: [trunkID] });
    const match = rules.find((r) => r.rule?.rule.case === 'dispatchRuleIndividual' && r.rule.rule.value.roomPrefix === roomPrefix);
    return match?.sipDispatchRuleId;
  }

  // ── clients ──────────────────────────────────────────────────────────────────

  private sipClient(): SipClientLike {
    if (!this.sip) {
      const { host, apiKey, apiSecret } = this.credentials();
      this.sip = new SipClient(host, apiKey, apiSecret);
    }
    return this.sip;
  }

  private roomClient(): RoomServiceClientLike {
    if (!this.rooms) {
      const { host, apiKey, apiSecret } = this.credentials();
      this.rooms = new RoomServiceClient(host, apiKey, apiSecret);
    }
    return this.rooms;
  }

  /** The HTTP(S) host and API credentials, or a clear error when they are not configured. */
  private credentials(): { host: string; apiKey: string; apiSecret: string } {
    const tokens = new LiveKitTokenService(this.config);
    if (!tokens.IsConfigured) {
      throw new Error('LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.');
    }
    return {
      host: WsToHttpUrl(tokens.ServerUrl),
      apiKey: this.config.ApiKey ?? process.env.LIVEKIT_API_KEY ?? '',
      apiSecret: this.config.ApiSecret ?? process.env.LIVEKIT_API_SECRET ?? '',
    };
  }
}
