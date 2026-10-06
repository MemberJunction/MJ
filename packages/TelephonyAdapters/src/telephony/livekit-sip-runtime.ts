import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { LiveKitRoomWebhookEvent } from '@memberjunction/livekit-room-server';
import { MJGlobal } from '@memberjunction/global';
import type { LiveKitSipInboundResult, LiveKitSipTelephonyService } from './LiveKitSipTelephonyService.js';

const LIVEKIT_SIP_SERVICE_KEY = '__MJ_LIVEKIT_SIP_TELEPHONY_SERVICE__';
const LIVEKIT_SIP_INBOUND_HANDLER_KEY = '__MJ_LIVEKIT_SIP_INBOUND_HANDLER__';

/** Context provided to an inbound LiveKit SIP call handler. */
export interface LiveKitSipInboundCallContext {
    Event: LiveKitRoomWebhookEvent;
    DialedNumber: string;
    CallerNumber?: string;
    RoomName: string;
    ParticipantIdentity: string;
    ContextUser: UserInfo;
    MetadataProvider: IMetadataProvider;
    /** Hangs up the inbound participant leg if refused or ended. */
    HangUp: () => Promise<void>;
}

/** Result returned by an inbound LiveKit SIP call handler. */
export interface LiveKitSipInboundHandlerResult {
    /** Whether this handler handled (or refused) the call. If false, LiveKitSipTelephonyService falls back to default agent identity lookup. */
    Handled: boolean;
    /** Outcome for the webhook response. */
    Outcome?: LiveKitSipInboundResult;
}

/** Hook for external packages (like Contact Center) to intercept and route inbound LiveKit SIP calls. */
export interface ILiveKitSipInboundHandler {
    HandleInboundCall: (context: LiveKitSipInboundCallContext) => Promise<LiveKitSipInboundHandlerResult>;
}

/** Binds the startup-constructed LiveKit SIP service (called from server boot). */
export function SetLiveKitSipTelephonyService(service: LiveKitSipTelephonyService | undefined): void {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    if (store) {
        store[LIVEKIT_SIP_SERVICE_KEY] = service;
    }
}

/** Returns the bound LiveKit SIP service, or `undefined` when LiveKit SIP is not configured. */
export function GetLiveKitSipTelephonyService(): LiveKitSipTelephonyService | undefined {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    return store ? (store[LIVEKIT_SIP_SERVICE_KEY] as LiveKitSipTelephonyService | undefined) : undefined;
}

/** Registers an inbound call handler that can route or intercept LiveKit SIP room arrivals before agent lookup. */
export function SetLiveKitSipInboundHandler(handler: ILiveKitSipInboundHandler | undefined): void {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    if (store) {
        store[LIVEKIT_SIP_INBOUND_HANDLER_KEY] = handler;
    }
}

/** Returns the registered inbound call handler, if any. */
export function GetLiveKitSipInboundHandler(): ILiveKitSipInboundHandler | undefined {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    return store ? (store[LIVEKIT_SIP_INBOUND_HANDLER_KEY] as ILiveKitSipInboundHandler | undefined) : undefined;
}

