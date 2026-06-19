import { FileCapabilities } from './baseLLM';
import { BaseModel } from './baseModel';
import { ChatMessageContent, ChatMessageContentBlock } from './chat.types';
import { EmbedContentParams, EmbedContentResult, EmbedTextParams, EmbedTextResult, EmbedTextsParams, EmbedTextsResult } from './embed.types';

/**
 * Base class for all embedding model implementations
 */
export abstract class BaseEmbeddings extends BaseModel {
    /**
     * Protected property to store additional provider-specific settings
     */
    protected _additionalSettings: Record<string, any> = {};

    /**
     * Get the current additional settings
     */
    public get AdditionalSettings(): Record<string, any> {
        return this._additionalSettings;
    }

    /**
     * Declares which non-text mime types this provider's embedding model can embed.
     * null = text-only (the default). Multimodal providers override this.
     * Mirrors BaseLLM.GetFileCapabilities().
     */
    public GetFileCapabilities(): FileCapabilities | null {
        return null;
    }

    /**
     * Throws if `content` contains a media block whose mime type the model can't embed.
     * Text-only content always passes. Called by multimodal providers at the top of EmbedContent.
     */
    protected ValidateContentSupported(content: ChatMessageContent): void {
        if (typeof content === 'string') {
            return;
        }
        const caps = this.GetFileCapabilities();
        for (const block of content) {
            if (block.type === 'text') {
                continue;
            }
            const mime = this.resolveBlockMimeType(block);
            if (!caps || !this.mimeTypeSupported(mime, caps)) {
                throw new Error(
                    `${this.constructor.name} cannot embed content of type '${mime ?? block.type}'. ` +
                        `Supported: ${caps?.SupportedMimeTypes.join(', ') ?? 'text only'}.`,
                );
            }
        }
    }

    /** Resolve a block's effective mime: explicit field → data-URL prefix → type-based default. */
    private resolveBlockMimeType(block: ChatMessageContentBlock): string | undefined {
        if (block.mimeType) {
            return block.mimeType.toLowerCase();
        }
        const dataUrl = block.content.match(/^data:([^;]+);base64,/);
        if (dataUrl) {
            return dataUrl[1].toLowerCase();
        }
        return undefined;
    }

    /** Wildcard-aware mime match (e.g. 'image/*'), same semantics as ResolveFileInputStrategy. */
    private mimeTypeSupported(mime: string | undefined, caps: FileCapabilities): boolean {
        if (!mime) {
            return false;
        }
        return caps.SupportedMimeTypes.some((pattern) => {
            const p = pattern.toLowerCase();
            return p.endsWith('/*') ? mime.startsWith(p.slice(0, -1)) : mime === p;
        });
    }

    /**
     * Set additional provider-specific settings
     * Subclasses should override this method to validate required settings
     *
     * @param settings Provider-specific settings
     */
    public SetAdditionalSettings(settings: Record<string, any>): void {
        this._additionalSettings = { ...this._additionalSettings, ...settings };
    }

    /**
     * Clear all additional settings
     * This is useful for resetting the state of the provider
     * or when switching between different configurations.
     */
    public ClearAdditionalSettings(): void {
        this._additionalSettings = {};
    }

    public abstract EmbedText(params: EmbedTextParams): Promise<EmbedTextResult>;
    public abstract EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult>;
    public abstract GetEmbeddingModels(): Promise<any>;

    /**
     * Embeds text and/or interleaved media content into a single fused vector.
     *
     * Default behavior: text-only content is delegated to EmbedText;
     * if any non-text block is present, throws — because the base provider can't embed media.
     * Multimodal providers (e.g. GeminiEmbedding2) should override this method.
     */
    public async EmbedContent(params: EmbedContentParams): Promise<EmbedContentResult> {
        // Base (text-only) behavior: reject unsupported media via ValidateContentSupported — caps are
        // null here, so any non-text block throws — then flatten text blocks and delegate to EmbedText.
        this.ValidateContentSupported(params.content);
        const content = params.content;
        const text = typeof content === 'string' ? content : content.map((block: ChatMessageContentBlock) => block.content).join('\n');
        return this.EmbedText({ ...params, text });
    }
}

/**
 * @deprecated Use BaseEmbeddings instead - will be removed in a future release
 */
export abstract class Embeddings extends BaseEmbeddings {}
