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
 * Gemini Embedding 2 provider for MemberJunction.
 *
 * A `BaseEmbeddings` implementation backed by Google's `gemini-embedding-2` — a natively
 * MULTIMODAL embedding model (text, image, video, audio, and documents share one vector space).
 * Overrides {@link BaseEmbeddings.EmbedContent} (text-only by default) to embed text and/or
 * interleaved media (image/video/audio/document) into the SAME vector space as text —
 * enabling cross-modal retrieval (a text query matching an image, audio, or video).

 *
 * Resolved via `ClassFactory.CreateInstance(BaseEmbeddings, "GeminiEmbedding2", apiKey)`.
 *
 * Note: `gemini-embedding-2` has no `task_type` parameter — the retrieval instruction (e.g.
 * `"task: search result | query: …"` for queries vs `"title: … | text: …"` for documents) is
 * carried IN the text by the caller.
 */

const DEFAULT_MODEL = 'gemini-embedding-2';

@RegisterClass(BaseEmbeddings, 'GeminiEmbedding2')
export class GeminiEmbedding2 extends BaseEmbeddings {
    private _gemini: GoogleGenAI;

    constructor(apiKey: string) {
        super(apiKey);
        this._gemini = new GoogleGenAI({ apiKey });
    }

    public get GeminiClient(): GoogleGenAI {
        return this._gemini;
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

    public async EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult> {
        const model = params.model || DEFAULT_MODEL;
        try {
            const response = await this._gemini.models.embedContent({ model, contents: params.texts });
            return {
                object: 'list',
                model,
                ModelUsage: new ModelUsage(0, 0),
                vectors: (response.embeddings ?? []).map((e) => e.values ?? []),
            };
        } catch (error) {
            console.error('Gemini embedding error:', ErrorAnalyzer.analyzeError(error, 'Gemini'));
            return { object: 'list', model, ModelUsage: new ModelUsage(0, 0), vectors: [] };
        }
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

/** Describes an embedding model returned by {@link GeminiEmbedding2.GetEmbeddingModels}. */
export interface EmbeddingModelInfo {
    Model: string;
    Description: string;
    OutputDimension: number;
}
