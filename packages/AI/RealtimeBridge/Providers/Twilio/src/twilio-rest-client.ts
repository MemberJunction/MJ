/**
 * @fileoverview Production REST half of the Twilio binding: a real {@link ITwilioRestLike}
 * over the `twilio` npm SDK's Programmable Voice REST API (outbound dial + call update).
 *
 * The `twilio` package is an OPTIONAL PEER SDK (CLAUDE rule 8, category 2) — it is NEVER
 * statically imported, so this provider package builds and unit-tests with no `twilio`
 * install and no network. The SDK is lazily loaded (once, memoized) at first use via the
 * injectable {@link TwilioRestModuleLoader}; tests inject a fake factory instead. None of
 * the `twilio` SDK's own types leak past this file — everything crosses the seam through
 * the minimal structural interfaces below, keeping {@link RealTwilioBindings} SDK-agnostic.
 *
 * The OTHER half — {@link ITwilioMediaPump} (the bidirectional Media-Streams websocket) —
 * is owned by the MJAPI telephony ingress, not this package: the carrier websocket is a
 * server concern (the `ws` dependency lives in MJServer), and one socket spans a call's
 * whole media plane. This file is REST only.
 *
 * @module @memberjunction/ai-bridge-twilio
 */

import type { ITwilioRestLike, TwilioCreateCallParams, TwilioUpdateCallParams } from './real-twilio-bindings.js';

// ──────────────────────────────────────────────────────────────────────────────
// Minimal structural shapes of the `twilio` SDK surface we touch. Declared here so
// the SDK's real types never leak into the package and so tests can inject a fake.
// ──────────────────────────────────────────────────────────────────────────────

/** The created-call resource the SDK's `calls.create(...)` resolves to (we read only `sid`). */
export interface TwilioCallInstanceLike {
    sid: string;
}

/** A single call's context (`client.calls(sid)`) — supports `update(...)` for hangup/transfer/DTMF. */
export interface TwilioCallContextLike {
    update(params: Record<string, unknown>): Promise<unknown>;
}

/**
 * The `client.calls` surface: callable as `calls(sid)` to address one call AND carrying a
 * `create(...)` method for outbound dial — exactly the dual shape the real `twilio` SDK exposes.
 */
export interface TwilioCallsResourceLike {
    (callSid: string): TwilioCallContextLike;
    create(params: Record<string, unknown>): Promise<TwilioCallInstanceLike>;
}

/** The subset of a constructed `twilio` REST client we drive. */
export interface TwilioRestClientLike {
    calls: TwilioCallsResourceLike;
}

/**
 * The `twilio` module's default export: a factory constructing a REST client. Supports both
 * auth forms — `twilio(accountSid, authToken)` and `twilio(apiKeySid, apiKeySecret, { accountSid })`.
 */
export type TwilioModuleFactory = (
    usernameOrAccountSid: string,
    password: string,
    opts?: { accountSid?: string },
) => TwilioRestClientLike;

/** Loads the `twilio` module's client factory. Overridable in tests; defaults to a lazy dynamic import. */
export type TwilioRestModuleLoader = () => Promise<TwilioModuleFactory>;

/** Credentials the REST client constructs the `twilio` SDK with. Resolved upstream via MJ config — never inlined. */
export interface TwilioRestCredentials {
    /** Twilio Account SID (`AC…`). Always required (used directly, or as the `accountSid` option under API-key auth). */
    AccountSid: string;
    /** Account auth token — used when no API key pair is supplied. Also the HMAC key for webhook signature verification. */
    AuthToken?: string;
    /** API Key SID (`SK…`) — preferred over the auth token for REST auth when present (with {@link ApiKeySecret}). */
    ApiKeySid?: string;
    /** API Key secret — paired with {@link ApiKeySid}. */
    ApiKeySecret?: string;
}

/**
 * Lazily loads the `twilio` module's client factory exactly once and memoizes it. A static import
 * is impossible here (optional peer SDK, may be uninstalled in non-telephony deployments); the
 * `optionalDependencies` entry keeps it in the dependency graph (CLAUDE rule 8, category 2).
 */
export const defaultTwilioRestModuleLoader: TwilioRestModuleLoader = async (): Promise<TwilioModuleFactory> => {
    try {
        const mod: unknown = await import('twilio');
        const factory = unwrapTwilioFactory(mod);
        if (typeof factory !== 'function') {
            throw new Error('the twilio module did not export a client factory function');
        }
        return factory as TwilioModuleFactory;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
            "RealTwilioRestClient could not load the 'twilio' SDK. Install it in the deployment that " +
                `runs the Twilio telephony bridge (it is an optional peer dependency). Underlying error: ${message}`,
        );
    }
};

/** Unwraps the twilio factory from CJS/ESM interop (`module` or `module.default`). */
function unwrapTwilioFactory(mod: unknown): unknown {
    if (typeof mod === 'function') {
        return mod;
    }
    if (mod && typeof mod === 'object' && 'default' in mod) {
        return (mod as { default: unknown }).default;
    }
    return mod;
}

/**
 * A real {@link ITwilioRestLike} over the `twilio` SDK's Programmable Voice REST API.
 *
 * - `CreateCall` → `client.calls.create({ to, from, twiml, statusCallback })`, resolving the new Call SID.
 * - `UpdateCall` → `client.calls(sid).update({ status, twiml })` for hangup / transfer / DTMF.
 *
 * The constructed client is built once on first use and reused for the life of the instance.
 */
export class RealTwilioRestClient implements ITwilioRestLike {
    private readonly credentials: TwilioRestCredentials;
    private readonly loadModule: TwilioRestModuleLoader;
    /** Memoized client-build promise so concurrent callers share one construction. */
    private clientPromise?: Promise<TwilioRestClientLike>;

    /**
     * @param credentials Resolved Twilio credentials (account SID + auth token or API key pair).
     * @param loadModule The `twilio` module loader (defaults to the lazy dynamic import).
     */
    constructor(credentials: TwilioRestCredentials, loadModule: TwilioRestModuleLoader = defaultTwilioRestModuleLoader) {
        this.credentials = credentials;
        this.loadModule = loadModule;
    }

    /** @inheritdoc */
    public async CreateCall(params: TwilioCreateCallParams): Promise<string> {
        const client = await this.ensureClient();
        const created = await client.calls.create({
            to: params.To,
            from: params.From,
            twiml: params.Twiml,
            ...(params.StatusCallback ? { statusCallback: params.StatusCallback } : {}),
        });
        if (!created?.sid) {
            throw new Error('Twilio calls.create returned no Call SID.');
        }
        return created.sid;
    }

    /** @inheritdoc */
    public async UpdateCall(callSid: string, params: TwilioUpdateCallParams): Promise<void> {
        const client = await this.ensureClient();
        await client.calls(callSid).update({
            ...(params.Status ? { status: params.Status } : {}),
            ...(params.Twiml ? { twiml: params.Twiml } : {}),
        });
    }

    /** Builds (once) and returns the constructed `twilio` REST client, choosing API-key auth when available. */
    private ensureClient(): Promise<TwilioRestClientLike> {
        if (!this.clientPromise) {
            this.clientPromise = this.buildClient();
        }
        return this.clientPromise;
    }

    /** Constructs the `twilio` REST client with API-key auth when a key pair is present, else the auth token. */
    private async buildClient(): Promise<TwilioRestClientLike> {
        const factory = await this.loadModule();
        const { AccountSid, AuthToken, ApiKeySid, ApiKeySecret } = this.credentials;
        if (ApiKeySid && ApiKeySecret) {
            return factory(ApiKeySid, ApiKeySecret, { accountSid: AccountSid });
        }
        if (!AuthToken) {
            throw new Error('RealTwilioRestClient requires either an API key pair (ApiKeySid + ApiKeySecret) or an AuthToken.');
        }
        return factory(AccountSid, AuthToken);
    }
}
