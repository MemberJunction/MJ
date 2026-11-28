import type { IOpenAIRealtimeConnection } from '@memberjunction/ai-openai';
import type { IRealtimeInProcessUpstream, RealtimeInProcessUpstreamFactory } from '@memberjunction/ai';
import type { OpenAIRealtimeError } from 'openai/realtime/index';
import type { RealtimeClientEvent, RealtimeServerEvent } from 'openai/resources/realtime/realtime';

type EventListener = (event: RealtimeServerEvent) => void;
type ErrorListener = (error: OpenAIRealtimeError) => void;

/**
 * Connects the shared OpenAI-protocol session to an upstream in this process, as a websocket would to a remote one:
 * frames are JSON both ways, `error` frames go to the error listeners (with their payload, which marks them
 * recoverable), and a close the session did not ask for reaches the close listeners.
 */
export class InProcessRealtimeConnection implements IOpenAIRealtimeConnection {
    private readonly eventListeners = new Set<EventListener>();
    private readonly errorListeners = new Set<ErrorListener>();
    private readonly closeListeners = new Set<() => void>();
    private readonly upstream: IRealtimeInProcessUpstream;
    private closed = false;

    /** The close signal, in the shape the shared session looks for. */
    public readonly socket = {
        addEventListener: (_type: 'close', listener: () => void): void => {
            this.closeListeners.add(listener);
        },
    };

    constructor(openUpstream: RealtimeInProcessUpstreamFactory) {
        this.upstream = openUpstream({
            Send: (frame) => this.deliver(frame),
            Close: () => this.upstreamClosed(),
        });
    }

    public on(event: 'event', listener: EventListener): void;
    public on(event: 'error', listener: ErrorListener): void;
    public on(event: 'event' | 'error', listener: EventListener | ErrorListener): void {
        if (event === 'event') {
            this.eventListeners.add(listener as EventListener);
        } else {
            this.errorListeners.add(listener as ErrorListener);
        }
    }

    public off(event: 'event', listener: EventListener): void;
    public off(event: 'error', listener: ErrorListener): void;
    public off(event: 'event' | 'error', listener: EventListener | ErrorListener): void {
        if (event === 'event') {
            this.eventListeners.delete(listener as EventListener);
        } else {
            this.errorListeners.delete(listener as ErrorListener);
        }
    }

    public send(event: RealtimeClientEvent): void {
        if (!this.closed) {
            this.upstream.Receive(JSON.stringify(event));
        }
    }

    public close(): void {
        if (!this.closed) {
            this.closed = true;
            this.upstream.Closed();
        }
    }

    private deliver(frame: string): void {
        if (this.closed) {
            return;
        }
        const event = JSON.parse(frame) as RealtimeServerEvent;
        if (event.type === 'error') {
            const error = new Error(event.error.message) as OpenAIRealtimeError;
            error.error = event.error;
            this.errorListeners.forEach((listener) => listener(error));
            return;
        }
        [...this.eventListeners].forEach((listener) => listener(event));
    }

    private upstreamClosed(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.upstream.Closed();
        this.closeListeners.forEach((listener) => listener());
    }
}
