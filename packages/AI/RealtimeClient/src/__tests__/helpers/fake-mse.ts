/**
 * A fake Media Source Extensions environment: a `MediaSource` (or iOS's `ManagedMediaSource`) whose source
 * buffers record what was appended and removed and finish each operation on the next microtask, plus
 * `URL.createObjectURL` / `revokeObjectURL`. Remove it with `vi.unstubAllGlobals()` and `vi.restoreAllMocks()`.
 */
import { vi } from 'vitest';

/** Buffered time ranges that a test sets directly. */
export class FakeTimeRanges implements TimeRanges {
    constructor(public Ranges: Array<[number, number]> = []) {}
    public get length(): number {
        return this.Ranges.length;
    }
    public start(index: number): number {
        return this.Ranges[index][0];
    }
    public end(index: number): number {
        return this.Ranges[index][1];
    }
}

/**
 * A source buffer that records appends and removals. Like a browser, it applies a removal to {@link buffered}
 * only when the removal completes, and `abort()` during an operation fires its own `updateend`.
 */
export class FakeSourceBuffer extends EventTarget {
    public mode: AppendMode = 'segments';
    public timestampOffset = 0;
    public updating = false;
    public buffered = new FakeTimeRanges();
    /** Every appended piece, in order. */
    public readonly Appended: ArrayBuffer[] = [];
    /** `timestampOffset` at the moment of each append. */
    public readonly OffsetAtAppend: number[] = [];
    /** Every `remove(start, end)`, in order. */
    public readonly Removed: Array<[number, number]> = [];
    public Aborts = 0;
    /** Errors the next appends throw, one each, in order. */
    public readonly AppendErrors: Error[] = [];
    /** Every `changeType(type)`, in order, with the number of pieces appended before it. */
    public readonly TypeChanges: Array<{ Type: string; AfterAppends: number }> = [];
    /** Bumped by abort, so an aborted operation's completion is ignored. */
    private operation = 0;

    constructor(public readonly Type: string) {
        super();
    }

    /** Records the switch. A test plays a browser without it by defining the property as `undefined` on the instance. */
    public changeType(type: string): void {
        this.TypeChanges.push({ Type: type, AfterAppends: this.Appended.length });
    }

    public appendBuffer(data: ArrayBuffer): void {
        const error = this.AppendErrors.shift();
        if (error) {
            throw error;
        }
        this.Appended.push(data);
        this.OffsetAtAppend.push(this.timestampOffset);
        this.finishLater();
    }

    /** Records the removal; it cuts the range out of {@link buffered} when it completes. */
    public remove(start: number, end: number): void {
        this.Removed.push([start, end]);
        this.finishLater(() => {
            this.buffered = new FakeTimeRanges(
                this.buffered.Ranges.flatMap(([from, to]): Array<[number, number]> => {
                    const kept: Array<[number, number]> = [];
                    if (from < start) {
                        kept.push([from, Math.min(to, start)]);
                    }
                    if (to > end) {
                        kept.push([Math.max(from, end), to]);
                    }
                    return kept;
                })
            );
        });
    }

    /** Cancels the operation in progress, which then ends with its own `updateend`, as the MSE spec says. */
    public abort(): void {
        this.Aborts++;
        if (!this.updating) {
            return;
        }
        this.operation++;
        this.updating = false;
        queueMicrotask(() => this.dispatchEvent(new Event('updateend')));
    }

    private finishLater(complete: () => void = () => undefined): void {
        this.updating = true;
        const operation = ++this.operation;
        queueMicrotask(() => {
            if (operation !== this.operation) {
                return;
            }
            complete();
            this.updating = false;
            this.dispatchEvent(new Event('updateend'));
        });
    }
}

/** A media source; the test calls {@link Open} where a browser would open it after `src` is set. */
export class FakeMediaSource extends EventTarget {
    /** Whether `isTypeSupported` says yes. */
    public static Supported = true;
    /** Types `isTypeSupported` refuses even while {@link Supported} is true. */
    public static readonly UnsupportedTypes = new Set<string>();
    /** Every instance created, in order. */
    public static readonly Instances: FakeMediaSource[] = [];
    public readyState: ReadyState = 'closed';
    public readonly Buffers: FakeSourceBuffer[] = [];
    public EndOfStreamCalls = 0;

    public static isTypeSupported(type: string): boolean {
        return FakeMediaSource.Supported && !FakeMediaSource.UnsupportedTypes.has(type);
    }

    constructor() {
        super();
        FakeMediaSource.Instances.push(this);
    }

    public addSourceBuffer(type: string): FakeSourceBuffer {
        const buffer = new FakeSourceBuffer(type);
        this.Buffers.push(buffer);
        return buffer;
    }

    public endOfStream(): void {
        this.EndOfStreamCalls++;
        this.readyState = 'ended';
    }

    /** What the browser does once the element has loaded the object URL. */
    public Open(): void {
        this.readyState = 'open';
        this.dispatchEvent(new Event('sourceopen'));
    }
}

/** Installs the fake as `MediaSource`, or as `ManagedMediaSource` (iOS Safari) when `managed` is set. */
export function InstallFakeMse(options: { Managed?: boolean } = {}): void {
    FakeMediaSource.Supported = true;
    FakeMediaSource.UnsupportedTypes.clear();
    FakeMediaSource.Instances.length = 0;
    vi.stubGlobal('MediaSource', options.Managed ? undefined : FakeMediaSource);
    vi.stubGlobal('ManagedMediaSource', options.Managed ? FakeMediaSource : undefined);
    let next = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:fake/${++next}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
}

/** A tiny piece whose first box is `ftyp`: an MP4 init segment. */
export function FakeInitSegment(): ArrayBuffer {
    return box('ftyp');
}

/** A tiny piece whose first box is `moof`: an MP4 media fragment. */
export function FakeFragment(): ArrayBuffer {
    return box('moof');
}

function box(type: string): ArrayBuffer {
    const bytes = new Uint8Array(16);
    new DataView(bytes.buffer).setUint32(0, 16);
    for (let i = 0; i < 4; i++) {
        bytes[4 + i] = type.charCodeAt(i);
    }
    return bytes.buffer;
}
