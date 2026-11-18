/// <reference lib="webworker" />
/**
 * @fileoverview Dedicated lazy Web Worker running quantized (`q8`) ONNX inference in WASM
 * (`Xenova/bge-small-en-v1.5` bi-encoder + `Xenova/ms-marco-MiniLM-L-6-v2` cross-encoder).
 *
 * Loaded ONLY on demand via `new Worker(new URL('./edge-ai.worker.js', import.meta.url), { type: 'module' })`
 * so zero `@huggingface/transformers` or ONNX WASM code enters Explorer's initial bundle.
 */

import {
    EDGE_PRE_DISCOVERY_BI_ENCODER_MODEL,
    EDGE_PRE_DISCOVERY_CROSS_ENCODER_MODEL,
} from '@memberjunction/ai-core-plus';
import type {
    EdgeWorkerDevice,
    EdgeWorkerDType,
    EdgeWorkerReply,
    EdgeWorkerRequest,
} from './edge-ai-protocol';

// Non-exported internal shapes for 3rd-party @huggingface/transformers module API
// (kept unexported to satisfy MJ naming-conventions standard).
interface TensorOutput {
    data: Float32Array;
    dims: number[];
}

type FeatureExtractorFn = (
    texts: string[],
    options: { pooling: 'mean'; normalize: boolean }
) => Promise<TensorOutput>;

type TokenizerFn = (
    queries: string[],
    options: { text_pair: string[]; padding: boolean; truncation: boolean }
) => Record<string, unknown>;

type SequenceClassifierFn = (
    inputs: Record<string, unknown>
) => Promise<{ logits: TensorOutput }>;

interface TransformersEnv {
    allowLocalModels: boolean;
    allowRemoteModels: boolean;
    localModelPath?: string;
    backends?: {
        onnx?: {
            wasm?: {
                wasmPaths?: string;
            };
        };
    };
}

interface TransformersModule {
    env: TransformersEnv;
    pipeline: (
        task: 'feature-extraction',
        model: string,
        options: { device: EdgeWorkerDevice; dtype: EdgeWorkerDType }
    ) => Promise<FeatureExtractorFn>;
    AutoTokenizer: {
        from_pretrained: (model: string) => Promise<TokenizerFn>;
    };
    AutoModelForSequenceClassification: {
        from_pretrained: (
            model: string,
            options: { device: EdgeWorkerDevice; dtype: EdgeWorkerDType }
        ) => Promise<SequenceClassifierFn>;
    };
}

let transformersPromise: Promise<TransformersModule> | null = null;
let biEncoderPromise: Promise<FeatureExtractorFn> | null = null;
let biEncoderKey = '';
let crossEncoderPromise: Promise<{ Tokenizer: TokenizerFn; Model: SequenceClassifierFn }> | null = null;
let crossEncoderKey = '';

function loadTransformers(): Promise<TransformersModule> {
    if (!transformersPromise) {
        // Dynamic import, category 3 (genuine bundle-size deferral, Rule 8) + category 2 (optionalDependency):
        // '@huggingface/transformers' and ONNX WASM runtime load strictly inside this lazy Web Worker
        // so Explorer's initial and app-module bundles incur 0 B overhead.
        transformersPromise = (import('@huggingface/transformers') as unknown as Promise<TransformersModule>).catch(
            (err: unknown) => {
                transformersPromise = null;
                throw err;
            }
        );
    }
    return transformersPromise;
}

async function ensureBiEncoder(
    modelId: string,
    device: EdgeWorkerDevice,
    dtype: EdgeWorkerDType
): Promise<FeatureExtractorFn> {
    const key = `${modelId}|${device}|${dtype}`;
    if (!biEncoderPromise || biEncoderKey !== key) {
        biEncoderKey = key;
        biEncoderPromise = (async () => {
            const tf = await loadTransformers();
            return tf.pipeline('feature-extraction', modelId, { device, dtype });
        })().catch((err: unknown) => {
            if (biEncoderKey === key) {
                biEncoderPromise = null;
                biEncoderKey = '';
            }
            throw err;
        });
    }
    return biEncoderPromise;
}

async function ensureCrossEncoder(
    modelId: string,
    device: EdgeWorkerDevice,
    dtype: EdgeWorkerDType
): Promise<{ Tokenizer: TokenizerFn; Model: SequenceClassifierFn }> {
    const key = `${modelId}|${device}|${dtype}`;
    if (!crossEncoderPromise || crossEncoderKey !== key) {
        crossEncoderKey = key;
        crossEncoderPromise = (async () => {
            const tf = await loadTransformers();
            const [tok, mod] = await Promise.all([
                tf.AutoTokenizer.from_pretrained(modelId),
                tf.AutoModelForSequenceClassification.from_pretrained(modelId, { device, dtype }),
            ]);
            return { Tokenizer: tok, Model: mod };
        })().catch((err: unknown) => {
            if (crossEncoderKey === key) {
                crossEncoderPromise = null;
                crossEncoderKey = '';
            }
            throw err;
        });
    }
    return crossEncoderPromise;
}

function postReply(reply: EdgeWorkerReply, transfer: Transferable[] = []): void {
    self.postMessage(reply, transfer);
}

async function handleMessage(msg: EdgeWorkerRequest): Promise<void> {
    const t0 = performance.now();
    try {
        switch (msg.Type) {
            case 'init': {
                const tf = await loadTransformers();
                tf.env.allowLocalModels = Boolean(msg.LocalModelPath);
                tf.env.allowRemoteModels = msg.AllowRemoteModels ?? true;
                if (msg.LocalModelPath) {
                    tf.env.localModelPath = msg.LocalModelPath;
                }
                if (msg.WasmPaths && tf.env.backends?.onnx?.wasm) {
                    tf.env.backends.onnx.wasm.wasmPaths = msg.WasmPaths;
                }
                const device: EdgeWorkerDevice = msg.Device ?? 'wasm';
                const dtype: EdgeWorkerDType = msg.DType ?? 'q8';
                const biModel = msg.BiEncoderModelId ?? EDGE_PRE_DISCOVERY_BI_ENCODER_MODEL;
                await ensureBiEncoder(biModel, device, dtype);
                let crossLoaded = false;
                if (msg.LoadCrossEncoder) {
                    const crossModel = msg.CrossEncoderModelId ?? EDGE_PRE_DISCOVERY_CROSS_ENCODER_MODEL;
                    await ensureCrossEncoder(crossModel, device, dtype);
                    crossLoaded = true;
                }
                postReply({
                    Type: 'ready',
                    RequestId: msg.RequestId,
                    BiEncoderModelId: biModel,
                    CrossEncoderLoaded: crossLoaded,
                    LoadMs: performance.now() - t0,
                });
                break;
            }
            case 'embed': {
                if (msg.Texts.length === 0) {
                    postReply({
                        Type: 'embedded',
                        RequestId: msg.RequestId,
                        Vectors: [],
                        Dimensions: 0,
                        DurationMs: 0,
                    });
                    return;
                }
                const ext = await ensureBiEncoder(
                    msg.ModelId ?? EDGE_PRE_DISCOVERY_BI_ENCODER_MODEL,
                    msg.Device ?? 'wasm',
                    msg.DType ?? 'q8'
                );
                const out = await ext(msg.Texts, { pooling: 'mean', normalize: true });
                const dims = out.dims[1] ?? Math.floor(out.data.length / msg.Texts.length);
                const buffers: ArrayBuffer[] = [];
                for (let i = 0; i < msg.Texts.length; i++) {
                    const slice = out.data.slice(i * dims, (i + 1) * dims);
                    const copy = new Float32Array(slice.length);
                    copy.set(slice);
                    buffers.push(copy.buffer);
                }
                postReply(
                    {
                        Type: 'embedded',
                        RequestId: msg.RequestId,
                        Vectors: buffers,
                        Dimensions: dims,
                        DurationMs: performance.now() - t0,
                    },
                    buffers
                );
                break;
            }
            case 'rerank': {
                if (msg.Documents.length === 0) {
                    postReply({
                        Type: 'reranked',
                        RequestId: msg.RequestId,
                        Logits: [],
                        DurationMs: 0,
                    });
                    return;
                }
                const { Tokenizer, Model } = await ensureCrossEncoder(
                    msg.ModelId ?? EDGE_PRE_DISCOVERY_CROSS_ENCODER_MODEL,
                    msg.Device ?? 'wasm',
                    msg.DType ?? 'q8'
                );
                const queries = new Array<string>(msg.Documents.length).fill(msg.Query);
                const inputs = Tokenizer(queries, {
                    text_pair: msg.Documents,
                    padding: true,
                    truncation: true,
                });
                const out = await Model(inputs);
                const numLabels = out.logits.dims[1] ?? 1;
                const logits: number[] = [];
                for (let i = 0; i < msg.Documents.length; i++) {
                    const idx = numLabels === 1 ? i : i * numLabels + (numLabels - 1);
                    logits.push(Number(out.logits.data[idx] ?? Number.NEGATIVE_INFINITY));
                }
                postReply({
                    Type: 'reranked',
                    RequestId: msg.RequestId,
                    Logits: logits,
                    DurationMs: performance.now() - t0,
                });
                break;
            }
            case 'dispose': {
                biEncoderPromise = null;
                biEncoderKey = '';
                crossEncoderPromise = null;
                crossEncoderKey = '';
                postReply({
                    Type: 'disposed',
                    RequestId: msg.RequestId,
                });
                break;
            }
        }
    } catch (err: unknown) {
        postReply({
            Type: 'error',
            RequestId: 'RequestId' in msg ? msg.RequestId : undefined,
            Message: err instanceof Error ? err.message : String(err),
        });
    }
}

let isBootstrapped = false;

/**
 * Attaches the Edge AI message handler inside a Web Worker global scope.
 * Exported so host apps (e.g., MJExplorer) with `sideEffects: false` retain the worker bundle cleanly.
 */
export function BootstrapEdgeAIWorker(): void {
    if (isBootstrapped) {
        return;
    }
    isBootstrapped = true;
    self.onmessage = (event: MessageEvent<EdgeWorkerRequest>) => {
        void handleMessage(event.data);
    };
}

if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
    BootstrapEdgeAIWorker();
}
