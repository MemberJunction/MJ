/**
 * @fileoverview Production REST half of the Vonage binding: a real {@link IVonageVoiceLike}
 * over the `@vonage/server-sdk` Voice API (outbound dial + call control: hangup / transfer / DTMF).
 *
 * The `@vonage/server-sdk` package is an OPTIONAL PEER SDK (CLAUDE rule 8, category 2) — it is
 * NEVER statically imported, so this provider package builds and unit-tests with no
 * `@vonage/server-sdk` install and no network. The SDK is lazily loaded (once, memoized) at first
 * use via the injectable {@link VonageRestModuleLoader}; tests inject a fake factory instead. None
 * of the `@vonage/server-sdk` SDK's own types leak past this file — everything crosses the seam
 * through the minimal structural interfaces below, keeping {@link RealVonageVoiceClient} SDK-agnostic.
 *
 * The OTHER half — {@link IVonageMediaPump} (the bidirectional WebSocket media leg the `connect`
 * NCCO opens) — is owned by the MJAPI telephony ingress, not this package: the carrier websocket is
 * a server concern, and one socket spans a call's whole media plane. This file is REST only.
 *
 * @module @memberjunction/ai-bridge-vonage
 * @author MemberJunction.com
 * @see {@link IVonageVoiceLike} — the seam this implements (defined in `real-vonage-bindings.ts`).
 */

import type {
    IVonageVoiceLike,
    NccoAction,
    VonageCreateCallParams,
    VonageTransferParams,
} from './real-vonage-bindings.js';

// ──────────────────────────────────────────────────────────────────────────────
// Minimal structural shapes of the `@vonage/server-sdk` surface we touch. Declared here so the
// SDK's real types never leak into the package and so tests can inject a fake.
// ──────────────────────────────────────────────────────────────────────────────

/** A single NCCO endpoint as the SDK's outbound-call payload expects it (`{ type, number }`). */
export interface VonageEndpointLike {
    /** Endpoint type — `'phone'` for the dialed party / caller-id. */
    type: string;
    /** The E.164 number for a `phone` endpoint. */
    number: string;
}

/** The `OutboundCall` object the SDK's `createOutboundCall(...)` accepts (the subset we send). */
export interface VonageOutboundCallLike {
    /** Destination endpoints — a one-element `phone` array for a single-party dial. */
    to: VonageEndpointLike[];
    /** Originating caller-id / DID endpoint. */
    from: VonageEndpointLike;
    /** The NCCO executed when the call connects (our `connect` websocket action). */
    ncco: NccoAction[];
    /** Optional lifecycle event-webhook URL. */
    event_url?: string[];
}

/** The created-call resource `createOutboundCall(...)` resolves to (we read only `uuid`). */
export interface VonageCallResponseLike {
    /** The created call's UUID. */
    uuid: string;
}

/** The DTMF result `playDTMF(...)` resolves to (we don't currently read it). */
export interface VonageDtmfResponseLike {
    /** The DTMF-send status string. */
    status: string;
}

/** The subset of the SDK's Voice client (`vonage.voice`) we drive. */
export interface VonageVoiceClientLike {
    /** Places an outbound call; resolves the created call resource (carrying `uuid`). */
    createOutboundCall(call: VonageOutboundCallLike): Promise<VonageCallResponseLike>;
    /** Hangs up a call by UUID. */
    hangupCall(callUuid: string): Promise<unknown>;
    /** Transfers a live call by UUID into a replacement NCCO. */
    transferCallWithNCCO(callUuid: string, ncco: NccoAction[]): Promise<unknown>;
    /** Sends DTMF digits into a live call by UUID. */
    playDTMF(callUuid: string, digits: string): Promise<VonageDtmfResponseLike>;
}

/** The subset of a constructed `Vonage` SDK client we drive — its `voice` accessor. */
export interface VonageRestClientLike {
    /** The Voice-API client. */
    voice: VonageVoiceClientLike;
}

/**
 * The `@vonage/server-sdk` `Vonage` constructor: `new Vonage(credentials, options?)`. Voice API
 * auth is application-scoped (JWT) — `{ applicationId, privateKey }` — with optional `{ apiKey,
 * apiSecret }` for key-scoped operations; both are passed through the credentials object.
 */
export type VonageModuleConstructor = new (
    credentials: VonageCredentialsLike,
    options?: Record<string, unknown>,
) => VonageRestClientLike;

/** The credentials object the `Vonage` constructor accepts (the subset we populate). */
export interface VonageCredentialsLike {
    /** Vonage Application ID (UUID) — the JWT-auth identity for the Voice API. */
    applicationId?: string;
    /** The application's RSA private key (PEM) used to sign Voice-API JWTs. */
    privateKey?: string;
    /** Account API key — used for key-scoped operations when present. */
    apiKey?: string;
    /** Account API secret — paired with {@link apiKey}. */
    apiSecret?: string;
}

/** Loads the `@vonage/server-sdk` `Vonage` constructor. Overridable in tests; defaults to a lazy dynamic import. */
export type VonageRestModuleLoader = () => Promise<VonageModuleConstructor>;

/** Credentials the REST client constructs the `@vonage/server-sdk` SDK with. Resolved upstream via MJ config — never inlined. */
export interface VonageRestCredentials {
    /** Vonage Application ID (UUID). Required for Voice-API JWT auth (with {@link PrivateKey}). */
    ApplicationId?: string;
    /** The application's RSA private key (PEM). Paired with {@link ApplicationId} for Voice-API JWT auth. */
    PrivateKey?: string;
    /** Account API key — used for key-scoped operations when no application credential pair is supplied. */
    ApiKey?: string;
    /** Account API secret — paired with {@link ApiKey}. */
    ApiSecret?: string;
}

/**
 * Lazily loads the `@vonage/server-sdk` `Vonage` constructor exactly once and memoizes it. A static
 * import is impossible here (optional peer SDK, may be uninstalled in non-telephony deployments);
 * the `optionalDependencies` entry keeps it in the dependency graph (CLAUDE rule 8, category 2).
 */
export const defaultVonageRestModuleLoader: VonageRestModuleLoader = async (): Promise<VonageModuleConstructor> => {
    try {
        const mod: unknown = await import('@vonage/server-sdk');
        const ctor = unwrapVonageConstructor(mod);
        if (typeof ctor !== 'function') {
            throw new Error('the @vonage/server-sdk module did not export a Vonage constructor.');
        }
        return ctor as VonageModuleConstructor;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
            "RealVonageVoiceClient could not load the '@vonage/server-sdk' SDK. Install it in the deployment " +
                `that runs the Vonage telephony bridge (it is an optional peer dependency). Underlying error: ${message}`,
        );
    }
};

/** Unwraps the `Vonage` named export from CJS/ESM interop (`module.Vonage` or `module.default.Vonage`). */
function unwrapVonageConstructor(mod: unknown): unknown {
    if (!mod || typeof mod !== 'object') {
        return mod;
    }
    const named = (mod as { Vonage?: unknown }).Vonage;
    if (named) {
        return named;
    }
    const fromDefault = (mod as { default?: { Vonage?: unknown } }).default;
    if (fromDefault && typeof fromDefault === 'object' && fromDefault.Vonage) {
        return fromDefault.Vonage;
    }
    return (mod as { default?: unknown }).default ?? mod;
}

/**
 * A real {@link IVonageVoiceLike} over the `@vonage/server-sdk` Voice API.
 *
 * - `CreateCall` → `vonage.voice.createOutboundCall({ to, from, ncco, event_url })`, resolving the new call UUID.
 * - `HangupCall` → `vonage.voice.hangupCall(uuid)`.
 * - `TransferCall` → `vonage.voice.transferCallWithNCCO(uuid, ncco)`.
 * - `SendDtmf` → `vonage.voice.playDTMF(uuid, digits)`.
 *
 * The constructed client is built once on first use and reused for the life of the instance.
 */
export class RealVonageVoiceClient implements IVonageVoiceLike {
    private readonly credentials: VonageRestCredentials;
    private readonly loadModule: VonageRestModuleLoader;
    /** Memoized client-build promise so concurrent callers share one construction. */
    private clientPromise?: Promise<VonageVoiceClientLike>;

    /**
     * @param credentials Resolved Vonage credentials (application-id + private-key, or API key pair).
     * @param loadModule The `@vonage/server-sdk` module loader (defaults to the lazy dynamic import).
     */
    constructor(credentials: VonageRestCredentials, loadModule: VonageRestModuleLoader = defaultVonageRestModuleLoader) {
        this.credentials = credentials;
        this.loadModule = loadModule;
    }

    /** @inheritdoc */
    public async CreateCall(params: VonageCreateCallParams): Promise<string> {
        const voice = await this.ensureClient();
        const created = await voice.createOutboundCall({
            to: [{ type: 'phone', number: params.To }],
            from: { type: 'phone', number: params.From },
            ncco: params.Ncco,
            ...(params.EventUrl ? { event_url: [params.EventUrl] } : {}),
        });
        if (!created?.uuid) {
            throw new Error('Vonage createOutboundCall returned no call UUID.');
        }
        return created.uuid;
    }

    /** @inheritdoc */
    public async HangupCall(callUuid: string): Promise<void> {
        const voice = await this.ensureClient();
        await voice.hangupCall(callUuid);
    }

    /** @inheritdoc */
    public async TransferCall(callUuid: string, params: VonageTransferParams): Promise<void> {
        const voice = await this.ensureClient();
        await voice.transferCallWithNCCO(callUuid, params.Ncco);
    }

    /** @inheritdoc */
    public async SendDtmf(callUuid: string, digits: string): Promise<void> {
        const voice = await this.ensureClient();
        await voice.playDTMF(callUuid, digits);
    }

    /** Builds (once) and returns the constructed SDK's Voice client, memoizing the build promise. */
    private ensureClient(): Promise<VonageVoiceClientLike> {
        if (!this.clientPromise) {
            this.clientPromise = this.buildClient();
        }
        return this.clientPromise;
    }

    /** Constructs the `Vonage` SDK client (application JWT auth when present, else API key pair) and returns its Voice client. */
    private async buildClient(): Promise<VonageVoiceClientLike> {
        const Ctor = await this.loadModule();
        const client = new Ctor(this.buildCredentials());
        return client.voice;
    }

    /** Selects Voice-API JWT auth (application-id + private-key) when present, else the API key pair; throws if neither. */
    private buildCredentials(): VonageCredentialsLike {
        const { ApplicationId, PrivateKey, ApiKey, ApiSecret } = this.credentials;
        if (ApplicationId && PrivateKey) {
            return { applicationId: ApplicationId, privateKey: PrivateKey };
        }
        if (ApiKey && ApiSecret) {
            return { apiKey: ApiKey, apiSecret: ApiSecret };
        }
        throw new Error(
            'RealVonageVoiceClient requires either an application credential pair (ApplicationId + PrivateKey) ' +
                'or an API key pair (ApiKey + ApiSecret).',
        );
    }
}
