import { RegisterClass } from '@memberjunction/global';
import {
    BaseEmbeddings,
    EmbedTextParams,
    EmbedTextResult,
    EmbedTextsParams,
    EmbedTextsResult,
    EmbedContentParams,
    EmbedContentResult,
    ModelUsage,
    ErrorAnalyzer,
    FileCapabilities,
    ChatMessageContent,
    ChatMessageContentBlock,
} from '@memberjunction/ai';
import { CohereClient, Cohere } from 'cohere-ai';

/** Cohere's latest, natively multimodal embedding model (text + images → one vector space). */
const DEFAULT_MODEL = 'embed-v4.0';
/** Cohere requires an input_type for v3+ models; default to the document-storage use case. */
const DEFAULT_INPUT_TYPE: Cohere.EmbedInputType = 'search_document';
/** embed-v4 default output dimensionality. */
const DEFAULT_DIMENSIONS = 1536;

/** Describes an embedding model returned by {@link CohereEmbedding.GetEmbeddingModels}. */
export interface CohereEmbeddingModelInfo {
    Model: string;
    Description: string;
    OutputDimension: number;
}

/**
 * Cohere embedding provider for MemberJunction, backed by Cohere `embed-v4.0` via the v2 embed API.
 *
 * Supports the text-only `BaseEmbeddings` contract (`EmbedText`/`EmbedTexts`) and overrides
 * `EmbedContent` for multimodal input (text + images fused into one vector). All three methods go
 * through `client.v2.embed`, which accepts either `texts` (text) or `inputs` (structured content
 * blocks for multimodal). Cohere's required `input_type` defaults to `search_document` and can be
 * overridden via `SetAdditionalSettings({ inputType: '...' })`.
 *
 * Resolved via `ClassFactory.CreateInstance(BaseEmbeddings, "CohereEmbedding", apiKey)`.
 */
@RegisterClass(BaseEmbeddings, 'CohereEmbedding')
export class CohereEmbedding extends BaseEmbeddings {
    private _client: CohereClient;

    constructor(apiKey: string) {
        super(apiKey);
        this._client = new CohereClient({ token: this.apiKey });
    }

    public get CohereClient(): CohereClient {
        return this._client;
    }

    /** Native batch endpoint: Cohere's embed API takes an array of texts in one request. */
    public override get SupportsBatchEmbeddings(): boolean {
        return true;
    }

    /**
     * Cohere embed-v4 accepts images via the v2 `inputs`/`image_url` path — and that path only
     * supports PNG/JPEG/WebP/GIF (the API errors "only PNG, JPEG, WebP, and GIF are supported").
     * Embed-v4's marketed PDF/document support isn't reachable here (it requires rendering pages to
     * images / a different endpoint), so PDF is intentionally NOT declared — declaring it would pass
     * client-side validation but fail at the API.
     */
    public override GetFileCapabilities(): FileCapabilities | null {
        return {
            SupportedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
            MaxFileSize: 5 * 1024 * 1024, // Cohere embed-v4: images up to 5 MB
            MaxFilesPerRequest: 1,
            HasFileAPI: false,
        };
    }

    public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
        const model = params.model || DEFAULT_MODEL;
        try {
            const response = await this._client.v2.embed({
                model,
                inputType: this.inputType,
                embeddingTypes: ['float'],
                texts: [params.text],
            });
            return { object: 'object', model, ModelUsage: new ModelUsage(0, 0), vector: response.embeddings.float?.[0] ?? [] };
        } catch (error) {
            console.error('Cohere embedding error:', ErrorAnalyzer.analyzeError(error, 'Cohere'));
            return { object: 'object', model, ModelUsage: new ModelUsage(0, 0), vector: [] };
        }
    }

    protected override async embedBatch(params: EmbedTextsParams): Promise<EmbedTextsResult> {
        const model = params.model || DEFAULT_MODEL;
        try {
            const response = await this._client.v2.embed({
                model,
                inputType: this.inputType,
                embeddingTypes: ['float'],
                texts: params.texts,
            });
            return { object: 'list', model, ModelUsage: new ModelUsage(0, 0), vectors: response.embeddings.float ?? [] };
        } catch (error) {
            console.error('Cohere embedding error:', ErrorAnalyzer.analyzeError(error, 'Cohere'));
            return { object: 'list', model, ModelUsage: new ModelUsage(0, 0), vectors: [] };
        }
    }

    /**
     * Multimodal embed: text and/or images fused into ONE vector via Cohere's v2 `inputs`.
     * Maps MJ content blocks to Cohere EmbedContent blocks. Returns an empty vector on error,
     * consistent with EmbedText/EmbedTexts. (Error propagation + client-side mime validation are
     * deferred pending the BaseEmbeddings error-handling decision.)
     */
    public override async EmbedContent(params: EmbedContentParams): Promise<EmbedContentResult> {
        const model = params.model || DEFAULT_MODEL;
        try {
            this.ValidateContentSupported(params.content);
            const response = await this._client.v2.embed({
                model,
                inputType: this.inputType,
                embeddingTypes: ['float'],
                inputs: [this.mapContentToEmbedInput(params.content)],
            });
            return { object: 'object', model, ModelUsage: new ModelUsage(0, 0), vector: response.embeddings.float?.[0] ?? [] };
        } catch (error) {
            console.error('Cohere embedding (content) error:', ErrorAnalyzer.analyzeError(error, 'Cohere'));
            return { object: 'object', model, ModelUsage: new ModelUsage(0, 0), vector: [] };
        }
    }

    public async GetEmbeddingModels(): Promise<CohereEmbeddingModelInfo[]> {
        return [
            {
                Model: DEFAULT_MODEL,
                Description: 'Cohere Embed v4 — multimodal (text + image) embedding model',
                OutputDimension: DEFAULT_DIMENSIONS,
            },
        ];
    }

    /** Cohere's required input_type, overridable via AdditionalSettings; defaults to search_document. */
    private get inputType(): Cohere.EmbedInputType {
        const it = this._additionalSettings['inputType'];
        return typeof it === 'string' ? (it as Cohere.EmbedInputType) : DEFAULT_INPUT_TYPE;
    }

    /** Maps MJ ChatMessageContent to a Cohere EmbedInput (text + image_url blocks). */
    private mapContentToEmbedInput(content: ChatMessageContent): Cohere.EmbedInput {
        if (typeof content === 'string') {
            return { content: [{ type: 'text', text: content }] };
        }
        const blocks = content.map((block: ChatMessageContentBlock): Cohere.EmbedContent => {
            if (block.type === 'text') {
                return { type: 'text', text: block.content };
            }
            return { type: 'image_url', imageUrl: { url: this.toImageDataUrl(block) } };
        });
        return { content: blocks };
    }

    /** Cohere accepts a base64 data URI or web URL; wrap raw base64 with its mime type. */
    private toImageDataUrl(block: ChatMessageContentBlock): string {
        if (block.content.startsWith('data:') || block.content.startsWith('http')) {
            return block.content;
        }
        return `data:${block.mimeType || 'image/jpeg'};base64,${block.content}`;
    }
}
