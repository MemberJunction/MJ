/**
 * Dual-capped (count + byte budget) ring buffer and O(1) TraceId correlation buffer.
 * Zero allocations on overflow eviction; tracks `DroppedCount` and `DroppedBytes`.
 */

export interface BoundedRingBufferOptions {
    maxItems: number;
    maxBytes: number;
}

interface BufferedEntry<T> {
    value: T;
    byteSize: number;
}

/**
 * Estimates UTF-8 byte length of a JSON-serializable value without throwing on circular references.
 */
export function EstimateByteSize(value: unknown): number {
    if (typeof value === 'string') {
        return value.length * 2 + 16;
    }
    try {
        const serialized = JSON.stringify(value);
        return serialized ? serialized.length * 2 : 32;
    } catch {
        return 256;
    }
}

export class BoundedRingBuffer<T> {
    private readonly _maxItems: number;
    private readonly _maxBytes: number;
    private readonly _entries: BufferedEntry<T>[] = [];
    private _currentBytes = 0;
    private _droppedCount = 0;
    private _droppedBytes = 0;

    public constructor(options: BoundedRingBufferOptions) {
        if (options.maxItems < 1) {
            throw new Error('BoundedRingBuffer maxItems must be >= 1');
        }
        if (options.maxBytes < 64) {
            throw new Error('BoundedRingBuffer maxBytes must be >= 64');
        }
        this._maxItems = options.maxItems;
        this._maxBytes = options.maxBytes;
    }

    public get Count(): number {
        return this._entries.length;
    }

    public get ByteSize(): number {
        return this._currentBytes;
    }

    public get DroppedCount(): number {
        return this._droppedCount;
    }

    public get DroppedBytes(): number {
        return this._droppedBytes;
    }

    public Push(item: T, estimatedBytes?: number): void {
        const byteSize = estimatedBytes ?? EstimateByteSize(item);
        if (byteSize > this._maxBytes) {
            this._droppedCount++;
            this._droppedBytes += byteSize;
            return;
        }

        while (
            this._entries.length > 0 &&
            (this._entries.length >= this._maxItems || this._currentBytes + byteSize > this._maxBytes)
        ) {
            const evicted = this._entries.shift()!;
            this._currentBytes -= evicted.byteSize;
            this._droppedCount++;
            this._droppedBytes += evicted.byteSize;
        }

        this._entries.push({ value: item, byteSize });
        this._currentBytes += byteSize;
    }

    public ToArray(): T[] {
        return this._entries.map((entry) => entry.value);
    }

    public Snapshot(): T[] {
        return this.ToArray();
    }

    public Clear(): void {
        this._entries.length = 0;
        this._currentBytes = 0;
        this._droppedCount = 0;
        this._droppedBytes = 0;
    }
}

export interface TraceCorrelationBufferOptions {
    maxTraces: number;
    maxItemsPerTrace: number;
    maxTotalBytes?: number;
}

/**
 * Indexes diagnostic entries by `traceId` for O(1) correlated slice extraction,
 * while bounding the number of tracked traces and entries per trace.
 */
export class TraceCorrelationBuffer<T extends { traceId?: string } = { traceId?: string }> {
    private readonly _maxTraces: number;
    private readonly _maxItemsPerTrace: number;
    private readonly _byTrace = new Map<string, T[]>();

    public constructor(
        optionsOrMaxTraces: TraceCorrelationBufferOptions | number = 500,
        maxItemsPerTrace: number = 200
    ) {
        if (typeof optionsOrMaxTraces === 'number') {
            this._maxTraces = optionsOrMaxTraces;
            this._maxItemsPerTrace = maxItemsPerTrace;
        } else {
            this._maxTraces = optionsOrMaxTraces.maxTraces;
            this._maxItemsPerTrace = optionsOrMaxTraces.maxItemsPerTrace;
        }
    }

    public Record(item: T, traceIdOverride?: string): void {
        const traceId = traceIdOverride ?? item.traceId;
        if (!traceId) {
            return;
        }
        this.Push(traceId, item);
    }

    public Push(traceId: string, item: T): void {
        if (!traceId) {
            return;
        }
        let bucket = this._byTrace.get(traceId);
        if (!bucket) {
            if (this._byTrace.size >= this._maxTraces) {
                const oldestKey = this._byTrace.keys().next().value;
                if (oldestKey !== undefined) {
                    this._byTrace.delete(oldestKey);
                }
            }
            bucket = [];
            this._byTrace.set(traceId, bucket);
        } else {
            // Refresh LRU order
            this._byTrace.delete(traceId);
            this._byTrace.set(traceId, bucket);
        }

        if (bucket.length >= this._maxItemsPerTrace) {
            bucket.shift();
        }
        bucket.push(item);
    }

    public GetByTraceId(traceId: string): T[] {
        const bucket = this._byTrace.get(traceId);
        return bucket ? bucket.slice() : [];
    }

    public GetTraceIds(): string[] {
        return Array.from(this._byTrace.keys());
    }

    public ToArray(): T[] {
        const all: T[] = [];
        for (const bucket of this._byTrace.values()) {
            all.push(...bucket);
        }
        return all;
    }

    public get TraceCount(): number {
        return this._byTrace.size;
    }

    public Clear(): void {
        this._byTrace.clear();
    }
}
