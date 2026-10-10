/**
 * What the conformance harnesses share: a way to stand in for a browser global for one harness and put it back, and a
 * way to wait for something the client does on a later tick. No test framework, so a harness reads as a provider would
 * write one.
 */

/** Replaces one property of `globalThis` (a browser API Node lacks or has differently) and puts the original back. */
export class GlobalOverride {
    private original: PropertyDescriptor | undefined;
    private installed = false;

    constructor(private readonly name: string) {}

    /** Sets the global to `value`, remembering what was there. */
    public Install<T>(value: T): void {
        if (!this.installed) {
            this.original = Object.getOwnPropertyDescriptor(globalThis, this.name);
            this.installed = true;
        }
        Object.defineProperty(globalThis, this.name, { value, configurable: true, writable: true, enumerable: false });
    }

    /** Puts the original back, or removes the global when there was none. */
    public Restore(): void {
        if (!this.installed) {
            return;
        }
        if (this.original) {
            Object.defineProperty(globalThis, this.name, this.original);
        } else {
            Reflect.deleteProperty(globalThis, this.name);
        }
        this.installed = false;
    }
}

/**
 * Stands in for Media Source Extensions as far as a driver asks "can this browser play this type": a `MediaSource`
 * whose `isTypeSupported` answers as the harness says. Nothing plays through it; the kit records the player instead.
 */
export class PlayabilityStub {
    private readonly mediaSource = new GlobalOverride('MediaSource');
    private readonly managedMediaSource = new GlobalOverride('ManagedMediaSource');
    private playable = true;

    /** Installs the stub: every type plays, unless {@link Refuse} said otherwise (before the connect, as a check does). */
    public Install(): void {
        const stub = this;
        this.mediaSource.Install({ isTypeSupported: (_type: string): boolean => stub.playable });
        this.managedMediaSource.Install(undefined);
    }

    /** No type plays from now on. Returns the undo. */
    public Refuse(): () => void {
        this.playable = false;
        return () => {
            this.playable = true;
        };
    }

    /** Puts the browser's own MSE globals back; every type plays again. */
    public Restore(): void {
        this.playable = true;
        this.mediaSource.Restore();
        this.managedMediaSource.Restore();
    }
}

/** Resolves on the next macrotask, after every pending microtask. */
export function NextMacrotask(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Waits, a macrotask at a time, until `condition` holds; rejects naming `what` when it doesn't within `maxTicks`.
 * For what the client does on a later tick: a socket it opens, a connection it switches to.
 */
export async function WaitUntil(condition: () => boolean, what: string, maxTicks: number = 500): Promise<void> {
    for (let tick = 0; tick < maxTicks; tick++) {
        if (condition()) {
            return;
        }
        await NextMacrotask();
    }
    throw new Error(`Timed out waiting for ${what}`);
}

/** A config's expiry, half an hour out. */
export function HalfAnHourFromNow(): string {
    return new Date(Date.now() + 30 * 60 * 1000).toISOString();
}
