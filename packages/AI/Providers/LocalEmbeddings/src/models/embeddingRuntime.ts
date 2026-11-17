import { availableParallelism } from 'node:os';
import { ErrorAnalyzer } from '@memberjunction/ai';
import type { PreTrainedModel, PreTrainedTokenizer, PretrainedConfig, Tensor } from '@huggingface/transformers';
import type { EmbeddingSettings } from '../worker/EmbeddingWorkerProtocol.js';
import { IsTruthyEnvValue } from '../worker/WorkerThreadHost.js';

/**
 * The model side of local embeddings: loading @huggingface/transformers, caching one tokenizer +
 * ONNX model per model ID, and running batched inference. It has no MemberJunction class
 * registrations, so the same code runs on the worker thread that {@link EmbeddingWorkerHost} owns
 * and, when no worker is available, in-process.
 *
 * Inference is CPU-bound and synchronous native code: a batch blocks the thread it runs on for
 * seconds (MJ #5510). Run it on the worker whenever one is available.
 *
 * The model is driven directly (tokenizer + `AutoModel` + mean pooling) instead of through the
 * `feature-extraction` pipeline, because the pipeline cannot do what local embedding needs:
 * transformers.js v4 ignores the pipeline's `quantized` option and loads fp32; it embeds one text
 * per call; and it cannot load only the text half of a multimodal model or truncate to a caller's
 * token limit. PR #6606 moved to the pipeline and lost all of these (MJ #6689).
 */

type TransformersModule = typeof import('@huggingface/transformers');

/** A loaded model: its tokenizer and ONNX model, shared by every call for that model ID. */
interface LoadedModel {
  tokenizer: PreTrainedTokenizer;
  model: PreTrainedModel;
  /** Calls running on `model` right now; its sessions may be released only when this is 0. */
  activeCalls: number;
  /** Set by a clear that is waiting for the last active call to finish, so it can release the model. */
  onIdle: (() => void) | null;
}

/** The part of a feature-extraction model's output this driver reads. */
interface ModelOutput {
  last_hidden_state: Tensor;
}

/** Vectors for a set of texts and the tokens the model actually consumed to produce them. */
export interface EmbeddedTexts {
  /** One normalized vector per text, in input order. Each owns its buffer so a worker can transfer it. */
  Vectors: Float32Array[];
  /** Real token count (padding excluded), for usage accounting. */
  Tokens: number;
}

/**
 * Whether verbose logging is enabled, mirroring the MJ_VERBOSE semantics used by
 * @memberjunction/core's IsVerboseLoggingEnabled(). Duplicated here as a tiny inline
 * check so this leaf AI provider doesn't take a dependency on @memberjunction/core
 * just to gate a couple of routine status messages. Routine load/progress messages
 * are suppressed by default so they don't garble CodeGen's spinner; errors/warnings
 * still print unconditionally.
 */
function isVerbose(): boolean {
  const v = process.env.MJ_VERBOSE;
  return v !== undefined && ['true', '1', 'yes'].includes(v.toLowerCase());
}

/**
 * Most texts per ONNX call. One call per batch is ~6x faster than one call per text. The `Xenova/*`
 * models are dynamically quantized, so a vector depends slightly on its batch-mates (cosine >= 0.998
 * to the same text embedded alone); EmbeddingGemma 2 is unaffected.
 */
const BATCH_SIZE = 32;

/**
 * Most padded tokens per ONNX call (texts x the longest one). A batch is padded to its longest text,
 * so memory grows with both; this keeps 32 texts at 256 tokens in one call, while 8k-token documents
 * go one at a time. A text longer than the budget still goes, alone.
 */
const BATCH_TOKENS = 8192;

/**
 * ONNX precision. `q8` loads `onnx/model_quantized.onnx`, the same file `@xenova/transformers`'
 * `quantized: true` loaded, and is lossless for EmbeddingGemma 2 (cosine 0.99996 to fp32).
 */
const DTYPE = 'q8';

// Retry configuration for model downloads
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_INITIAL_DELAY_MS = 2000;
const DEFAULT_MAX_DELAY_MS = 30000;

let transformersLoading: Promise<TransformersModule> | null = null;
let loadedTransformers: TransformersModule | null = null;
const pendingSettings: EmbeddingSettings = {};
const models = new Map<string, Promise<LoadedModel>>();

/**
 * Set to `true`, `1` or `yes` to keep ONNX Runtime's CPU memory arena on. Opt in only on a
 * dedicated inference host that wants the ~4% speed-up and can spare the memory.
 */
export const LOCAL_EMBEDDINGS_CPU_ARENA_ENV = 'MJ_LOCAL_EMBEDDINGS_CPU_ARENA';

/**
 * Records settings to apply to transformers.js. Applied immediately when it is already loaded,
 * otherwise when it loads.
 */
export function ApplyEmbeddingSettings(settings: EmbeddingSettings): void {
  if (settings.CacheDir) {
    pendingSettings.CacheDir = settings.CacheDir;
  }
  if (settings.LocalURL) {
    pendingSettings.LocalURL = settings.LocalURL;
  }
  if (loadedTransformers) {
    configureEnv(loadedTransformers.env);
  }
}

/** The settings recorded so far, to hand to a worker thread. */
export function CurrentEmbeddingSettings(): EmbeddingSettings {
  return { ...pendingSettings };
}

/**
 * Embeds texts with mean pooling and L2 normalization, the same computation as the transformers.js
 * `feature-extraction` pipeline. The runtime tokenizes itself so it can truncate to
 * `maxInputTokens`: the pipeline only truncates to the tokenizer's own limit, and some tokenizers
 * declare none (EmbeddingGemma 2's reads as 1e30, past its 8,192-token window).
 */
export async function EmbedTextsWithModel(modelName: string, texts: string[], maxInputTokens?: number): Promise<EmbeddedTexts> {
  if (texts.length === 0) {
    return { Vectors: [], Tokens: 0 };
  }
  return withModel(modelName, (loaded) => embedBatches(loaded, texts, maxInputTokens));
}

/**
 * Runs `work` on a model and counts it as an active call, so a clear that arrives mid-call defers
 * releasing the model's ONNX sessions until `work` is done (a released session fails the call).
 */
async function withModel<T>(modelName: string, work: (loaded: LoadedModel) => Promise<T>): Promise<T> {
  const loaded = await getModel(modelName);
  loaded.activeCalls++;
  try {
    return await work(loaded);
  } finally {
    loaded.activeCalls--;
    if (loaded.activeCalls === 0) {
      loaded.onIdle?.();
    }
  }
}

async function embedBatches({ tokenizer, model }: LoadedModel, texts: string[], maxInputTokens?: number): Promise<EmbeddedTexts> {
  const { mean_pooling } = await loadTransformers();
  const vectors: Float32Array[] = [];
  let tokens = 0;

  const lengths = texts.map((t) => Math.min(tokenizer.encode(t).length, maxInputTokens ?? Infinity));
  for (let start = 0, end = 0; start < texts.length; start = end) {
    end = batchEnd(lengths, start);
    const inputs = tokenizer(texts.slice(start, end), { padding: true, truncation: true, max_length: maxInputTokens });
    const output: ModelOutput = await model(inputs);
    const pooled = mean_pooling(output.last_hidden_state, inputs.attention_mask).normalize(2, -1);
    for (const row of pooled.tolist() as number[][]) {
      vectors.push(Float32Array.from(row));
    }
    tokens += Number(inputs.attention_mask.sum().item());
  }
  return { Vectors: vectors, Tokens: tokens };
}

/** The exclusive end of the batch that starts at `start`: at most BATCH_SIZE texts and BATCH_TOKENS padded tokens. */
function batchEnd(lengths: number[], start: number): number {
  let longest = lengths[start];
  let end = start + 1;
  for (; end < lengths.length && end - start < BATCH_SIZE; end++) {
    const next = Math.max(longest, lengths[end]);
    if (next * (end - start + 1) > BATCH_TOKENS) break;
    longest = next;
  }
  return end;
}

/** Loads a model so the first embedding call doesn't pay for it. */
export async function PreloadEmbeddingModel(modelName: string): Promise<void> {
  await getModel(modelName);
}

/**
 * Drops every loaded model and releases its ONNX sessions, which is what frees the native memory:
 * forgetting the JS object alone leaves the session (weights and arena) alive until a GC that may
 * never run it. A load still in flight is released when it finishes; its cache entry is already
 * gone, so no call can reuse it. A model with calls running is released when the last one finishes.
 * Rejects, naming the model IDs, when a release fails; the cache is
 * emptied either way.
 */
export async function ClearEmbeddingPipelines(): Promise<void> {
  const dropped = Array.from(models.entries());
  models.clear();
  const outcomes = await Promise.all(dropped.map(([modelId, loading]) => releaseModel(modelId, loading)));
  const failures = outcomes.filter((failure): failure is string => failure !== null);
  if (failures.length > 0) {
    throw new Error(`Failed to release local embedding models: ${failures.join('; ')}`);
  }
}

/** Releases one model's sessions once its load settles; returns a failure description, or null on success. */
async function releaseModel(modelId: string, loading: Promise<LoadedModel>): Promise<string | null> {
  let loaded: LoadedModel;
  try {
    loaded = await loading;
  } catch {
    // The load failed, so there is nothing to release; the callers that awaited it saw the error.
    return null;
  }
  if (loaded.activeCalls > 0) {
    // The model is already out of the cache, so no new call can start on it; wait for the running ones.
    await new Promise<void>((resolve) => { loaded.onIdle = resolve; });
  }
  try {
    await loaded.model.dispose();
    return null;
  } catch (error) {
    console.error(`Releasing embedding model ${modelId} failed:`, error);
    return `${modelId}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff (initialDelay * 2^attempt) with ±25% jitter, capped at maxDelay. */
function calculateBackoffDelay(attempt: number, initialDelay: number, maxDelay: number): number {
  const exponentialDelay = initialDelay * Math.pow(2, attempt);
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.min(exponentialDelay + jitter, maxDelay);
}

function configureEnv(env: TransformersModule['env']): void {
  env.allowLocalModels = true;
  // Note: localURL might not be available in all versions of transformers.js
  if ('localURL' in env) {
    env.localURL = pendingSettings.LocalURL || process.env.TRANSFORMERS_LOCAL_URL || '';
  }
  env.cacheDir = pendingSettings.CacheDir || process.env.TRANSFORMERS_CACHE_DIR || './.cache/transformers';
}

/**
 * Loads @huggingface/transformers once. This is a deferred import (category 3 in
 * `.claude/rules/typescript-style.md`): importing it costs ~80-150 ms and ~50 MB RSS (native
 * onnxruntime and sharp), and every process that loads the server class manifest imports this
 * module, whether or not it ever embeds locally. The package is still a declared dependency.
 * Concurrent callers share one load.
 */
function loadTransformers(): Promise<TransformersModule> {
  transformersLoading ??= import('@huggingface/transformers').then((mod) => {
    configureEnv(mod.env);
    loadedTransformers = mod;
    return mod;
  });
  return transformersLoading;
}

/**
 * Drops the vision and audio encoder configs of a multimodal model (e.g. EmbeddingGemma 2) so only
 * the text session loads: 314 MB of text weights at q8 instead of 850 MB. A text-only config has no
 * such keys and is returned unchanged.
 */
function textOnly(config: PretrainedConfig): PretrainedConfig {
  const encoders = config as PretrainedConfig & { vision_config?: object | null; audio_config?: object | null };
  if (encoders.vision_config) encoders.vision_config = null;
  if (encoders.audio_config) encoders.audio_config = null;
  return config;
}

/**
 * ONNX Runtime session options, read at each model load.
 *
 * Threads: ONNX Runtime sizes its thread pool from the host's cores and ignores a container's CPU
 * limit; with 2 CPUs on an 18-core host that made EmbeddingGemma 2 queries 1.3 s instead of 0.1 s.
 * availableParallelism() honors cpusets and CPU quotas.
 *
 * Arena: ONNX Runtime's CPU arena and memory pattern keep every buffer they ever grew to for the
 * life of the session, so a sync's long inputs left the process holding the peak. Measured on Linux
 * arm64 with 4 CPUs, replaying the nightly sync's calls: arena on peaks and holds 1245 MB;
 * arena off peaks at 433 MB and holds it, for ~4% more time (68 s to 71 s per pass). MJ #6689.
 * Off by default; MJ_LOCAL_EMBEDDINGS_CPU_ARENA=true opts back in.
 */
function sessionOptions(): { intraOpNumThreads: number; enableCpuMemArena?: false; enableMemPattern?: false } {
  const threads = { intraOpNumThreads: availableParallelism() };
  if (IsTruthyEnvValue(process.env[LOCAL_EMBEDDINGS_CPU_ARENA_ENV])) {
    return threads;
  }
  return { ...threads, enableCpuMemArena: false, enableMemPattern: false };
}

/**
 * Gets or starts loading the model for a Hugging Face model ID (e.g. 'Xenova/gte-small').
 * Concurrent callers share one load; a failed load is forgotten so the next call retries.
 */
function getModel(modelName: string): Promise<LoadedModel> {
  let loading = models.get(modelName);
  if (!loading) {
    const pending = loadModel(modelName);
    loading = pending;
    models.set(modelName, pending);
    // The callers of `pending` see the rejection; this only forgets the failed entry, and only if a
    // ClearEmbeddingPipelines() + newer load has not already replaced it.
    pending.catch(() => {
      if (models.get(modelName) === pending) {
        models.delete(modelName);
      }
    });
  }
  return loading;
}

/**
 * Loads a model with retries. Exponential backoff handles transient network failures when
 * downloading models from the Hugging Face Hub on first startup.
 */
async function loadModel(modelId: string): Promise<LoadedModel> {
  const { AutoConfig, AutoModel, AutoTokenizer } = await loadTransformers();
  let lastError: unknown = null;
  for (let attempt = 0; attempt < DEFAULT_MAX_RETRIES; attempt++) {
    try {
      if (attempt === 0) {
        if (isVerbose()) {
          console.log(`Loading embedding model ${modelId} from HuggingFace (first-time download may take a moment)...`);
        }
      } else {
        console.log(`  Retrying download (attempt ${attempt + 1}/${DEFAULT_MAX_RETRIES})...`);
        await delay(calculateBackoffDelay(attempt - 1, DEFAULT_INITIAL_DELAY_MS, DEFAULT_MAX_DELAY_MS));
      }
      const config = textOnly(await AutoConfig.from_pretrained(modelId));
      const [tokenizer, model] = await Promise.all([
        AutoTokenizer.from_pretrained(modelId),
        AutoModel.from_pretrained(modelId, { config, dtype: DTYPE, device: 'cpu', session_options: sessionOptions() }),
      ]);
      if (attempt > 0) {
        // Recovered after a retry — worth surfacing regardless of verbosity
        console.log(`Successfully loaded model ${modelId} on attempt ${attempt + 1}`);
      } else if (isVerbose()) {
        console.log(`Model ${modelId} loaded successfully`);
      }
      return { tokenizer, model, activeCalls: 0, onIdle: null };
    } catch (error) {
      lastError = error;
      if (IsTransientNetworkError(error) && attempt < DEFAULT_MAX_RETRIES - 1) {
        console.warn(`  Connection issue: ${GetBriefErrorReason(error)}`);
      } else {
        console.error(`Failed to load model ${modelId} after ${attempt + 1} attempt(s):`, ErrorAnalyzer.analyzeError(error, 'LocalEmbedding'));
        break;
      }
    }
  }
  const errorInfo = ErrorAnalyzer.analyzeError(lastError, 'LocalEmbedding');
  const errorMessage = typeof errorInfo === 'string' ? errorInfo : (errorInfo as { message?: string }).message || 'Unknown error';
  throw new Error(`Failed to load local embedding model ${modelId}: ${errorMessage}`);
}

/** True for a network error worth retrying a model download for. */
export function IsTransientNetworkError(error: unknown): boolean {
  if (!error) return false;
  const errorObj = error as { cause?: { code?: string }; code?: string; message?: string };
  const transientCodes = [
    'UND_ERR_CONNECT_TIMEOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'EPIPE',
    'EHOSTUNREACH',
    'ENETUNREACH',
  ];
  const errorCode = errorObj.cause?.code || errorObj.code;
  if (errorCode && transientCodes.includes(errorCode)) {
    return true;
  }
  const errorMessage = errorObj.message?.toLowerCase() || '';
  const transientKeywords = ['timeout', 'network', 'connection', 'fetch failed', 'socket hang up'];
  return transientKeywords.some((keyword) => errorMessage.includes(keyword));
}

/** A brief, user-friendly description of a download error for retry logging. */
export function GetBriefErrorReason(error: unknown): string {
  if (!error) return 'unknown error';
  const errorObj = error as { cause?: { code?: string; message?: string }; code?: string; message?: string };
  const errorCode = errorObj.cause?.code || errorObj.code;
  const codeMessages: Record<string, string> = {
    UND_ERR_CONNECT_TIMEOUT: 'connection timeout',
    ECONNRESET: 'connection reset',
    ECONNREFUSED: 'connection refused',
    ETIMEDOUT: 'request timeout',
    ENOTFOUND: 'host not found',
    EAI_AGAIN: 'DNS lookup timeout',
    EHOSTUNREACH: 'host unreachable',
    ENETUNREACH: 'network unreachable',
  };
  if (errorCode && codeMessages[errorCode]) {
    return codeMessages[errorCode];
  }
  if (errorObj.message) {
    return errorObj.message.substring(0, 50);
  }
  return 'network error';
}
