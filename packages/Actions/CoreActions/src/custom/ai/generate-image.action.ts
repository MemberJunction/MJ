import { ActionResultSimple, RunActionParams, RuntimeAPIKeyResolver } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { RunView, UserInfo } from "@memberjunction/core";
import { UUIDsEqual } from "@memberjunction/global";
import {
    AIAPIKey,
    ImageGenerationParams,
    GeneratedImage,
    GetAIAPIKey,
} from "@memberjunction/ai";
import { MJAIModelEntityExtended, MediaOutput } from "@memberjunction/ai-core-plus";
import { AIEngineBase } from "@memberjunction/ai-engine-base";
import {
    AIImageEditRunParams,
    AIImageGenerationRunParams,
    AIImageGenerationRunner,
    AIImageRunOptions,
    AIImageRunResult,
} from "@memberjunction/ai-prompts";

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
/**
 * Resolve the key an image generator should use.
 *
 * Inside an agent run, `resolve` is the run's {@link RuntimeAPIKeyResolver}: the RUN'S key for the
 * driver class first, then the platform's — the same order the run's prompts use, so a run on a
 * customer's OpenAI key now generates its images on that key too. Outside a run (or when the agent
 * refuses this action the run's key) it is undefined / answers undefined, and `GetAIAPIKey` gives
 * the platform key as it always did. Then the vendor-name fallback that was always here — but
 * actually USED this time: the previous code found a key by vendor name and then handed the empty
 * driver-class result to the generator, so that branch never produced an image.
 */
export function ResolveImageGenerationAPIKey(driverClass: string, vendorName: string | undefined, resolve?: RuntimeAPIKeyResolver): string {
    const byDriver = resolve?.(driverClass) || GetAIAPIKey(driverClass);
    if (byDriver) return byDriver;
    const byVendor = vendorName ? resolve?.(vendorName) || GetAIAPIKey(vendorName) : '';
    if (byVendor) return byVendor;
    throw new Error(`No API key found for ${driverClass} or vendor ${vendorName || 'unknown'}`);
}

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

            // Choose the model and resolve its key exactly as before; the runner then makes the call
            const { model, runOptions } = await this.prepareImageModel(
                params.ContextUser,
                modelName,
                params.RuntimeAPIKeyResolver
            );

            let runResult: AIImageRunResult;

            if (sourceImage) {
                // Image-to-image: use EditImage when source image is provided
                runResult = await this.executeImageEdit(runOptions, {
                    prompt,
                    sourceImage,
                    mask,
                    numberOfImages,
                    size,
                    outputFormat,
                    negativePrompt
                });
            } else {
                // Text-to-image: use GenerateImage
                runResult = await this.executeImageGeneration(runOptions, {
                    prompt,
                    numberOfImages,
                    size,
                    outputFormat,
                    quality,
                    style,
                    negativePrompt
                });
            }

            if (!runResult.Success) {
                return {
                    Success: false,
                    Message: `Image generation failed: ${runResult.ErrorMessage || 'Unknown error'}`,
                    ResultCode: "GENERATION_FAILED"
                };
            }

            const result = runResult.ImageResult;
            if (!result?.images || result.images.length === 0) {
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
     * Choose the image model and resolve its key using proper metadata lookup, and build the runner
     * options that pin that model and carry that key.
     *
     * The key is passed to the runner as `APIKeys` for the model's driver class. The runner's own
     * lookup covers only the environment key for the driver class; the run's runtime key and the
     * vendor-name fallback live here, so passing the resolved key keeps the key the generator gets
     * identical to the one this action always used.
     */
    private async prepareImageModel(
        contextUser: UserInfo | undefined,
        modelName?: string,
        resolve?: RuntimeAPIKeyResolver
    ): Promise<{ model: MJAIModelEntityExtended; runOptions: AIImageRunOptions }> {
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
        let model: MJAIModelEntityExtended;
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

        const driverClass = inferenceProvider.DriverClass;
        const vendor = AIEngineBase.Instance.Vendors.find(v => UUIDsEqual(v.ID, inferenceProvider.VendorID));
        const apiKey = ResolveImageGenerationAPIKey(driverClass, vendor?.Name, resolve);
        const apiKeys: AIAPIKey[] = [{ driverClass, apiKey }];

        return {
            model,
            runOptions: { ContextUser: contextUser, ModelID: model.ID, APIKeys: apiKeys }
        };
    }

    /**
     * Execute text-to-image generation through the image runner, pinned to the chosen model
     */
    private async executeImageGeneration(
        runOptions: AIImageRunOptions,
        options: {
            prompt: string;
            numberOfImages: number;
            size: string;
            outputFormat: string;
            quality?: string;
            style?: string;
            negativePrompt?: string;
        }
    ): Promise<AIImageRunResult> {
        const genParams: AIImageGenerationRunParams = {
            ...runOptions,
            prompt: options.prompt,
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

        return new AIImageGenerationRunner().RunImageGeneration(genParams);
    }

    /**
     * Execute image-to-image editing through the image runner, pinned to the chosen model
     */
    private async executeImageEdit(
        runOptions: AIImageRunOptions,
        options: {
            prompt: string;
            sourceImage: string;
            mask?: string;
            numberOfImages: number;
            size: string;
            outputFormat: string;
            negativePrompt?: string;
        }
    ): Promise<AIImageRunResult> {
        const editParams: AIImageEditRunParams = {
            ...runOptions,
            prompt: options.prompt,
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

        return new AIImageGenerationRunner().RunImageEdit(editParams);
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