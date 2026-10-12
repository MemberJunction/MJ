import { LIBOPUS_WORKER_SOURCE, OpusWorkerReply, OpusWorkerRequest } from './libopus-worker-source';
import type { IOpusPacketEncoder } from './opus-packet-encoder';

/**
 * How long {@link WasmOpusEncoder.Flush} waits for the worker's `flushed` reply. The runtime bounds
 * the whole recorder Stop at 2 s, so this stays below that and leaves room for closing up.
 */
export const WASM_OPUS_FLUSH_TIMEOUT_MS = 1500;

/** The two-way channel to the encoder worker. A real `Worker` is adapted to it; tests run the worker source in-process. */
export interface OpusWorkerPort {
    /** Posts a request, transferring the listed buffers. */
    Post(message: OpusWorkerRequest, transfer: Transferable[]): void;
    /** Receives every reply the worker posts. */
    OnReply: ((reply: OpusWorkerReply) => void) | null;
    /** Stops the worker. */
    Terminate(): void;
}

/** Memoized load of the embedded wasm module, so a page only parses the 440 KB string once. */
let wasmBase64Load: Promise<string> | null = null;

function loadLibopusWasmBase64(): Promise<string> {
    if (!wasmBase64Load) {
        // Dynamic import, category 3 (genuine bundle-size deferral, .claude/rules/typescript-style.md):
        // the embedded libopus build is ~440 KB of base64 and is needed only by browsers whose WebCodecs
        // cannot encode Opus. A static import would put it in every Explorer bundle that loads this
        // library. The module is local to this package, so no dependency is hidden from package.json.
        wasmBase64Load = import('./libopus-wasm-binary').then((module) => module.LIBOPUS_WASM_BASE64);
        wasmBase64Load.catch(() => {
            // Let a later call retry (e.g. a chunk load that failed on a flaky network); the caller logs.
            wasmBase64Load = null;
        });
    }
    return wasmBase64Load;
}

/** Decodes base64 into a fresh ArrayBuffer (one the worker can take ownership of). */
export function DecodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Opus encoding through libopus compiled to WebAssembly, running in a dedicated Worker so encoding
 * never competes with the call's UI or audio on the main thread. The fallback for browsers whose
 * WebCodecs cannot encode Opus.
 *
 * The worker does the 960-sample framing itself (see {@link LIBOPUS_WORKER_SOURCE}); this class only
 * forwards audio, collects the packets the worker posts back, and turns `flush` into a promise.
 */
export class WasmOpusEncoder implements IOpusPacketEncoder {
    public readonly Kind = 'wasm';
    private packets: Uint8Array[] = [];
    private readonly flushWaiters = new Map<number, () => void>();
    private nextFlushId = 1;
    private closed = false;

    /**
     * @param port channel to a worker running {@link LIBOPUS_WORKER_SOURCE}
     * @param wasmBytes the libopus module; ownership moves to the worker
     * @param onClose extra cleanup after the worker stops (the Blob URL revoke)
     */
    constructor(private readonly port: OpusWorkerPort, wasmBytes: ArrayBuffer, private readonly onClose: () => void = () => undefined) {
        port.OnReply = (reply) => this.onReply(reply);
        port.Post({ Type: 'init', Wasm: wasmBytes }, [wasmBytes]);
    }

    /** Loads the embedded wasm and starts the worker from a Blob URL. Rejects if either fails. */
    public static async Create(): Promise<WasmOpusEncoder> {
        const wasmBytes = DecodeBase64ToArrayBuffer(await loadLibopusWasmBase64());
        const url = URL.createObjectURL(new Blob([LIBOPUS_WORKER_SOURCE], { type: 'application/javascript' }));
        try {
            const worker = new Worker(url);
            return new WasmOpusEncoder(new BrowserWorkerPort(worker), wasmBytes, () => URL.revokeObjectURL(url));
        } catch (error) {
            URL.revokeObjectURL(url);
            throw error;
        }
    }

    public Encode(pcm48k: Float32Array): void {
        if (this.closed || pcm48k.length === 0) {
            return;
        }
        const copy = pcm48k.slice();
        this.port.Post({ Type: 'encode', Pcm: copy }, [copy.buffer]);
    }

    public Flush(): Promise<void> {
        if (this.closed) {
            return Promise.resolve();
        }
        const id = this.nextFlushId++;
        return new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
                this.flushWaiters.delete(id);
                console.warn(`[WasmOpusEncoder] Worker did not confirm flush within ${WASM_OPUS_FLUSH_TIMEOUT_MS} ms — the final packets may be missing.`);
                resolve();
            }, WASM_OPUS_FLUSH_TIMEOUT_MS);
            this.flushWaiters.set(id, () => {
                clearTimeout(timer);
                resolve();
            });
            this.port.Post({ Type: 'flush', ID: id }, []);
        });
    }

    public TakePackets(): Uint8Array[] {
        const packets = this.packets;
        this.packets = [];
        return packets;
    }

    public Close(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.port.OnReply = null;
        this.port.Terminate();
        this.onClose();
        // A flush still waiting can never be answered now; release it instead of leaving it to the timeout.
        for (const release of this.flushWaiters.values()) {
            release();
        }
        this.flushWaiters.clear();
    }

    private onReply(reply: OpusWorkerReply): void {
        switch (reply.Type) {
            case 'packets':
                for (const buffer of reply.Packets) {
                    this.packets.push(new Uint8Array(buffer));
                }
                break;
            case 'flushed': {
                const release = this.flushWaiters.get(reply.ID);
                this.flushWaiters.delete(reply.ID);
                release?.();
                break;
            }
            case 'error':
                console.warn(`[WasmOpusEncoder] ${reply.Message} — the rest of this call is not recorded.`);
                break;
            case 'ready':
                break;
        }
    }
}

/** Adapts a DOM `Worker` to {@link OpusWorkerPort}. */
class BrowserWorkerPort implements OpusWorkerPort {
    public OnReply: ((reply: OpusWorkerReply) => void) | null = null;

    constructor(private readonly worker: Worker) {
        worker.onmessage = (event: MessageEvent<OpusWorkerReply>) => this.OnReply?.(event.data);
        worker.onerror = (event: ErrorEvent) => {
            console.warn(`[WasmOpusEncoder] Encoder worker error: ${event.message}`);
        };
    }

    public Post(message: OpusWorkerRequest, transfer: Transferable[]): void {
        this.worker.postMessage(message, transfer);
    }

    public Terminate(): void {
        this.worker.onmessage = null;
        this.worker.onerror = null;
        this.worker.terminate();
    }
}
