/**
 * @fileoverview Singleton host managing the shared lazy Edge AI Web Worker
 * (`bge-small-en-v1.5` bi-encoder + `ms-marco-MiniLM-L-6-v2` cross-encoder).
 *
 * Designed for non-blocking background initialization, strict per-call deadlines,
 * concurrent request multiplexing by `RequestId`, and circuit-breaker fallback
 * when offline, CSP-restricted, or WASM-unsupported.
 *
 * @module @memberjunction/ng-conversations
 */

import { BaseSingleton, GetGlobalObjectStore } from '@memberjunction/global';
import {
    EDGE_PRE_DISCOVERY_BI_ENCODER_MODEL,
    EDGE_PRE_DISCOVERY_CROSS_ENCODER_MODEL,
} from '@memberjunction/ai-core-plus';
import type {
    EdgeWorkerInitOptions,
    EdgeWorkerPort,
    EdgeWorkerReply,
    EdgeWorkerRequest,
} from './edge-ai-protocol';

/** Global object store key where host apps (e.g., MJExplorer) register their bundled Worker constructor. */
export const EDGE_AI_WORKER_FACTORY_STORE_KEY = '___MJ_EDGE_AI_WORKER_FACTORY__';

/** Default deadline for initial WASM + model weight load (cold cache). */
export const EDGE_WORKER_DEFAULT_INIT_TIMEOUT_MS = 30_000;

/** Default deadline for warm single-query operations. */
export const EDGE_WORKER_DEFAULT_QUERY_TIMEOUT_MS = 120;

/** Number of consecutive worker failures/timeouts before opening the circuit breaker. */
export const EDGE_WORKER_CIRCUIT_FAILURE_THRESHOLD = 3;

/** Cooldown duration before retrying after the circuit breaker opens. */
export const EDGE_WORKER_CIRCUIT_COOLDOWN_MS = 60_000;

/** Internal non-exported DOM Worker slice so naming-conventions stays clean. */
interface BrowserWorkerLike {
    postMessage(message: unknown, transfer?: Transferable[]): void;
    terminate(): void;
    onmessage: ((event: MessageEvent<EdgeWorkerReply>) => void) | null;
    onerror: ((event: ErrorEvent) => void) | null;
}

class BrowserEdgeWorkerPort implements EdgeWorkerPort {
    public OnReply: ((reply: EdgeWorkerReply) => void) | null = null;

    constructor(private readonly worker: BrowserWorkerLike) {
        worker.onmessage = (event: MessageEvent<EdgeWorkerReply>) => {
            this.OnReply?.(event.data);
        };
        worker.onerror = (event: ErrorEvent) => {
            this.OnReply?.({
                Type: 'error',
                Message: event.message || 'Edge AI worker crashed',
            });
        };
    }

    public Post(message: EdgeWorkerRequest, transfer: Transferable[]): void {
        this.worker.postMessage(message, transfer);
    }

    public Terminate(): void {
        this.worker.onmessage = null;
        this.worker.onerror = null;
        this.worker.terminate();
    }
}

interface PendingWaiter {
    Resolve: (reply: EdgeWorkerReply) => void;
    Timer: ReturnType<typeof setTimeout>;
}

/** Factory function creating an {@link EdgeWorkerPort}. */
export type EdgeWorkerPortFactory = () => EdgeWorkerPort;

/**
 * Shared singleton managing one lazy ONNX/WASM Web Worker for both Edge Agent
 * Pre-Discovery (Stage 6C.1) and the Client-Only Semantic Omnibox (Stage 6C.2).
 */
export class EdgeAIWorkerHost extends BaseSingleton<EdgeAIWorkerHost> {
    private port: EdgeWorkerPort | null = null;
    private portFactory: EdgeWorkerPortFactory | null = null;
    private initPromise: Promise<boolean> | null = null;
    private isReady = false;
    private isCrossEncoderReady = false;
    private consecutiveFailures = 0;
    private circuitOpenUntil = 0;
    private nextRequestSeq = 1;
    private readonly pending = new Map<string, PendingWaiter>();
    private initOptions: EdgeWorkerInitOptions = {
        BiEncoderModelId: EDGE_PRE_DISCOVERY_BI_ENCODER_MODEL,
        CrossEncoderModelId: EDGE_PRE_DISCOVERY_CROSS_ENCODER_MODEL,
        Device: 'wasm',
        DType: 'q8',
        LoadCrossEncoder: false,
    };

    protected constructor() {
        super();
    }

    public static get Instance(): EdgeAIWorkerHost {
        return super.getInstance<EdgeAIWorkerHost>();
    }

    /** True when the runtime supports Web Workers (or a test port factory is configured). */
    public get IsSupported(): boolean {
        return this.portFactory !== null || typeof Worker !== 'undefined';
    }

    /** True once the bi-encoder pipeline inside the worker has warmed and reported ready. */
    public get IsWarm(): boolean {
        return this.isReady && !this.IsCircuitOpen;
    }

    /** True once the cross-encoder reranker has also loaded inside the worker. */
    public get IsCrossEncoderWarm(): boolean {
        return this.isCrossEncoderReady && !this.IsCircuitOpen;
    }

    /** True while the circuit breaker is open after repeated worker failures/timeouts. */
    public get IsCircuitOpen(): boolean {
        if (this.consecutiveFailures < EDGE_WORKER_CIRCUIT_FAILURE_THRESHOLD) {
            return false;
        }
        if (Date.now() >= this.circuitOpenUntil) {
            // Half-open: allow one retry
            this.consecutiveFailures = EDGE_WORKER_CIRCUIT_FAILURE_THRESHOLD - 1;
            return false;
        }
        return true;
    }

    /** Configures a custom worker port factory (primarily for unit/stress tests). */
    public SetPortFactoryForTesting(factory: EdgeWorkerPortFactory | null): void {
        this.ResetForTesting();
        this.portFactory = factory;
    }

    /** Terminates the worker and clears all cached state and circuit-breaker counters. */
    public ResetForTesting(): void {
        this.Dispose();
        this.portFactory = null;
        this.consecutiveFailures = 0;
        this.circuitOpenUntil = 0;
        this.initOptions = {
            BiEncoderModelId: EDGE_PRE_DISCOVERY_BI_ENCODER_MODEL,
            CrossEncoderModelId: EDGE_PRE_DISCOVERY_CROSS_ENCODER_MODEL,
            Device: 'wasm',
            DType: 'q8',
            LoadCrossEncoder: false,
        };
    }

    /**
     * Lazily spawns and warms the Web Worker. Coalesces concurrent callers.
     * Never throws; returns `false` when unsupported, offline/erroring, or timed out.
     */
    public async EnsureWarm(
        options?: EdgeWorkerInitOptions,
        timeoutMs: number = EDGE_WORKER_DEFAULT_INIT_TIMEOUT_MS
    ): Promise<boolean> {
        if (!this.IsSupported || this.IsCircuitOpen) {
            return false;
        }
        const merged: EdgeWorkerInitOptions = { ...this.initOptions, ...options };
        const needsCross = Boolean(merged.LoadCrossEncoder) && !this.isCrossEncoderReady;
        if (this.isReady && !needsCross) {
            return true;
        }
        if (this.initPromise && !needsCross) {
            return this.initPromise;
        }

        this.initOptions = merged;
        const runInit = (async (): Promise<boolean> => {
            const port = this.ensurePort();
            if (!port) {
                this.recordFailure();
                return false;
            }
            const requestId = this.nextRequestId('init');
            const reply = await this.sendRequest(
                port,
                {
                    Type: 'init',
                    RequestId: requestId,
                    BiEncoderModelId: merged.BiEncoderModelId,
                    CrossEncoderModelId: merged.CrossEncoderModelId,
                    Device: merged.Device ?? 'wasm',
                    DType: merged.DType ?? 'q8',
                    LoadCrossEncoder: merged.LoadCrossEncoder ?? false,
                    LocalModelPath: merged.LocalModelPath,
                    AllowRemoteModels: merged.AllowRemoteModels,
                    WasmPaths: merged.WasmPaths,
                },
                [],
                timeoutMs
            );

            if (reply?.Type === 'ready') {
                this.isReady = true;
                if (reply.CrossEncoderLoaded) {
                    this.isCrossEncoderReady = true;
                }
                this.consecutiveFailures = 0;
                return true;
            }
            this.recordFailure();
            return false;
        })();

        this.initPromise = runInit;
        try {
            return await runInit;
        } finally {
            if (this.initPromise === runInit) {
                this.initPromise = null;
            }
        }
    }

    /**
     * Embeds `texts` using the worker's `bge-small-en-v1.5` pipeline, lazily warming
     * the worker first if needed. Returns `null` on timeout, circuit open, or error.
     */
    public async Embed(
        texts: ReadonlyArray<string>,
        timeoutMs: number = EDGE_WORKER_DEFAULT_QUERY_TIMEOUT_MS,
        modelId?: string
    ): Promise<Float32Array[] | null> {
        if (texts.length === 0) {
            return [];
        }
        if (!this.IsSupported || this.IsCircuitOpen) {
            return null;
        }
        const warm = await this.EnsureWarm(
            modelId ? { BiEncoderModelId: modelId } : undefined,
            Math.max(timeoutMs, EDGE_WORKER_DEFAULT_INIT_TIMEOUT_MS)
        );
        if (!warm || !this.port) {
            return null;
        }
        return this.runEmbed(this.port, [...texts], timeoutMs, modelId);
    }

    /**
     * Embeds `texts` ONLY if the worker is already warm — returns `null` immediately
     * when cold so interactive paths (typing in Omnibar, sending a message) never block
     * on model downloads.
     */
    public async EmbedIfWarm(
        texts: ReadonlyArray<string>,
        timeoutMs: number = EDGE_WORKER_DEFAULT_QUERY_TIMEOUT_MS,
        modelId?: string
    ): Promise<Float32Array[] | null> {
        if (texts.length === 0) {
            return [];
        }
        if (!this.IsWarm || !this.port) {
            return null;
        }
        return this.runEmbed(this.port, [...texts], timeoutMs, modelId);
    }

    /**
     * Reranks `[query, doc]` pairs using the worker's `ms-marco-MiniLM-L-6-v2`
     * cross-encoder, returning raw logits. Returns `null` on timeout/error/cold failure.
     */
    public async Rerank(
        query: string,
        documents: ReadonlyArray<string>,
        timeoutMs: number = EDGE_WORKER_DEFAULT_QUERY_TIMEOUT_MS,
        modelId?: string
    ): Promise<number[] | null> {
        if (documents.length === 0) {
            return [];
        }
        if (!this.IsSupported || this.IsCircuitOpen) {
            return null;
        }
        const warm = await this.EnsureWarm(
            {
                LoadCrossEncoder: true,
                ...(modelId ? { CrossEncoderModelId: modelId } : {}),
            },
            Math.max(timeoutMs, EDGE_WORKER_DEFAULT_INIT_TIMEOUT_MS)
        );
        if (!warm || !this.port) {
            return null;
        }
        return this.runRerank(this.port, query, [...documents], timeoutMs, modelId);
    }

    /**
     * Reranks `documents` ONLY when the worker's cross-encoder is already warm.
     */
    public async RerankIfWarm(
        query: string,
        documents: ReadonlyArray<string>,
        timeoutMs: number = EDGE_WORKER_DEFAULT_QUERY_TIMEOUT_MS,
        modelId?: string
    ): Promise<number[] | null> {
        if (documents.length === 0) {
            return [];
        }
        if (!this.IsCrossEncoderWarm || !this.port) {
            return null;
        }
        return this.runRerank(this.port, query, [...documents], timeoutMs, modelId);
    }

    /** Terminates the active worker and rejects/clears any pending callers gracefully. */
    public Dispose(): void {
        this.isReady = false;
        this.isCrossEncoderReady = false;
        this.initPromise = null;

        for (const [id, waiter] of this.pending) {
            clearTimeout(waiter.Timer);
            waiter.Resolve({ Type: 'error', RequestId: id, Message: 'Edge AI worker disposed' });
        }
        this.pending.clear();

        if (this.port) {
            this.port.OnReply = null;
            this.port.Terminate();
            this.port = null;
        }
    }

    private async runEmbed(
        port: EdgeWorkerPort,
        texts: string[],
        timeoutMs: number,
        modelId?: string
    ): Promise<Float32Array[] | null> {
        const requestId = this.nextRequestId('embed');
        const reply = await this.sendRequest(
            port,
            {
                Type: 'embed',
                RequestId: requestId,
                Texts: texts,
                ModelId: modelId ?? this.initOptions.BiEncoderModelId,
                Device: this.initOptions.Device ?? 'wasm',
                DType: this.initOptions.DType ?? 'q8',
            },
            [],
            timeoutMs
        );
        if (reply?.Type === 'embedded') {
            this.consecutiveFailures = 0;
            return reply.Vectors.map((buf) => new Float32Array(buf));
        }
        this.recordFailure();
        return null;
    }

    private async runRerank(
        port: EdgeWorkerPort,
        query: string,
        documents: string[],
        timeoutMs: number,
        modelId?: string
    ): Promise<number[] | null> {
        const requestId = this.nextRequestId('rerank');
        const reply = await this.sendRequest(
            port,
            {
                Type: 'rerank',
                RequestId: requestId,
                Query: query,
                Documents: documents,
                ModelId: modelId ?? this.initOptions.CrossEncoderModelId,
                Device: this.initOptions.Device ?? 'wasm',
                DType: this.initOptions.DType ?? 'q8',
            },
            [],
            timeoutMs
        );
        if (reply?.Type === 'reranked') {
            this.isCrossEncoderReady = true;
            this.consecutiveFailures = 0;
            return reply.Logits;
        }
        this.recordFailure();
        return null;
    }

    private ensurePort(): EdgeWorkerPort | null {
        if (this.port) {
            return this.port;
        }
        try {
            const port = this.portFactory ? this.portFactory() : this.createBrowserWorkerPort();
            port.OnReply = (reply) => this.handleReply(reply);
            this.port = port;
            return port;
        } catch {
            return null;
        }
    }

    private createBrowserWorkerPort(): EdgeWorkerPort {
        const globalStore = GetGlobalObjectStore() as Record<string, unknown>;
        const hostFactory = globalStore[EDGE_AI_WORKER_FACTORY_STORE_KEY];
        if (typeof hostFactory === 'function') {
            const custom = (hostFactory as () => BrowserWorkerLike | EdgeWorkerPort)();
            if (custom && typeof (custom as EdgeWorkerPort).Post === 'function') {
                return custom as EdgeWorkerPort;
            }
            return new BrowserEdgeWorkerPort(custom as BrowserWorkerLike);
        }
        const worker = new Worker(
            new URL('./edge-ai.worker.js', import.meta.url),
            { type: 'module' }
        );
        return new BrowserEdgeWorkerPort(worker as unknown as BrowserWorkerLike);
    }

    private handleReply(reply: EdgeWorkerReply): void {
        const reqId = 'RequestId' in reply ? reply.RequestId : undefined;
        if (reqId && this.pending.has(reqId)) {
            const waiter = this.pending.get(reqId)!;
            this.pending.delete(reqId);
            clearTimeout(waiter.Timer);
            waiter.Resolve(reply);
            return;
        }
        // Uncorrelated worker error (e.g. worker.onerror crash): fail all pending requests
        if (reply.Type === 'error' && !reqId) {
            this.isReady = false;
            this.isCrossEncoderReady = false;
            for (const [id, waiter] of this.pending) {
                clearTimeout(waiter.Timer);
                waiter.Resolve({ Type: 'error', RequestId: id, Message: reply.Message });
            }
            this.pending.clear();
            if (this.port) {
                this.port.OnReply = null;
                this.port.Terminate();
                this.port = null;
            }
        }
    }

    private sendRequest(
        port: EdgeWorkerPort,
        request: EdgeWorkerRequest,
        transfer: Transferable[],
        timeoutMs: number
    ): Promise<EdgeWorkerReply | null> {
        const requestId = request.RequestId;
        return new Promise<EdgeWorkerReply | null>((resolve) => {
            const timer = setTimeout(() => {
                this.pending.delete(requestId);
                resolve(null);
            }, Math.max(1, timeoutMs));

            this.pending.set(requestId, {
                Timer: timer,
                Resolve: (reply) => resolve(reply),
            });

            try {
                port.Post(request, transfer);
            } catch (err: unknown) {
                this.pending.delete(requestId);
                clearTimeout(timer);
                resolve({
                    Type: 'error',
                    RequestId: requestId,
                    Message: err instanceof Error ? err.message : String(err),
                });
            }
        });
    }

    private recordFailure(): void {
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= EDGE_WORKER_CIRCUIT_FAILURE_THRESHOLD) {
            this.circuitOpenUntil = Date.now() + EDGE_WORKER_CIRCUIT_COOLDOWN_MS;
        }
    }

    private nextRequestId(prefix: string): string {
        return `${prefix}-${this.nextRequestSeq++}`;
    }
}
