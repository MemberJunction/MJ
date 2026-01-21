import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { RunView, UserInfo } from "@memberjunction/core";
import { MJGlobal } from "@memberjunction/global";
import {
    BaseImageGenerator,
    ImageGenerationParams,
    ImageGenerationResult,
    ImageEditParams,
    GeneratedImage,
    GetAIAPIKey
} from "@memberjunction/ai";
import { AIModelEntityExtended, MediaOutput } from "@memberjunction/ai-core-plus";
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
 *
 * // Image-to-image editing (transform a source image)
 * await runAction({
 *   ActionName: 'Generate Image',
 *   Params: [{
 *     Name: 'Prompt',
 *     Value: 'Transform this into a professional infographic with dark theme'
 *   }, {
 *     Name: 'SourceImage',
 *     Value: 'base64_encoded_image_or_url'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Generate Image")
export class GenerateImageAction extends BaseAction {

    /**
     * Generates or edits image(s) using AI image generation models.
     *
     * When SourceImage is provided, performs image-to-image editing (style transfer, transformation).
     * When SourceImage is not provided, performs text-to-image generation.
     *
     * @param params - The action parameters containing:
     *   - Prompt: Text description of the image to generate or edit instructions (required)
     *   - Model: Model name/ID to use (optional, uses default if not specified)
     *   - NumberOfImages: Number of images to generate (optional, default: 1)
     *   - Size: Image size like "1024x1024" (optional)
     *   - Quality: Quality level - "standard" or "hd" (optional)
     *   - Style: Style preset - "vivid" or "natural" (optional)
     *   - NegativePrompt: Things to avoid in the image (optional)
     *   - OutputFormat: "base64" or "url" (optional, default: "base64")
     *   - SourceImage: Source image for image-to-image editing (optional, base64 or URL)
     *   - Mask: Mask image for inpainting - white/transparent areas are regenerated (optional)
     *
     * @returns Generated or edited image(s) as base64 or URLs
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
            const sourceImage = this.getParamValue(params, 'sourceimage');
            const mask = this.getParamValue(params, 'mask');

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

            let result: ImageGenerationResult;

            if (sourceImage) {
                // Image-to-image: use EditImage when source image is provided
                result = await this.executeImageEdit(generator, {
                    prompt,
                    apiName,
                    sourceImage,
                    mask,
                    numberOfImages,
                    size,
                    outputFormat,
                    negativePrompt
                });
            } else {
                // Text-to-image: use GenerateImage
                result = await this.executeImageGeneration(generator, {
                    prompt,
                    apiName,
                    numberOfImages,
                    size,
                    outputFormat,
                    quality,
                    style,
                    negativePrompt
                });
            }

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
                Name: 'ModelUsed',
                Type: 'Output',
                Value: model.Name
            });

            // Build response - NOTE: images data is in output params, not in Message
            // This keeps Message lightweight for LLM context (base64 images are ~700K tokens each)
            const responseData = {
                message: `Successfully generated ${result.images.length} image(s)`,
                model: model.Name,
                imageCount: result.images.length,
                // Images are available in the 'Images' output parameter
                // Use the provided placeholder references in your response
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
     * Execute text-to-image generation
     */
    private async executeImageGeneration(
        generator: BaseImageGenerator,
        options: {
            prompt: string;
            apiName: string;
            numberOfImages: number;
            size: string;
            outputFormat: string;
            quality?: string;
            style?: string;
            negativePrompt?: string;
        }
    ): Promise<ImageGenerationResult> {
        const genParams: ImageGenerationParams = {
            prompt: options.prompt,
            model: options.apiName,
            n: options.numberOfImages,
            size: options.size,
            outputFormat: options.outputFormat === 'url' ? 'url' : 'b64_json'
        };

        if (options.quality) {
            genParams.quality = options.quality as ImageGenerationParams['quality'];
        }
        if (options.style) {
            genParams.style = options.style as ImageGenerationParams['style'];
        }
        if (options.negativePrompt) {
            genParams.negativePrompt = options.negativePrompt;
        }

        return generator.GenerateImage(genParams);
    }

    /**
     * Execute image-to-image editing
     */
    private async executeImageEdit(
        generator: BaseImageGenerator,
        options: {
            prompt: string;
            apiName: string;
            sourceImage: string;
            mask?: string;
            numberOfImages: number;
            size: string;
            outputFormat: string;
            negativePrompt?: string;
        }
    ): Promise<ImageGenerationResult> {
        const editParams: ImageEditParams = {
            prompt: options.prompt,
            model: options.apiName,
            image: options.sourceImage,
            n: options.numberOfImages,
            size: options.size,
            outputFormat: options.outputFormat === 'url' ? 'url' : 'b64_json'
        };

        if (options.mask) {
            editParams.mask = options.mask;
        }
        if (options.negativePrompt) {
            editParams.negativePrompt = options.negativePrompt;
        }

        return generator.EditImage(editParams);
    }

    /**
     * Format a generated image for output as MediaOutput
     */
    private formatImageOutput(img: GeneratedImage, index: number): MediaOutput {
        return {
            modality: 'Image',
            mimeType: img.format ? `image/${img.format}` : 'image/png',
            data: img.base64,
            url: img.url,
            width: img.width,
            height: img.height,
            label: `Generated image ${index + 1}`
        };
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
