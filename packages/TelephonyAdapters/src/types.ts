import { UserInfo, DatabaseProviderBase } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import type { OutboundPolicySettings, TransferTargetSettings } from './telephony/outboundCallPolicy.js';

/**
 * Settings that apply to every carrier. They are configured once under `telephony` and merged into each
 * carrier's extension settings by the host (a carrier block may override them).
 */
export interface TelephonySharedSettings {
    /**
     * Email of the user INBOUND calls run as. Required for inbound calls: if unset, unknown, inactive, or the
     * system user, the call is rejected (there is deliberately no fallback to a privileged user). Point it at a
     * dedicated least-privilege account.
     */
    inboundRunAsUserEmail?: string;
    /** Maximum length of one phone call in seconds (default 1800). The session is stopped at the cap. */
    maxCallSeconds?: number;
    /**
     * Most phone calls (every carrier together, both directions) the server will carry at once (default 25).
     * Keep this at or below the realtime model plan's concurrent-session limit: past the cap an inbound caller
     * hears a polite "all agents are busy" and an outbound call is refused, instead of every call degrading.
     */
    maxConcurrentCalls?: number;
    /** Outbound destination policy and per-user rate limit applied to every `Place*Call` mutation. */
    outbound?: OutboundPolicySettings;
    /**
     * The places the agent may transfer a live call to, by name. Empty or absent means the agent cannot transfer at
     * all, even on a carrier that supports it: the agent never names a free-form number.
     */
    transferTargets?: TransferTargetSettings[];
}

/** What to do when answering-machine detection says a machine (or fax) answered an outbound call. */
export type OnMachineAction = 'hangup' | 'continue';

/**
 * Twilio Programmable Voice + Media Streams telephony binding configuration.
 */
export interface TwilioTelephonyConfig extends TelephonySharedSettings {
    /** Twilio Account SID (`AC…`). */
    accountSid: string;
    /** Account auth token — REST auth (when no API key pair) AND the HMAC key for X-Twilio-Signature verification. */
    authToken?: string;
    /** API Key SID (`SK…`) — preferred over the auth token for REST auth when paired with apiKeySecret. */
    apiKeySid?: string;
    /** API Key secret — paired with apiKeySid. */
    apiKeySecret?: string;
    /** The publicly reachable `wss://…/telephony/twilio/media` URL Twilio's <Connect><Stream> connects to. */
    streamPublicUrl: string;
    /**
     * Reserved; currently unused. The media websocket is authenticated by a per-call token minted by MJ (see
     * `mediaSocketAuth.ts`), and webhooks by `X-Twilio-Signature`.
     */
    webhookSigningSecret?: string;
    /**
     * URL Twilio posts outbound-call lifecycle events to. Defaults to `<public URL>/telephony/twilio/status`
     * (the route that ends the session when a call is busy / unanswered / failed / completed).
     */
    statusCallbackUrl?: string;
    /** URL Twilio posts the async answering-machine verdict to. Defaults to `<public URL>/telephony/twilio/amd`. */
    amdStatusCallbackUrl?: string;
    /** What to do when a machine or fax answers an outbound call (default `'hangup'`). */
    onMachine?: OnMachineAction;
}

/**
 * Vonage Voice + WebSocket-media telephony binding configuration.
 */
export interface VonageTelephonyConfig extends TelephonySharedSettings {
    /** Vonage Application ID (UUID) — the JWT-auth identity for the Voice API. */
    applicationId?: string;
    /** The application's RSA private key (PEM) used to sign Voice-API JWTs. */
    privateKey?: string;
    /** Account API key — used for key-scoped operations when no application credential pair is supplied. */
    apiKey?: string;
    /** Account API secret — paired with apiKey. */
    apiSecret?: string;
    /** The publicly reachable `wss://…/telephony/vonage/media` URL the call's connect NCCO opens. */
    mediaPublicUrl: string;
    /** Vonage account signature secret — HMAC key for signed-request `sig` AND HS256 webhook-JWT verification. */
    signatureSecret?: string;
    /**
     * Event-webhook URL Vonage posts call lifecycle events to. Defaults to `<public URL>/telephony/vonage/event`
     * (the route that ends the session when a call is busy / unanswered / failed / completed).
     */
    eventUrl?: string;
    /** What to do when a machine answers an outbound call — Vonage's `machine_detection` (default `'hangup'`). */
    onMachine?: OnMachineAction;
}

/**
 * RingCentral SIP softphone telephony binding configuration.
 */
export interface RingCentralTelephonyConfig extends TelephonySharedSettings {
    /** SIP domain (e.g. `sip.ringcentral.com`). */
    sipDomain: string;
    /** SIP outbound proxy (`host:port`, e.g. `sip10.ringcentral.com:5096`). */
    sipOutboundProxy: string;
    /** SIP auth username (the device's phone number / extension). */
    sipUsername: string;
    /** SIP auth password (resolved upstream — never inlined). */
    sipPassword: string;
    /** SIP authorization id (the device's RingCentral authorization id). */
    sipAuthorizationId: string;
    /** Codec to negotiate. Defaults to `OPUS/16000`. */
    codec?: 'OPUS/16000' | 'OPUS/48000/2' | 'PCMU/8000';
    /** Skip TLS cert validation (sandbox/test only — never in production). */
    ignoreTlsCertErrors?: boolean;
}

/**
 * Teams meetings binding configuration.
 */
export interface TeamsMeetingsConfig {
    /** Whether Teams meeting joins are enabled. */
    enabled?: boolean;
    /** Azure App (client) ID with Calling / Cloud Communications permissions. */
    appId?: string;
    /** Azure AD Tenant ID. */
    tenantId?: string;
    /** Pre-resolved bot access token for Microsoft Graph / Calling API calls. */
    botAccessToken?: string;
    /** The shared secret set as `clientState` on the Graph subscription; gates the change-notification webhook. */
    notificationClientState?: string;
    /** The ACS application-hosted-media PCM sample rate (Hz) the audio plane negotiates. Defaults to 16000. */
    acsSampleRate?: number;
    /** The realtime model's PCM16 sample rate (Hz) the binding resamples to/from. Defaults to 16000. */
    modelSampleRate?: number;
}

/**
 * Full telephony section configuration shape.
 */
export interface TelephonyConfig extends TelephonySharedSettings {
    enabled: boolean;
    twilio?: TwilioTelephonyConfig;
    vonage?: VonageTelephonyConfig;
    ringcentral?: RingCentralTelephonyConfig;
    teams?: TeamsMeetingsConfig;
}

/**
 * Context user payload passed from auth middleware to GraphQL resolvers.
 */
export interface UserPayload {
    email: string;
    userRecord?: UserInfo;
    sessionId?: string;
    isSystemUser?: boolean;
    apiKey?: string;
    apiKeyId?: string;
    apiKeyHash?: string;
    emailVerified?: boolean;
}

/**
 * Provider info shape passed in GraphQL context.
 */
export interface ProviderInfo {
    type: string;
    provider: DatabaseProviderBase;
}

/**
 * AppContext shape consumed by telephony GraphQL resolvers.
 */
export interface TelephonyResolverContext {
    userPayload?: UserPayload;
    providers?: ProviderInfo[];
}

/**
 * Resolves a UserInfo object from the resolver context userPayload.
 */
export function GetUserFromPayload(userPayload?: UserPayload): UserInfo | undefined {
    if (!userPayload) {
        return undefined;
    }
    if (userPayload.userRecord) {
        return userPayload.userRecord;
    }
    if (!userPayload.email) {
        return undefined;
    }
    return UserCache.Users.find((u) => u.Email.toLowerCase().trim() === userPayload.email.toLowerCase().trim());
}

/** @deprecated Use {@link GetUserFromPayload}. */
export function getUserFromPayload(userPayload?: UserPayload): UserInfo | undefined {
    return GetUserFromPayload(userPayload);
}

/**
 * Resolves the primary Read-Write database provider from the resolver context.
 */
export function GetReadWriteProvider(providers?: ProviderInfo[]): DatabaseProviderBase | null {
    if (!providers || providers.length === 0) {
        return null;
    }
    const rw = providers.find((p) => p.type === 'Read-Write');
    return rw ? rw.provider : null;
}

/** @deprecated Use {@link GetReadWriteProvider}. */
export function getReadWriteProvider(providers?: ProviderInfo[]): DatabaseProviderBase | null {
    return GetReadWriteProvider(providers);
}
