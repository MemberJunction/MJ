/**
 * @fileoverview Per-call media-socket authentication shared by the Twilio and Vonage media registries.
 *
 * The carrier media websockets (`WSS /telephony/twilio/media`, `WSS /telephony/vonage/media`) are public:
 * a carrier cannot present an MJ JWT, and the voice-webhook signature only covers the HTTP request that
 * precedes the socket. Without a second factor, anyone who can reach the server could open a socket, claim
 * any call id, and either listen to a live call or inject audio into it.
 *
 * The second factor is a **per-call secret token**. MJ mints it when it accepts an inbound call or places an
 * outbound one, embeds it in the TwiML / NCCO the carrier will execute (so only the carrier ever sees it),
 * and records it here as an *expected call*. The socket must present the same token to attach. A call that
 * was never registered, a wrong token, or a call whose socket is already attached are all refused — a socket
 * never replaces another and never creates state for a call MJ did not register.
 *
 * Expectations carry a TTL so a call whose media socket never connects does not leave an entry (and its
 * channel) behind forever.
 *
 * @module @memberjunction/telephony-adapters
 */

import { MediaTokensEqual } from '@memberjunction/ai-bridge-base';

/**
 * How long an expected call may wait for its media socket to connect before the expectation is dropped.
 * Inbound sockets connect within seconds of the answer response; outbound sockets only connect once the
 * callee answers, so this must outlast the carrier's ring time (Twilio's default ring timeout is 60 s).
 */
export const DEFAULT_EXPECTATION_TTL_MS = 90_000;

/** Why a media socket was refused. */
export type SocketAuthFailure = 'unknown-call' | 'bad-token' | 'already-attached';

/** The verdict of {@link ExpectedCallStore.Verify}. */
export type SocketAuthResult = { Ok: true } | { Ok: false; Reason: SocketAuthFailure };

/** One expected call: its secret token, whether a socket has attached, and the TTL timer while it has not. */
interface CallExpectation {
    Token: string;
    Attached: boolean;
    Timer?: ReturnType<typeof setTimeout>;
}

/**
 * The set of calls MJ is expecting a media socket for, keyed by the carrier's call identifier (or, for a
 * Vonage outbound call whose UUID is not yet known, a correlation id). Pure bookkeeping — no sockets, no I/O.
 */
export class ExpectedCallStore {
    private readonly entries = new Map<string, CallExpectation>();

    /**
     * @param onExpired Invoked (once) when a call's TTL elapses with no socket ever attached. The entry has
     *   already been removed by then.
     * @param defaultTtlMs TTL applied when {@link Expect} is not given one explicitly.
     */
    constructor(
        private readonly onExpired: (key: string) => void,
        private readonly defaultTtlMs: number = DEFAULT_EXPECTATION_TTL_MS,
    ) {}

    /**
     * Registers (or re-registers) a call's token and starts its connect TTL. Re-registering the same key
     * replaces the earlier expectation and restarts the timer.
     *
     * @param key The carrier call id (or correlation id).
     * @param token The per-call secret the socket must present.
     * @param ttlMs Optional TTL override in milliseconds.
     */
    public Expect(key: string, token: string, ttlMs: number = this.defaultTtlMs): void {
        this.Forget(key);
        const entry: CallExpectation = { Token: token, Attached: false };
        this.startTtlTimer(key, entry, ttlMs);
        this.entries.set(key, entry);
    }

    /**
     * Decides whether a connecting socket may attach to the call. The order matters: an unknown call is
     * reported before the token is examined, and a wrong token before "already attached", so a probe never
     * learns whether a given call currently has a live socket.
     */
    public Verify(key: string, token: string | undefined): SocketAuthResult {
        const entry = this.entries.get(key);
        if (!entry) {
            return { Ok: false, Reason: 'unknown-call' };
        }
        if (!MediaTokensEqual(entry.Token, token)) {
            return { Ok: false, Reason: 'bad-token' };
        }
        if (entry.Attached) {
            return { Ok: false, Reason: 'already-attached' };
        }
        return { Ok: true };
    }

    /** Records that a socket attached; the connect TTL no longer applies. */
    public MarkAttached(key: string): void {
        const entry = this.entries.get(key);
        if (!entry) {
            return;
        }
        entry.Attached = true;
        if (entry.Timer) {
            clearTimeout(entry.Timer);
            entry.Timer = undefined;
        }
    }

    /** Moves an expectation to a new key (Vonage: correlation id → call UUID), keeping its token and timer. */
    public Rekey(fromKey: string, toKey: string): void {
        const entry = this.entries.get(fromKey);
        if (!entry || fromKey === toKey) {
            return;
        }
        this.entries.delete(fromKey);
        this.entries.set(toKey, entry);
        if (entry.Timer) {
            // The timer closes over the ORIGINAL key, so it must be restarted on the new one. A rekey happens
            // milliseconds after Expect, so restarting with the default TTL is indistinguishable from "time left".
            clearTimeout(entry.Timer);
            this.startTtlTimer(toKey, entry, this.defaultTtlMs);
        }
    }

    /** Removes a call's expectation and cancels its TTL timer. Safe for unknown keys. */
    public Forget(key: string): void {
        const entry = this.entries.get(key);
        if (!entry) {
            return;
        }
        if (entry.Timer) {
            clearTimeout(entry.Timer);
        }
        this.entries.delete(key);
    }

    /** Whether an expectation (attached or not) exists for the key. */
    public Has(key: string): boolean {
        return this.entries.has(key);
    }

    /** Cancels every outstanding TTL timer and clears the store (registry/service shutdown). */
    public Clear(): void {
        for (const entry of this.entries.values()) {
            if (entry.Timer) {
                clearTimeout(entry.Timer);
            }
        }
        this.entries.clear();
    }

    /** Starts the connect-TTL timer: a never-attached expectation expires, is removed, and is reported once. */
    private startTtlTimer(key: string, entry: CallExpectation, ttlMs: number): void {
        entry.Timer = setTimeout(() => {
            // Only a never-attached expectation can expire (MarkAttached clears the timer).
            this.entries.delete(key);
            this.onExpired(key);
        }, ttlMs);
        // Never keep the process alive solely for a connect timeout (Node-only; guarded for other hosts).
        (entry.Timer as { unref?: () => void }).unref?.();
    }
}
