import {
    BaseEmbeddings,
    EmbedTextParams,
    EmbedTextsParams,
    EmbedTextResult,
    EmbedTextsResult,
    ModelUsage,
    ErrorAnalyzer,
    EmbedContentParams,
    EmbedContentResult,
    FileCapabilities,
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { GoogleGenAI, Content } from '@google/genai';
import { GeminiLLM } from '.';

/**
 * Gemini embedding provider for MemberJunction.
 *
 * A `BaseEmbeddings` implementation backed by Google's `gemini-embedding-2` — a natively
 * MULTIMODAL embedding model (text, image, video, audio, and documents share one vector space).
 * Overrides {@link BaseEmbeddings.EmbedContent} (text-only by default) to embed text and/or
 * interleaved media (image/video/audio/document) into the SAME vector space as text —
 * enabling cross-modal retrieval (a text query matching an image, audio, or video).

 *
 * Resolved via `ClassFactory.CreateInstance(BaseEmbeddings, "GeminiEmbedding", apiKey)`.
 *
 * Note: `gemini-embedding-2` has no `task_type` parameter — the retrieval instruction (e.g.
 * `"task: search result | query: …"` for queries vs `"title: … | text: …"` for documents) is
 * carried IN the text by the caller.
 */

const DEFAULT_MODEL = 'gemini-embedding-2';
// The class name is deliberately model-agnostic (renamed from GeminiEmbedding2) — it outlives any single model version.

/**
 * Maximum number of in-flight `embedContent` requests issued by {@link GeminiEmbedding.EmbedTexts}.
 * `gemini-embedding-2` has no synchronous batch endpoint, so EmbedTexts fans out one request per
 * text; this bounds concurrency to stay under Gemini's embedding rate limits on large batches
 * while keeping throughput reasonable.
 */
const EMBED_TEXTS_MAX_CONCURRENCY = 4;

/** Sleep helper for exponential backoff between per-text embed retries. */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

@RegisterClass(BaseEmbeddings, 'GeminiEmbedding')
export class GeminiEmbedding extends BaseEmbeddings {
    private _gemini: GoogleGenAI;

    constructor(apiKey: string) {
        super(apiKey);
        this._gemini = new GoogleGenAI({ apiKey });
    }

    public get GeminiClient(): GoogleGenAI {
        return this._gemini;
    }

    /** Extra retry attempts per text on a transient failure, on top of the initial call. `0` disables retry. */
    protected get maxEmbedTextsRetries(): number {
        return 2;
    }

    /** Base delay (ms) for exponential backoff between per-text retries: delay = base * 2^(n-1). */
    protected get embedRetryBaseDelayMs(): number {
        return 250;
    }

    public override GetFileCapabilities(): FileCapabilities | null {
        // Per Google's gemini-embedding-2 model spec (GA 2026-04-22):
        //   images: png/jpeg/webp/bmp/heic/heif/avif (max 6 per request)
        //   video:  mpeg/mp4 (1 per request)   audio: mp3/wav (1 per request)   pdf (1 file, 6 pages)
        // 'audio/mpeg' is included as a tolerant alias for the canonical MP3 type (doc lists 'audio/mp3').
        // MaxFilesPerRequest reflects the image max (6); non-image modalities are capped at 1 by the API.
        return {
            SupportedMimeTypes: [
                'image/png',
                'image/jpeg',
                'image/webp',
                'image/bmp',
                'image/heic',
                'image/heif',
                'image/avif',
                'video/mpeg',
                'video/mp4',
                'audio/mp3',
                'audio/mpeg',
                'audio/wav',
                'application/pdf',
            ],
            MaxFileSize: 100 * 1024 * 1024, // Google docs state no hard per-file limit; generous cap
            MaxFilesPerRequest: 6,
            HasFileAPI: false,
        };
    }

    public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
        const model = params.model || DEFAULT_MODEL;
        try {
            const response = await this._gemini.models.embedContent({ model, contents: params.text });
            return {
                object: 'object',
                model,
                ModelUsage: new ModelUsage(0, 0),
                vector: response.embeddings?.[0]?.values ?? [],
            };
        } catch (error) {
            console.error('Gemini embedding error:', ErrorAnalyzer.analyzeError(error, 'Gemini'));
            return { object: 'object', model, ModelUsage: new ModelUsage(0, 0), vector: [] };
        }
    }

    /**
     * Embeds an array of texts, returning exactly ONE vector per input text, in input order.
     *
     * IMPORTANT: `gemini-embedding-2` is multimodal — passing the whole `texts` array as a single
     * `contents` value makes Gemini FUSE the texts into ONE blended vector (`response.embeddings`
     * has length 1). That silently corrupts any caller that pairs vectors to records by index
     * (e.g. `EntityVectorSyncer`). To guarantee a 1:1 mapping we issue a separate `embedContent`
     * call per text with bounded concurrency, then hard-assert the count before returning.
     *
     * Error contract is preserved from the original: on an API/embedding failure this returns an
     * empty `vectors` array (matching the prior behavior and the other MJ embedding providers), so
     * batch pipelines degrade gracefully instead of aborting. A SUCCESSFUL run is then hard-asserted
     * to be 1:1 with the inputs and throws on mismatch — so the batch-collapse bug can never again
     * silently return a short/blended array that downstream code mis-pairs by index.
     */
    public async EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult> {
        const model = params.model || DEFAULT_MODEL;
        const texts = params.texts ?? [];

        let vectors: number[][];
        try {
            vectors = await this.embedTextsConcurrently(texts, model, EMBED_TEXTS_MAX_CONCURRENCY);
        } catch (error) {
            // Preserve the original contract: empty result on failure (no throw), so existing
            // callers that don't wrap EmbedTexts keep degrading gracefully rather than aborting.
            console.error('Gemini embedding error:', ErrorAnalyzer.analyzeError(error, 'Gemini'));
            return { object: 'list', model, ModelUsage: new ModelUsage(0, 0), vectors: [] };
        }

        // Hard guard OUTSIDE the catch: a successful run with the wrong count IS the collapse bug —
        // fail loud here so it can never silently corrupt downstream vector storage again.
        if (vectors.length !== texts.length) {
            throw new Error(
                `GeminiEmbedding.EmbedTexts produced ${vectors.length} vector(s) for ${texts.length} ` +
                    `input text(s); expected a 1:1 match. Refusing to return a misaligned embedding batch.`,
            );
        }

        return {
            object: 'list',
            model,
            ModelUsage: new ModelUsage(0, 0),
            vectors,
        };
    }

    /**
     * Embeds each text with its own `embedContent` call while capping the number of concurrent
     * in-flight requests at `maxConcurrency`. Results are returned in the same order as `texts`.
     */
    private async embedTextsConcurrently(texts: string[], model: string, maxConcurrency: number): Promise<number[][]> {
        const vectors: number[][] = new Array<number[]>(texts.length);
        let nextIndex = 0;
        let failed = false;

        const worker = async (): Promise<void> => {
            // `nextIndex++` runs to completion between awaits (JS is single-threaded), so each
            // index is claimed by exactly one worker — no two workers embed the same text.
            // Stop claiming new texts once any worker has thrown, so we don't keep issuing (paid)
            // embedContent calls after the batch is already doomed to reject.
            for (let index = nextIndex++; !failed && index < texts.length; index = nextIndex++) {
                try {
                    vectors[index] = await this.embedSingleText(texts[index], model);
                } catch (error) {
                    failed = true;
                    throw error;
                }
            }
        };

        const workerCount = Math.min(maxConcurrency, texts.length);
        await Promise.all(Array.from({ length: workerCount }, () => worker()));
        return vectors;
    }

    /**
     * Embeds a single text and returns its vector, with bounded exponential-backoff retry so a lone
     * transient failure (a 429/500, or an empty/missing embedding) doesn't sink the whole batch —
     * its failure rate otherwise scales with the text count. Retries {@link maxEmbedTextsRetries}
     * times, then throws; {@link EmbedTexts} catches that to apply the batch-level empty-result
     * contract, so a batch never ends up with a silently-corrupt (empty or blended) vector for one text.
     */
    private async embedSingleText(text: string, model: string): Promise<number[]> {
        let lastError: unknown;
        for (let n = 0; n <= this.maxEmbedTextsRetries; n++) {
            if (n > 0) {
                await sleep(this.embedRetryBaseDelayMs * 2 ** (n - 1));
            }
            try {
                const response = await this._gemini.models.embedContent({ model, contents: text });
                const vector = response.embeddings?.[0]?.values;
                if (!vector || vector.length === 0) {
                    throw new Error('Gemini returned no embedding for one of the batch texts.');
                }
                return vector;
            } catch (error) {
                lastError = error;
                if (n >= this.maxEmbedTextsRetries) {
                    throw error; // out of retries — let EmbedTexts apply the empty-batch contract
                }
                // else: back off and retry
            }
        }
        // Unreachable: the loop always returns or throws. Present to satisfy the type checker.
        throw lastError instanceof Error ? lastError : new Error('Gemini embedding failed after retries.');
    }

    /**
     * Multimodal embed: text and/or interleaved media blocks (image/audio/video/document)
     * fused into ONE vector in the same space as text embeddings — enabling cross-modal
     * retrieval (a text query matching an image, audio, or video). Overrides the base
     * BaseEmbeddings.EmbedContent, which is text-only. Content blocks are mapped to Gemini
     * parts via GeminiLLM.MapMJContentToGeminiParts. Returns an empty vector on error,
     * consistent with the text methods.
     */
    public override async EmbedContent(params: EmbedContentParams): Promise<EmbedContentResult> {
        const model = params.model || DEFAULT_MODEL;
        try {
            this.ValidateContentSupported(params.content);
            const parts = GeminiLLM.MapMJContentToGeminiParts(params.content);
            const contents: Content[] = [{ parts }];
            const response = await this._gemini.models.embedContent({ model, contents });
            return {
                object: 'object',
                model,
                ModelUsage: new ModelUsage(0, 0),
                vector: response.embeddings?.[0]?.values ?? [],
            };
        } catch (error) {
            console.error('Gemini embedding (content) error:', ErrorAnalyzer.analyzeError(error, 'Gemini'));
            // design considerations: propagate error in addition to returning an empty vector or throw error from the get-go
            return {
                object: 'object',
                model,
                ModelUsage: new ModelUsage(0, 0),
                vector: [],
            };
        }
    }

    public async GetEmbeddingModels(): Promise<EmbeddingModelInfo[]> {
        return [
            {
                Model: DEFAULT_MODEL,
                Description: 'Natively multimodal embedding model (text, image, video, audio, documents)',
                OutputDimension: 3072,
            },
        ];
    }
}

/** Describes an embedding model returned by {@link GeminiEmbedding.GetEmbeddingModels}. */
export interface EmbeddingModelInfo {
    Model: string;
    Description: string;
    OutputDimension: number;
}
