/**
 * Calls `fn` on every item with at most `n` calls in flight. Results keep the order of `items`.
 * Rejects with the first error; calls already started are not cancelled.
 */
export async function RunWithConcurrency<T, R>(items: T[], n: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array<R>(items.length);
    let next = 0;
    const worker = async (): Promise<void> => {
        while (next < items.length) {
            const i = next++;
            out[i] = await fn(items[i], i);
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, () => worker()));
    return out;
}
