/**
 * Unbounded single-producer / single-consumer async queue used to bridge
 * event-driven sources (WebSocket `message`/`error` callbacks) into
 * `AsyncIterable<T>` consumers — e.g. an `async function*` generator yielding
 * audio frames. Mirrors the inline pattern in
 * `@memberjunction/ai-agent-channel-runtime/WebSocketTransport`; kept local
 * to avoid a cross-package dependency for one ~60-line helper.
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
    private items: T[] = [];
    private waiters: Array<(value: IteratorResult<T>) => void> = [];
    private closed = false;
    private error: Error | null = null;

    public Push(item: T): void {
        if (this.closed) return;
        const waiter = this.waiters.shift();
        if (waiter) {
            waiter({ value: item, done: false });
        } else {
            this.items.push(item);
        }
    }

    public Fail(err: Error): void {
        if (this.closed) return;
        this.error = err;
        this.Close();
    }

    public Close(): void {
        if (this.closed) return;
        this.closed = true;
        while (this.waiters.length) {
            const w = this.waiters.shift();
            if (w) w({ value: undefined as never, done: true });
        }
    }

    public [Symbol.asyncIterator](): AsyncIterableIterator<T> {
        const self = this;
        return {
            [Symbol.asyncIterator](): AsyncIterableIterator<T> { return this; },
            next(): Promise<IteratorResult<T>> {
                if (self.error) return Promise.reject(self.error);
                if (self.items.length > 0) {
                    const value = self.items.shift() as T;
                    return Promise.resolve({ value, done: false });
                }
                if (self.closed) {
                    return Promise.resolve({ value: undefined as never, done: true });
                }
                return new Promise<IteratorResult<T>>((resolve, reject) => {
                    self.waiters.push((res) => {
                        if (self.error) reject(self.error);
                        else resolve(res);
                    });
                });
            },
            return(): Promise<IteratorResult<T>> {
                self.Close();
                return Promise.resolve({ value: undefined as never, done: true });
            },
        };
    }
}
