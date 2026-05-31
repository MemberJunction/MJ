/**
 * Unbounded single-producer / single-consumer async queue used to back
 * transport inbound async-iterables. Inline implementation, no external dep.
 *
 * NOTE: `WebSocketTransport`, `WebRTCTransport`, and `AudioFrameBus` each carry
 * their own inlined copy of this class (predates this file). New code should
 * import from here; the older copies are left in place to avoid churn in
 * already-shipping transports.
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
    private items: T[] = [];
    private waiters: Array<(value: IteratorResult<T>) => void> = [];
    private closed = false;

    public Push(item: T): void {
        if (this.closed) {
            return;
        }
        const waiter = this.waiters.shift();
        if (waiter) {
            waiter({ value: item, done: false });
        } else {
            this.items.push(item);
        }
    }

    public Close(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        while (this.waiters.length) {
            const w = this.waiters.shift();
            if (w) {
                w({ value: undefined as never, done: true });
            }
        }
    }

    public [Symbol.asyncIterator](): AsyncIterableIterator<T> {
        const self = this;
        return {
            [Symbol.asyncIterator](): AsyncIterableIterator<T> {
                return this;
            },
            next(): Promise<IteratorResult<T>> {
                if (self.items.length > 0) {
                    const value = self.items.shift() as T;
                    return Promise.resolve({ value, done: false });
                }
                if (self.closed) {
                    return Promise.resolve({ value: undefined as never, done: true });
                }
                return new Promise<IteratorResult<T>>((resolve) => self.waiters.push(resolve));
            },
        };
    }
}
