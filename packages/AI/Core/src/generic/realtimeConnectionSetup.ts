/** Default limit on waiting for a provider to confirm a new connection's setup, the same as one resume attempt's. */
export const REALTIME_CONNECTION_SETUP_TIMEOUT_MS = 15000;

/**
 * One realtime connection's setup, as the provider confirms it (Gemini Live's `setupComplete`). Gemini Live drops input
 * that reaches a connection before it confirms the setup, so a driver puts a new connection to use only once
 * {@link Wait} resolves. Create it before opening the connection, so a confirmation or a close that comes early is not
 * missed.
 */
export class RealtimeConnectionSetup {
    private settle: { Confirm: () => void; Fail: (error: Error) => void } | null = null;
    private confirmed = false;
    private readonly outcome: Promise<void>;

    constructor() {
        this.outcome = new Promise<void>((resolve, reject) => {
            this.settle = { Confirm: resolve, Fail: reject };
        });
        // A connection that fails while nobody waits must not surface as an unhandled rejection; Wait reports it.
        this.outcome.catch(() => undefined);
    }

    /** Whether the provider confirmed the setup. */
    public get IsConfirmed(): boolean {
        return this.confirmed;
    }

    /** The provider confirmed the setup. Later calls, and a failure reported after it, change nothing. */
    public Confirm(): void {
        if (!this.settle) {
            return;
        }
        this.confirmed = true;
        this.settle.Confirm();
        this.settle = null;
    }

    /**
     * The connection closed or failed before the provider confirmed the setup. Changes nothing once the setup was
     * confirmed or had already failed.
     *
     * @param error Why the setup failed; {@link Wait} rejects with it.
     */
    public Fail(error: Error): void {
        if (!this.settle) {
            return;
        }
        this.settle.Fail(error);
        this.settle = null;
    }

    /**
     * Resolves once the provider confirms the setup. Rejects when the connection fails first, or when no confirmation
     * comes within `timeoutMs`; the setup then counts as failed.
     *
     * @param timeoutMs How long to wait for the confirmation. Defaults to {@link REALTIME_CONNECTION_SETUP_TIMEOUT_MS}.
     */
    public Wait(timeoutMs: number = REALTIME_CONNECTION_SETUP_TIMEOUT_MS): Promise<void> {
        const timer = setTimeout(() => {
            this.Fail(new Error(`the provider did not confirm the session setup within ${timeoutMs} ms`));
        }, timeoutMs);
        return this.outcome.finally(() => clearTimeout(timer));
    }
}
