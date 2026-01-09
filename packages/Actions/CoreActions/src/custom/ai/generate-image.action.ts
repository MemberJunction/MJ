import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { RunView, UserInfo } from "@memberjunction/core";
import { MJGlobal } from "@memberjunction/global";
import {
    BaseImageGenerator,
    ImageGenerationParams,
    ImageGenerationResult,
    GeneratedImage,
    GetAIAPIKey
} from "@memberjunction/ai";
import { AIModelEntityExtended } from "@memberjunction/ai-core-plus";
import { AIEngineBase } from "@memberjunction/ai-engine-base";

/**
 * Action that generates images using AI image generation models (DALL-E, Gemini, etc.)
 *
 * @example
 * ```typescript
 * // Generate a simple image
 * await runAction({
 *   ActionName: 'Generate Image',
 *   Params: [{
 *     Name: 'Prompt',
 *     Value: 'A serene mountain landscape at sunset with snow-capped peaks'
 *   }]
 * });
 *
 * // Generate with specific model and size
 * await runAction({
 *   ActionName: 'Generate Image',
 *   Params: [{
 *     Name: 'Prompt',
 *     Value: 'A futuristic cityscape with flying vehicles'
 *   }, {
 *     Name: 'Model',
 *     Value: 'dall-e-3'
 *   }, {
 *     Name: 'Size',
 *     Value: '1792x1024'
 *   }, {
 *     Name: 'Quality',
 *     Value: 'hd'
 *   }]
 * });
 *
 * // Generate multiple images
 * await runAction({
 *   ActionName: 'Generate Image',
 *   Params: [{
 *     Name: 'Prompt',
 *     Value: 'Abstract art in vibrant colors'
 *   }, {
 *     Name: 'NumberOfImages',
 *     Value: 3
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Generate Image")
export class GenerateImageAction extends BaseAction {

    /**
     * Generates image(s) using AI image generation models
     *
     * @param params - The action parameters containing:
     *   - Prompt: Text description of the image to generate (required)
     *   - Model: Model name/ID to use (optional, uses default if not specified)
     *   - NumberOfImages: Number of images to generate (optional, default: 1)
     *   - Size: Image size like "1024x1024" (optional)
     *   - Quality: Quality level - "standard" or "hd" (optional)
     *   - Style: Style preset - "vivid" or "natural" (optional)
     *   - NegativePrompt: Things to avoid in the image (optional)
     *   - OutputFormat: "base64" or "url" (optional, default: "base64")
     *
     * @returns Generated image(s) as base64 or URLs
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const prompt = this.getParamValue(params, 'prompt');
            const modelName = this.getParamValue(params, 'model');
            const numberOfImages = this.getNumberParam(params, 'numberofimages', 1);
            const size = this.getParamValue(params, 'size') || '1024x1024';
            const quality = this.getParamValue(params, 'quality');
            const style = this.getParamValue(params, 'style');
            const negativePrompt = this.getParamValue(params, 'negativeprompt');
            const outputFormat = this.getParamValue(params, 'outputformat') || 'base64';

            // Validate prompt
            if (!prompt) {
                return {
                    Success: false,
                    Message: "Prompt parameter is required",
                    ResultCode: "MISSING_PROMPT"
                };
            }

            // Get image generator model and create instance
            const { generator, model, apiName } = await this.prepareImageGenerator(
                params.ContextUser,
                modelName
            );

            // Build generation parameters
            const genParams: ImageGenerationParams = {
                prompt: prompt,
                model: apiName,
                n: numberOfImages,
                size: size,
                outputFormat: outputFormat === 'url' ? 'url' : 'b64_json'
            };

            if (quality) {
                genParams.quality = quality;
            }
            if (style) {
                genParams.style = style;
            }
            if (negativePrompt) {
                genParams.negativePrompt = negativePrompt;
            }

            // Generate images
            const result = await generator.GenerateImage(genParams);

            if (!result.success) {
                return {
                    Success: false,
                    Message: `Image generation failed: ${result.errorMessage || 'Unknown error'}`,
                    ResultCode: "GENERATION_FAILED"
                };
            }

            if (!result.images || result.images.length === 0) {
                return {
                    Success: false,
                    Message: "No images were generated",
                    ResultCode: "NO_IMAGES"
                };
            }

            // Format output images
            const outputImages = result.images.map((img, index) => this.formatImageOutput(img, index));

            // Add output parameters
            params.Params.push({
                Name: 'Images',
                Type: 'Output',
                Value: outputImages
            });

            params.Params.push({
                Name: 'ImageCount',
                Type: 'Output',
                Value: result.images.length
            });

            if (result.revisedPrompt) {
                params.Params.push({
                    Name: 'RevisedPrompt',
                    Type: 'Output',
                    Value: result.revisedPrompt
                });
            }

            params.Params.push({
                Name: 'Model',
                Type: 'Output',
                Value: model.Name
            });

            // Build response
            const responseData = {
                message: `Successfully generated ${result.images.length} image(s)`,
                model: model.Name,
                imageCount: result.images.length,
                images: outputImages,
                revisedPrompt: result.revisedPrompt
            };

            return {
                Success: true,
                ResultCode: "IMAGES_GENERATED",
                Message: JSON.stringify(responseData, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Generate image failed: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "ACTION_FAILED"
            };
        }
    }

    /**
     * Prepare an image generator instance using proper metadata lookup
     */
    private async prepareImageGenerator(
        contextUser: UserInfo | undefined,
        modelName?: string
    ): Promise<{ generator: BaseImageGenerator; model: AIModelEntityExtended; apiName: string }> {
        // Ensure AIEngine is loaded
        await AIEngineBase.Instance.Config(false, contextUser);

        // Find image generator models
        const imageGeneratorModels = AIEngineBase.Instance.Models.filter(
            m => m.AIModelType?.toLowerCase() === 'image generator' && m.IsActive
        );

        if (imageGeneratorModels.length === 0) {
            throw new Error('No active image generator models found');
        }

        // Select model - use specified or highest power
        let model: AIModelEntityExtended;
        if (modelName) {
            const foundModel = imageGeneratorModels.find(
                m => m.Name.toLowerCase() === modelName.toLowerCase() ||
                     (m.APIName && m.APIName.toLowerCase() === modelName.toLowerCase())
            );
            if (!foundModel) {
                throw new Error(`Image generator model '${modelName}' not found`);
            }
            model = foundModel;
        } else {
            // Get highest power image generator model
            model = imageGeneratorModels.reduce((best, current) =>
                (current.PowerRank || 0) > (best.PowerRank || 0) ? current : best
            );
        }

        // Find the inference provider from ModelVendors (populated by AIEngineBase)
        // Inference providers have DriverClass set
        const inferenceProvider = model.ModelVendors.find(mv =>
            mv.DriverClass && mv.DriverClass.length > 0 && mv.Status === 'Active'
        );

        if (!inferenceProvider) {
            throw new Error(`No active inference provider found for model '${model.Name}'`);
        }

        // Get API key using the vendor's driver class
        const driverClass = inferenceProvider.DriverClass;
        const apiName = inferenceProvider.APIName || model.APIName || model.Name;
        const apiKey = GetAIAPIKey(driverClass);

        if (!apiKey) {
            // Try getting by vendor name as fallback
            const vendor = AIEngineBase.Instance.Vendors.find(v => v.ID === inferenceProvider.VendorID);
            const vendorApiKey = vendor ? GetAIAPIKey(vendor.Name) : null;
            if (!vendorApiKey) {
                throw new Error(`No API key found for ${driverClass} or vendor ${vendor?.Name || 'unknown'}`);
            }
        }

        const generator = MJGlobal.Instance.ClassFactory.CreateInstance<BaseImageGenerator>(
            BaseImageGenerator,
            driverClass,
            apiKey
        );

        if (!generator) {
            throw new Error(`Failed to create image generator instance for ${driverClass}. Ensure the provider is registered.`);
        }

        return { generator, model, apiName };
    }

    /**
     * Format a generated image for output
     */
    private formatImageOutput(img: GeneratedImage, index: number): Record<string, unknown> {
        const output: Record<string, unknown> = {
            index: index
        };

        if (img.base64) {
            output.base64 = img.base64;
        }
        if (img.url) {
            output.url = img.url;
        }
        if (img.format) {
            output.format = img.format;
        }
        if (img.width) {
            output.width = img.width;
        }
        if (img.height) {
            output.height = img.height;
        }

        return output;
    }

    /**
     * Get parameter value by name (case-insensitive)
     */
    private getParamValue(params: RunActionParams, name: string): string | undefined {
        const param = params.Params.find(p => p.Name.toLowerCase() === name.toLowerCase());
        return param?.Value;
    }

    /**
     * Get number parameter with default
     */
    private getNumberParam(params: RunActionParams, name: string, defaultValue: number): number {
        const value = this.getParamValue(params, name);
        if (value === undefined || value === null) return defaultValue;
        const num = Number(value);
        return isNaN(num) ? defaultValue : num;
    }
}

/**
 * Loader function to ensure the GenerateImageAction class is included in the bundle
 */
export function LoadGenerateImageAction() {
    // Stub function to prevent tree shaking
}
