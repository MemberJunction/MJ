export class BaseResult {
    success: boolean
    startTime: Date
    endTime: Date
    errorMessage: string
    exception: any
    get timeElapsed(): number {
        return this.endTime.getTime() - this.startTime.getTime();
    }
    constructor (success: boolean, startTime: Date, endTime: Date) {
        this.success = success;
        this.startTime = startTime;
        this.endTime = endTime;
    }
}

export class BaseParams {
    /**
     * Model name, required.
     */
    model: string
    
    /**
     * Model temperature, optional.
     */
    temperature?: number

    /**
     * Specifies the format that the model should output. Not all models support all formats. If not specified, the default is 'Any'.
     */
    responseFormat?: 'Any' | 'Text' | 'Markdown' | 'JSON' | 'ModelSpecific' = 'Any';

    /**
     * The standard response formats may not be sufficient for all models. This field allows for a model-specific response format to be specified. For this field to be used, responseFormat must be set to 'ModelSpecific'. 
     */
    modelSpecificResponseFormat?: any

    /**
     * Model max output response tokens, optional.
     */
    maxOutputTokens?: number

    /**
     * Model max budget tokens that we may use for reasoning in reasoning models, optional.
     */
    reasoningBudgetTokens?: number
}

export class ModelUsage {
    constructor(promptTokens: number, completionTokens: number) {
        this.promptTokens = promptTokens;
        this.completionTokens = completionTokens;
    }
    promptTokens: number
    completionTokens: number
    get totalTokens(): number {
        return this.promptTokens + this.completionTokens;
    }
}

/**
 * Base AI model class, used for everything else in the MemberJunction AI environment
 */
export abstract class BaseModel {
    private _apiKey: string;
    /**
     * Only sub-classes can access the API key
     */
    protected get apiKey(): string {
        return this._apiKey;
    }
    constructor (apiKey: string) {
        if (!apiKey || apiKey.trim().length === 0)
            throw new Error('@memberjuction/AI.baseModel: API key cannot be empty');

        this._apiKey = apiKey;
    }
}
