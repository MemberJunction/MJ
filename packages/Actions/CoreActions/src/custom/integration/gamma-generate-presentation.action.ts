import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import axios from "axios";
import { getApiIntegrationsConfig } from "../../config";

/**
 * Action that generates presentations using Gamma's Generations API
 * Creates presentations, documents, or social media posts from text input
 *
 * @example
 * ```typescript
 * // Generate a basic presentation
 * await runAction({
 *   ActionName: 'Gamma Generate Presentation',
 *   Params: [{
 *     Name: 'InputText',
 *     Value: 'Create a presentation about climate change impacts and solutions'
 *   }]
 * });
 *
 * // Generate with specific format and options
 * await runAction({
 *   ActionName: 'Gamma Generate Presentation',
 *   Params: [{
 *     Name: 'InputText',
 *     Value: 'Quarterly sales report with revenue trends and projections'
 *   }, {
 *     Name: 'Format',
 *     Value: 'presentation'
 *   }, {
 *     Name: 'TextMode',
 *     Value: 'generate'
 *   }, {
 *     Name: 'NumCards',
 *     Value: 10
 *   }, {
 *     Name: 'ThemeName',
 *     Value: 'Modern'
 *   }]
 * });
 *
 * // Generate and export as PDF
 * await runAction({
 *   ActionName: 'Gamma Generate Presentation',
 *   Params: [{
 *     Name: 'InputText',
 *     Value: 'Product launch announcement'
 *   }, {
 *     Name: 'ExportAs',
 *     Value: 'pdf'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Gamma Generate Presentation")
export class GammaGeneratePresentationAction extends BaseAction {

    /**
     * Executes the Gamma presentation generation
     *
     * @param params - The action parameters containing:
     *   - InputText: Text to generate content from (required, 1-750,000 characters)
     *   - Format: Output format - 'presentation' (default), 'document', 'social'
     *   - TextMode: How to process text - 'generate' (default), 'condense', 'preserve'
     *   - ThemeName: Visual theme name (optional)
     *   - NumCards: Number of slides/cards (1-75, depends on tier)
     *   - CardSplit: How to split cards - 'auto' (default) or 'inputTextBreaks'
     *   - AdditionalInstructions: Custom guidance for content generation (optional)
     *   - ExportAs: Export format - 'pdf' or 'pptx' (optional)
     *   - TextAmount: Amount of text - 'auto', 'minimal', 'moderate', 'detailed'
     *   - TextTone: Tone of text - 'auto', 'professional', 'casual', 'educational'
     *   - TextAudience: Target audience description (optional)
     *   - TextLanguage: Language for content (e.g., 'en', 'es', 'fr')
     *   - ImageSource: Image source - 'auto', 'web', 'ai', 'none'
     *   - ImageModel: AI image model - 'dall-e-3', 'sd-3-large', 'firefly-3'
     *   - ImageStyle: AI image style - 'auto', 'photographic', 'digital-art', 'illustration'
     *   - PollStatus: Poll for completion status (default: true)
     *   - PollInterval: Seconds between status checks (default: 5)
     *   - MaxPollTime: Maximum seconds to poll (default: 300)
     *
     * @returns Generation results with Gamma URL and status
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Get required parameters
            const inputText = this.getStringParam(params, 'inputtext');
            if (!inputText) {
                return this.createErrorResult("InputText parameter is required", "MISSING_INPUT_TEXT");
            }

            if (inputText.length < 1 || inputText.length > 750000) {
                return this.createErrorResult(
                    "InputText must be between 1 and 750,000 characters",
                    "INVALID_INPUT_TEXT_LENGTH"
                );
            }

            // Get API key from config
            const apiConfig = getApiIntegrationsConfig();
            const apiKey = apiConfig.gammaApiKey;
            if (!apiKey) {
                return this.createErrorResult(
                    "Gamma API key not found. Set gammaApiKey in mj.config.cjs or GAMMA_API_KEY environment variable",
                    "MISSING_API_KEY"
                );
            }

            // Get optional parameters
            const format = this.getStringParam(params, 'format') || 'presentation';
            const textMode = this.getStringParam(params, 'textmode') || 'generate';
            const themeName = this.getStringParam(params, 'themename');
            const numCards = this.getNumericParam(params, 'numcards');
            const cardSplit = this.getStringParam(params, 'cardsplit') || 'auto';
            const additionalInstructions = this.getStringParam(params, 'additionalinstructions');
            const exportAs = this.getStringParam(params, 'exportas');

            // Text options
            const textAmount = this.getStringParam(params, 'textamount');
            const textTone = this.getStringParam(params, 'texttone');
            const textAudience = this.getStringParam(params, 'textaudience');
            const textLanguage = this.getStringParam(params, 'textlanguage');

            // Image options
            const imageSource = this.getStringParam(params, 'imagesource');
            const imageModel = this.getStringParam(params, 'imagemodel');
            const imageStyle = this.getStringParam(params, 'imagestyle');

            // Polling options
            const pollStatus = this.getBooleanParam(params, 'pollstatus', true);
            const pollInterval = this.getNumericParam(params, 'pollinterval', 5);
            const maxPollTime = this.getNumericParam(params, 'maxpolltime', 300);

            // Build request body
            const requestBody: Record<string, unknown> = {
                inputText,
                format,
                textMode,
                cardSplit
            };

            // Add optional top-level parameters
            if (themeName) requestBody.themeName = themeName;
            if (numCards) requestBody.numCards = numCards;
            if (additionalInstructions) requestBody.additionalInstructions = additionalInstructions;
            if (exportAs) requestBody.exportAs = exportAs;

            // Build text options
            const textOptions: Record<string, string> = {};
            if (textAmount) textOptions.amount = textAmount;
            if (textTone) textOptions.tone = textTone;
            if (textAudience) textOptions.audience = textAudience;
            if (textLanguage) textOptions.language = textLanguage;
            if (Object.keys(textOptions).length > 0) {
                requestBody.textOptions = textOptions;
            }

            // Build image options
            const imageOptions: Record<string, string> = {};
            if (imageSource) imageOptions.source = imageSource;
            if (imageModel) imageOptions.model = imageModel;
            if (imageStyle) imageOptions.style = imageStyle;
            if (Object.keys(imageOptions).length > 0) {
                requestBody.imageOptions = imageOptions;
            }

            // Make API request to start generation
            const response = await axios.post(
                'https://public-api.gamma.app/v0.2/generations',
                requestBody,
                {
                    headers: {
                        'X-API-KEY': apiKey,
                        'Content-Type': 'application/json'
                    },
                    timeout: 60000 // 60 second timeout
                }
            );

            if (!response.data || !response.data.generationId) {
                return this.createErrorResult("Invalid response from Gamma API", "INVALID_RESPONSE");
            }

            const generationId = response.data.generationId;
            this.addOutputParam(params, 'GenerationId', generationId);

            // If polling is disabled, return immediately
            if (!pollStatus) {
                return {
                    Success: true,
                    ResultCode: "GENERATION_STARTED",
                    Message: JSON.stringify({
                        generationId,
                        status: 'pending',
                        message: 'Generation started. Use the generationId to check status.'
                    }, null, 2)
                };
            }

            // Poll for completion
            const startTime = Date.now();
            const pollIntervalMs = pollInterval * 1000;
            const maxPollTimeMs = maxPollTime * 1000;

            while (Date.now() - startTime < maxPollTimeMs) {
                await this.sleep(pollIntervalMs);

                const statusResponse = await axios.get(
                    `https://public-api.gamma.app/v0.2/generations/${generationId}`,
                    {
                        headers: {
                            'X-API-KEY': apiKey
                        },
                        timeout: 30000
                    }
                );

                const statusData = statusResponse.data;

                if (statusData.status === 'completed') {
                    // Add output parameters
                    this.addOutputParam(params, 'GammaUrl', statusData.gammaUrl);
                    this.addOutputParam(params, 'Status', 'completed');
                    this.addOutputParam(params, 'Credits', statusData.credits);

                    return {
                        Success: true,
                        ResultCode: "SUCCESS",
                        Message: JSON.stringify({
                            generationId,
                            status: 'completed',
                            gammaUrl: statusData.gammaUrl,
                            credits: statusData.credits
                        }, null, 2)
                    };
                } else if (statusData.status === 'failed') {
                    return this.createErrorResult(
                        `Generation failed: ${statusData.error || 'Unknown error'}`,
                        "GENERATION_FAILED"
                    );
                }

                // Status is still 'pending', continue polling
            }

            // Timeout reached
            return this.createErrorResult(
                `Generation timed out after ${maxPollTime} seconds. Use GenerationId to check status later.`,
                "GENERATION_TIMEOUT"
            );

        } catch (error) {
            if (axios.isAxiosError(error)) {
                const status = error.response?.status;
                const errorData = error.response?.data;

                if (status === 401) {
                    return this.createErrorResult(
                        "Invalid Gamma API key. Verify your API key is correct and has proper permissions.",
                        "INVALID_API_KEY"
                    );
                }

                if (status === 429) {
                    return this.createErrorResult(
                        "Gamma API rate limit exceeded (50 presentations per day during beta)",
                        "RATE_LIMITED"
                    );
                }

                if (status === 400) {
                    return this.createErrorResult(
                        `Invalid request parameters: ${errorData?.error || error.message}`,
                        "INVALID_PARAMETERS"
                    );
                }

                return this.createErrorResult(
                    `Gamma API error: ${errorData?.error || error.message}`,
                    "API_ERROR"
                );
            }

            return this.createErrorResult(
                `Failed to generate presentation: ${error instanceof Error ? error.message : String(error)}`,
                "GENERATION_FAILED"
            );
        }
    }

    /**
     * Sleep helper for polling
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get string parameter value
     */
    private getStringParam(params: RunActionParams, paramName: string): string | undefined {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (param?.Value === undefined || param?.Value === null) return undefined;
        return String(param.Value);
    }

    /**
     * Get boolean parameter value with default
     */
    private getBooleanParam(params: RunActionParams, paramName: string, defaultValue: boolean = false): boolean {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (param?.Value === undefined || param?.Value === null) return defaultValue;
        return String(param.Value).toLowerCase() === 'true';
    }

    /**
     * Get numeric parameter value with optional default
     */
    private getNumericParam(params: RunActionParams, paramName: string, defaultValue?: number): number | undefined {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (param?.Value === undefined || param?.Value === null) return defaultValue;
        const num = Number(param.Value);
        return isNaN(num) ? defaultValue : num;
    }

    /**
     * Add output parameter
     */
    private addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        params.Params.push({
            Name: name,
            Type: 'Output',
            Value: value
        });
    }

    /**
     * Create error result
     */
    private createErrorResult(message: string, code: string): ActionResultSimple {
        return {
            Success: false,
            Message: message,
            ResultCode: code
        };
    }
}