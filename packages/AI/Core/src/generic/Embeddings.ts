import { BaseModel } from "./baseModel";
import { EmbedTextParams, EmbedTextResult, EmbedTextsParams, EmbedTextsResult } from "./embed.types";

export abstract class Embeddings extends BaseModel {
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
     * Set additional provider-specific settings
     * Subclasses should override this method to validate required settings
     * 
     * @param settings Provider-specific settings
     */
    public SetAdditionalSettings(settings: Record<string, any>): void {
        this._additionalSettings = {...this._additionalSettings, ...settings};
    }

    /**
     * Clear all additional settings
     * This is useful for resetting the state of the provider
     * or when switching between different configurations.
     */
    public ClearAdditionalSettings(): void {
        this._additionalSettings = {};
    }

    public abstract EmbedText(params: EmbedTextParams): Promise<EmbedTextResult>
    public abstract EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult>
    public abstract GetEmbeddingModels(): Promise<any>
}