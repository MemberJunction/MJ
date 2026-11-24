import type { AssemblyAISocket } from '../../voice/assemblyAISocket';

/** An in-memory provider socket: records what was sent, and lets a test play the provider. */
export class FakeSocket implements AssemblyAISocket {
    public OnMessage: ((text: string) => void) | null = null;
    public OnClose: ((code: number, reason: string) => void) | null = null;
    public readonly SentText: Array<Record<string, unknown>> = [];
    public readonly SentBinary: Uint8Array[] = [];
    public CloseCalls = 0;
    public IsClosed = false;

    constructor(
        public readonly Url: string = '',
        public readonly ApiKey: string = ''
    ) {}

    public Send(data: string | Uint8Array): void {
        if (this.IsClosed) {
            throw new Error('send after close');
        }
        if (typeof data === 'string') {
            this.SentText.push(JSON.parse(data) as Record<string, unknown>);
        } else {
            this.SentBinary.push(data);
        }
    }
    public Close(): void {
        this.CloseCalls++;
        this.IsClosed = true;
    }
    public Types(): string[] {
        return this.SentText.map((m) => String(m['type']));
    }
    /** The provider sends a frame. */
    public Receive(frame: Record<string, unknown>): void {
        this.OnMessage?.(JSON.stringify(frame));
    }
    /** The provider (or the network) closes the socket. */
    public Drop(code = 1006, reason = ''): void {
        this.IsClosed = true;
        this.OnClose?.(code, reason);
    }
}
