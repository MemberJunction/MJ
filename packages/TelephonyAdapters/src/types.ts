import { UserInfo, DatabaseProviderBase } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';

/**
 * Twilio Programmable Voice + Media Streams telephony binding configuration.
 */
export interface TwilioTelephonyConfig {
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
    /** Optional shared secret gating the public webhook/WSS endpoints. */
    webhookSigningSecret?: string;
    /** Optional status-callback URL Twilio posts call lifecycle events to. */
    statusCallbackUrl?: string;
}

/**
 * Vonage Voice + WebSocket-media telephony binding configuration.
 */
export interface VonageTelephonyConfig {
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
    /** Optional event-webhook URL Vonage posts call lifecycle events to. */
    eventUrl?: string;
}

/**
 * RingCentral SIP softphone telephony binding configuration.
 */
export interface RingCentralTelephonyConfig {
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
export interface TelephonyConfig {
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
export function getUserFromPayload(userPayload?: UserPayload): UserInfo | undefined {
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

/**
 * Resolves the primary Read-Write database provider from the resolver context.
 */
export function getReadWriteProvider(providers?: ProviderInfo[]): DatabaseProviderBase | null {
    if (!providers || providers.length === 0) {
        return null;
    }
    const rw = providers.find((p) => p.type === 'Read-Write');
    return rw ? rw.provider : null;
}
