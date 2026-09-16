// Polyfill CloseEvent for test environments running on Node < 23
class MockCloseEvent extends Event {
    public code: number;
    public reason: string;
    public wasClean: boolean;
    constructor(type: string, init?: { code?: number; reason?: string; wasClean?: boolean }) {
        super(type);
        this.code = init?.code ?? 1000;
        this.reason = init?.reason ?? '';
        this.wasClean = init?.wasClean ?? true;
    }
}
if (typeof globalThis.CloseEvent === 'undefined') {
    (globalThis as unknown as { CloseEvent: typeof MockCloseEvent }).CloseEvent = MockCloseEvent;
}
