/**
 * @fileoverview `RingCentralSoftphoneHandle` — the process-wide, long-lived SIP **registration** for the
 * RingCentral softphone telephony path, and {@link createRingCentralSoftphone}, the lazy loader that
 * constructs it over the real `ringcentral-softphone` + `werift-rtp` packages.
 *
 * A `Softphone` is not a per-call object: it is one SIP registration that owns a single caller-id and a
 * single inbound-INVITE stream, shared across every call. So this handle is constructed ONCE at server
 * boot and shared between (a) the inbound coordinator — which subscribes via {@link onInvite}, resolves the
 * dialed DID to an agent, and starts a bridge — and (b) every per-call
 * {@link import('./ringcentral-softphone-call-sdk').RingCentralSoftphoneCallSdk}, which draws its session
 * from the handle as a {@link SoftphoneCallSource}.
 *
 * ## Inbound INVITE parking
 * The softphone receives an inbound call by emitting `'invite'` BEFORE any MJ bridge exists for it. The
 * handle {@link parkInvite parks} the raw INVITE keyed by its SIP `Call-ID` and notifies listeners with the
 * parsed {@link InboundInviteInfo}; the bridge that the coordinator then starts answers it later via
 * {@link answerCall} (driven by the per-call SDK's `answer`). This bridges the "softphone owns the invite,
 * the engine owns the answer timing" gap — the SIP analogue of the Twilio/Vonage webhook→answer split.
 *
 * ## Lazy loading (CLAUDE rule 8, category 2)
 * `ringcentral-softphone` + `werift-rtp` are optional peer SDKs loaded only when the RingCentral provider
 * is configured. {@link createRingCentralSoftphone} dynamic-imports both behind injectable seams, so this
 * package builds + unit-tests with neither installed (tests inject a fake client + RTP constructors).
 *
 * @module @memberjunction/ai-bridge-ringcentral
 * @author MemberJunction.com
 */

import { LogStatus } from '@memberjunction/core';
import type { SoftphoneCallSource } from './ringcentral-softphone-call-sdk';
import type {
    RingCentralSoftphoneConfig,
    RtpConstructors,
    SoftphoneCallSession,
    SoftphoneClient,
    SoftphoneInviteMessage,
} from './softphone-types';

/** Parsed identity of an inbound INVITE the coordinator needs to resolve the call to an agent. */
export interface InboundInviteInfo {
    /** The SIP `Call-ID` — the parking key + the bridge's inbound call id. */
    callId: string;
    /** The caller's number (parsed from the SIP `From` header). */
    from: string;
    /** The dialed DID (parsed from the SIP `To` header) — resolved to a pinned agent identity. */
    to: string;
}

/**
 * The shared SIP registration. Implements {@link SoftphoneCallSource} so each per-call SDK draws its
 * session from it. Construct via {@link createRingCentralSoftphone}; the server's softphone manager owns
 * the single instance and calls {@link register} at boot.
 */
export class RingCentralSoftphoneHandle implements SoftphoneCallSource {
    /** Inbound INVITEs received but not yet answered, keyed by SIP `Call-ID`. */
    private readonly parked = new Map<string, SoftphoneInviteMessage>();

    /** Listeners notified of each inbound INVITE (the coordinator resolves DID → agent → bridge). */
    private readonly inviteListeners: Array<(info: InboundInviteInfo) => void> = [];

    /**
     * @param client The live softphone (constructed from SIP creds; the only object touching the real SDK).
     * @param rtp The `werift-rtp` constructors the outbound RTP sender needs.
     */
    constructor(
        private readonly client: SoftphoneClient,
        public readonly rtp: RtpConstructors,
    ) {
        this.client.on('invite', (msg) => this.parkInvite(msg));
    }

    /** REGISTERs the SIP device so the softphone can place + receive calls. Called once at boot. */
    public async register(): Promise<void> {
        await this.client.register();
        LogStatus(`[Telephony][RingCentral] softphone registered (codec ${this.client.codec.name}).`);
    }

    /** Subscribes a listener to inbound INVITEs (the coordinator). */
    public onInvite(listener: (info: InboundInviteInfo) => void): void {
        this.inviteListeners.push(listener);
    }

    // ── SoftphoneCallSource ───────────────────────────────────────────────────────────

    /** @inheritdoc */
    public async placeCall(toNumber: string): Promise<SoftphoneCallSession> {
        return this.client.call(toNumber);
    }

    /** @inheritdoc — answers the INVITE parked under `callId`; throws if none is parked (stale/unknown call). */
    public async answerCall(callId: string): Promise<SoftphoneCallSession> {
        const invite = this.parked.get(callId);
        if (!invite) {
            throw new Error(`[Telephony][RingCentral] no parked INVITE for call id '${callId}' (already answered or expired).`);
        }
        this.parked.delete(callId);
        return this.client.answer(invite);
    }

    /** Declines + forgets a parked INVITE (no agent resolved for the DID). Safe for an unknown call id. */
    public async declineCall(callId: string): Promise<void> {
        const invite = this.parked.get(callId);
        if (!invite) {
            return;
        }
        this.parked.delete(callId);
        await this.client.decline(invite);
    }

    /** Best-effort teardown of the registration + parked state (server shutdown). */
    public dispose(): void {
        this.client.destroy?.();
        this.parked.clear();
        this.inviteListeners.length = 0;
    }

    /** Parks one inbound INVITE and notifies listeners with its parsed identity. */
    private parkInvite(msg: SoftphoneInviteMessage): void {
        const info = parseInvite(msg);
        if (!info) {
            return; // Unparseable INVITE (no Call-ID) — ignore rather than crash the registration.
        }
        this.parked.set(info.callId, msg);
        for (const listener of this.inviteListeners) {
            listener(info);
        }
    }
}

/**
 * Constructs a {@link RingCentralSoftphoneHandle} over the real `ringcentral-softphone` + `werift-rtp`
 * packages (lazily loaded), or over injected fakes in tests. Does NOT register — the caller (the server
 * manager) calls {@link RingCentralSoftphoneHandle.register} at boot.
 *
 * @param config SIP device credentials + codec (resolved upstream — never inlined).
 * @param deps Test seam: inject a fake softphone client factory + RTP constructors to avoid loading the
 *   real SDKs. Production omits both, so the lazy loaders run.
 */
export async function createRingCentralSoftphone(
    config: RingCentralSoftphoneConfig,
    deps: {
        createClient?: (config: RingCentralSoftphoneConfig) => SoftphoneClient;
        rtp?: RtpConstructors;
    } = {},
): Promise<RingCentralSoftphoneHandle> {
    const rtp = deps.rtp ?? (await loadRtpConstructors());
    const client = deps.createClient ? deps.createClient(config) : await loadSoftphoneClient(config);
    return new RingCentralSoftphoneHandle(client, rtp);
}

// ──────────────────────────────────────────────────────────────────────────────
// Pure parsing helpers (unit-tested directly — no SDK, no network).
// ──────────────────────────────────────────────────────────────────────────────

/** Parses an inbound INVITE's SIP headers into {@link InboundInviteInfo}, or null when there's no Call-ID. */
export function parseInvite(msg: SoftphoneInviteMessage): InboundInviteInfo | null {
    const callId = getHeader(msg.headers, 'Call-ID');
    if (!callId) {
        return null;
    }
    return {
        callId,
        from: extractSipNumber(getHeader(msg.headers, 'From')),
        to: extractSipNumber(getHeader(msg.headers, 'To')),
    };
}

/** Case-insensitive SIP-header lookup (header keys vary in casing across stacks). Returns '' when absent. */
export function getHeader(headers: Record<string, string>, name: string): string {
    const target = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === target) {
            return value ?? '';
        }
    }
    return '';
}

/**
 * Extracts the phone number from a SIP address header value — handles `"Name" <sip:+1555@host>;tag=…`,
 * `<sip:+1555@host>`, `sip:+1555@host`, and `tel:+1555`. Returns the user part verbatim (keeping a leading
 * `+`), or '' when no recognizable number is present.
 */
export function extractSipNumber(headerValue: string): string {
    if (!headerValue) {
        return '';
    }
    const match = headerValue.match(/(?:sip|sips|tel):([^@;>\s]+)/i);
    return match ? match[1].trim() : '';
}

// ──────────────────────────────────────────────────────────────────────────────
// Lazy loaders for the optional peer SDKs (CLAUDE rule 8, category 2).
// ──────────────────────────────────────────────────────────────────────────────

/** The npm specifiers, held in variables so TS treats the dynamic imports as untyped (no install needed to build). */
const SOFTPHONE_MODULE = 'ringcentral-softphone';
const WERIFT_MODULE = 'werift-rtp';

/** Lazily imports `werift-rtp` and returns the `RtpHeader` / `RtpPacket` constructors. */
async function loadRtpConstructors(): Promise<RtpConstructors> {
    const mod: unknown = await import(/* @vite-ignore */ WERIFT_MODULE);
    const header = pickFunction(mod, 'RtpHeader');
    const packet = pickFunction(mod, 'RtpPacket');
    if (!header || !packet) {
        throw new Error(
            `[Telephony][RingCentral] '${WERIFT_MODULE}' did not expose RtpHeader/RtpPacket. Install ${WERIFT_MODULE} ` +
                '(an optional peer of ringcentral-softphone) to enable the SIP softphone path.',
        );
    }
    return { RtpHeader: header as RtpConstructors['RtpHeader'], RtpPacket: packet as RtpConstructors['RtpPacket'] };
}

/** Lazily imports `ringcentral-softphone` (default export = `Softphone`) and constructs a registered-ready client. */
async function loadSoftphoneClient(config: RingCentralSoftphoneConfig): Promise<SoftphoneClient> {
    const mod: unknown = await import(/* @vite-ignore */ SOFTPHONE_MODULE);
    const ctor = resolveDefaultCtor(mod);
    if (!ctor) {
        throw new Error(
            `[Telephony][RingCentral] '${SOFTPHONE_MODULE}' has no default Softphone constructor. Install ${SOFTPHONE_MODULE} ` +
                'to enable the SIP softphone path.',
        );
    }
    return new ctor({ codec: 'OPUS/16000', ...config });
}

/** Returns a named function/constructor off a dynamically-imported module (or its `.default`), else null. */
function pickFunction(mod: unknown, name: string): unknown {
    for (const ns of [mod, defaultOf(mod)]) {
        if (ns && typeof ns === 'object' && typeof (ns as Record<string, unknown>)[name] === 'function') {
            return (ns as Record<string, unknown>)[name];
        }
    }
    return null;
}

/** Resolves a module's default-exported constructor (CJS-with-default interop), else null. */
function resolveDefaultCtor(mod: unknown): (new (opts: RingCentralSoftphoneConfig) => SoftphoneClient) | null {
    const candidate = defaultOf(mod) ?? mod;
    return typeof candidate === 'function'
        ? (candidate as new (opts: RingCentralSoftphoneConfig) => SoftphoneClient)
        : null;
}

/** Unwraps a `{ default }` interop wrapper, returning the inner value or undefined. */
function defaultOf(mod: unknown): unknown {
    return mod && typeof mod === 'object' && 'default' in mod ? (mod as { default: unknown }).default : undefined;
}
