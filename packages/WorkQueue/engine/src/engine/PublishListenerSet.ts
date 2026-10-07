import { LogError } from '@memberjunction/core';

/** In-process fan-out to listeners; one bad listener never breaks the others or the caller. */
export class ListenerSet<TEvent> {
    private readonly listeners = new Set<(event: TEvent) => void>();

    constructor(private readonly label: string) {}

    public Add(listener: (event: TEvent) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    public Notify(event: TEvent): void {
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (error) {
                LogError(`[WorkQueue] ${this.label} listener failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    public get Count(): number {
        return this.listeners.size;
    }
}

/** "Something was published to topic X" listeners, used to wake local consumers immediately (plan 06 host kick). */
export class PublishListenerSet extends ListenerSet<string> {
    constructor() {
        super('publish');
    }
}
