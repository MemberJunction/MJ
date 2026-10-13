import { ErrorAnalyzer } from '@memberjunction/ai';
import type { EmbeddingSettings } from '../worker/EmbeddingWorkerProtocol';

/**
 * The model side of local embeddings: loading @xenova/transformers, caching one pipeline per
 * model, and running inference. It has no MemberJunction class registrations, so the same code
 * runs on the worker thread that {@link EmbeddingWorkerHost} owns and, when no worker is
 * available, in-process.
 *
 * Inference is CPU-bound and, with onnxruntime-node 1.14, synchronous native code: a batch blocks
 * the thread it runs on for seconds (MJ #5510). Run it on the worker whenever one is available.
 */

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

// TypeScript types for @xenova/transformers (since we can't import them directly)
interface TransformersEnv {
  allowLocalModels: boolean;
  cacheDir: string;
  localURL?: string;
}

interface FeatureExtractionOutput {
  data: Float32Array;
}

type FeatureExtractionPipeline = (text: string, options: { pooling: 'mean'; normalize: boolean }) => Promise<FeatureExtractionOutput>;

interface TransformersModule {
  pipeline: (task: string, model: string, options?: Record<string, unknown>) => Promise<FeatureExtractionPipeline>;
  env: TransformersEnv;
}

let transformers: TransformersModule | null = null;
let transformersLoadingPromise: Promise<TransformersModule> | null = null;
const pendingSettings: EmbeddingSettings = {};
const pipelines = new Map<string, FeatureExtractionPipeline>();
const loadingPipelines = new Map<string, Promise<FeatureExtractionPipeline>>();

// Retry configuration for model downloads
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_INITIAL_DELAY_MS = 2000;
const DEFAULT_MAX_DELAY_MS = 30000;

/** Texts embedded together per batch. */
const BATCH_SIZE = 32;

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
  if (transformers) {
    configureEnv(transformers.env);
  }
}

/** The settings recorded so far, to hand to a worker thread. */
export function CurrentEmbeddingSettings(): EmbeddingSettings {
  return { ...pendingSettings };
}

/**
 * Embeds each text with the model's mean-pooled, normalized output. Each vector owns its buffer,
 * so a worker can transfer it to the main thread without copying.
 */
export async function EmbedTextsWithModel(modelName: string, texts: string[]): Promise<Float32Array[]> {
  const pipe = await getPipeline(modelName);
  const vectors: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const outputs = await Promise.all(batch.map((text) => pipe(text, { pooling: 'mean', normalize: true })));
    for (const output of outputs) {
      vectors.push(new Float32Array(output.data));
    }
  }
  return vectors;
}

/** Loads a model so the first embedding call doesn't pay for it. */
export async function PreloadEmbeddingModel(modelName: string): Promise<void> {
  await getPipeline(modelName);
}

/** Drops every loaded pipeline to free memory. */
export function ClearEmbeddingPipelines(): void {
  pipelines.clear();
  loadingPipelines.clear();
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

function configureEnv(env: TransformersEnv): void {
  env.allowLocalModels = true;
  // Note: localURL might not be available in all versions of transformers.js
  if ('localURL' in env) {
    env.localURL = pendingSettings.LocalURL || process.env.TRANSFORMERS_LOCAL_URL || '';
  }
  env.cacheDir = pendingSettings.CacheDir || process.env.TRANSFORMERS_CACHE_DIR || './.cache/transformers';
}

/**
 * Loads the @xenova/transformers ESM module once. Concurrent callers share one load, so parallel
 * embedding requests during startup don't import it several times.
 */
async function loadTransformers(): Promise<TransformersModule> {
  if (transformers) {
    return transformers;
  }
  if (!transformersLoadingPromise) {
    transformersLoadingPromise = (async () => {
      // Dynamic import for the ESM-only package, kept out of the TypeScript module graph.
      const mod = await (eval('import("@xenova/transformers")') as Promise<TransformersModule>);
      configureEnv(mod.env);
      transformers = mod;
      return mod;
    })();
  }
  return transformersLoadingPromise;
}

/** Gets or creates the pipeline for a model (a Hugging Face model ID, e.g. 'Xenova/gte-small'). */
async function getPipeline(modelName: string): Promise<FeatureExtractionPipeline> {
  const mod = await loadTransformers();
  const existing = pipelines.get(modelName);
  if (existing) {
    return existing;
  }
  const loading = loadingPipelines.get(modelName);
  if (loading) {
    return loading;
  }
  const loadingPromise = loadPipeline(mod, modelName);
  loadingPipelines.set(modelName, loadingPromise);
  try {
    const pipe = await loadingPromise;
    pipelines.set(modelName, pipe);
    return pipe;
  } finally {
    loadingPipelines.delete(modelName);
  }
}

/**
 * Loads a pipeline with retries. Exponential backoff handles transient network failures when
 * downloading models from the Hugging Face Hub on first startup.
 */
async function loadPipeline(mod: TransformersModule, modelId: string): Promise<FeatureExtractionPipeline> {
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
      const pipe = await mod.pipeline('feature-extraction', modelId, { quantized: true });
      if (attempt > 0) {
        // Recovered after a retry — worth surfacing regardless of verbosity
        console.log(`Successfully loaded model ${modelId} on attempt ${attempt + 1}`);
      } else if (isVerbose()) {
        console.log(`Model ${modelId} loaded successfully`);
      }
      return pipe;
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
