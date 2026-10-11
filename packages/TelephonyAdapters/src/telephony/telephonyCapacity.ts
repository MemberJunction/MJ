/**
 * @fileoverview The server-wide cap on simultaneous phone calls.
 *
 * Every realtime call holds a live model session, and the model plan has its own concurrent-session limit.
 * Past that limit, new calls do not queue politely — they fail or degrade every call in progress. The cap makes
 * the refusal explicit and early: an inbound caller hears "all agents are busy" and an outbound request is
 * refused with a clear message, instead of a call that connects and then goes silent. (Queuing is a later
 * feature; today the answer is a refusal.)
 *
 * The cap is shared by every carrier — it counts calls, not calls per carrier — so it is a process singleton.
 * A call holds a {@link CallCapacityLease} from admission until its session ends (or fails to start); releasing
 * a lease twice is harmless.
 *
 * @module @memberjunction/telephony-adapters
 */

import { BaseSingleton } from '@memberjunction/global';

/** Default most simultaneous calls. Keep `telephony.maxConcurrentCalls` at or below the model plan's limit. */
export const DEFAULT_MAX_CONCURRENT_CALLS = 25;

/** A held slot. Release it exactly when the call is over; extra releases are ignored. */
export class CallCapacityLease {
    private released = false;

    constructor(private readonly onRelease: () => void) {}

    /** Gives the slot back. Idempotent. */
    public Release(): void {
        if (this.released) {
            return;
        }
        this.released = true;
        this.onRelease();
    }
}

/** What the services need from the gate (an interface so tests can inject a fake). */
export interface ICallCapacity {
    /** Takes a slot, or returns `null` when the server is at its cap. */
    TryAcquire(): CallCapacityLease | null;
}

/** A counting gate over a fixed number of slots. */
export class CallCapacityGate implements ICallCapacity {
    private maxCalls: number;
    private active = 0;

    constructor(maxConcurrentCalls: number | undefined = DEFAULT_MAX_CONCURRENT_CALLS) {
        this.maxCalls = CallCapacityGate.normalize(maxConcurrentCalls);
    }

    /** A missing, non-finite or non-positive value uses the default, so a typo can neither remove the limit nor lock every caller out. */
    private static normalize(value: number | undefined): number {
        return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.floor(value) : DEFAULT_MAX_CONCURRENT_CALLS;
    }

    /** The configured cap. */
    public get Max(): number {
        return this.maxCalls;
    }

    /** How many calls currently hold a slot. */
    public get Active(): number {
        return this.active;
    }

    /** Changes the cap. Lowering it never drops a live call; it only refuses new ones until enough calls end. */
    public Configure(maxConcurrentCalls: number | undefined): void {
        this.maxCalls = CallCapacityGate.normalize(maxConcurrentCalls);
    }

    /** Takes a slot, or returns `null` when the gate is at its cap. */
    public TryAcquire(): CallCapacityLease | null {
        if (this.active >= this.maxCalls) {
            return null;
        }
        this.active++;
        return new CallCapacityLease(() => {
            this.active = Math.max(0, this.active - 1);
        });
    }
}

/** The process-wide concurrent-call gate every carrier service shares (the cap counts calls, not calls per carrier). */
export class TelephonyCapacity extends BaseSingleton<TelephonyCapacity> implements ICallCapacity {
    private readonly gate = new CallCapacityGate();

    protected constructor() {
        super();
    }

    /** The singleton accessor. */
    public static get Instance(): TelephonyCapacity {
        return super.getInstance<TelephonyCapacity>();
    }

    /** The configured cap. */
    public get Max(): number {
        return this.gate.Max;
    }

    /** How many calls currently hold a slot. */
    public get Active(): number {
        return this.gate.Active;
    }

    /** Sets the cap (see {@link CallCapacityGate.Configure}). */
    public Configure(maxConcurrentCalls: number | undefined): void {
        this.gate.Configure(maxConcurrentCalls);
    }

    /** Takes a slot, or returns `null` when the server is at its cap. */
    public TryAcquire(): CallCapacityLease | null {
        return this.gate.TryAcquire();
    }
}
