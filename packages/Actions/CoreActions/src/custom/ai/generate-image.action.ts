import { ActionResultSimple, RunActionParams, RuntimeAPIKeyResolver, RuntimeCredentialScope } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { UUIDsEqual } from "@memberjunction/global";
import {
    AIAPIKey,
    ImageGenerationParams,
    ImageGenerationResult,
    GeneratedImage,
    GetAIAPIKey,
    CredentialScopeAllows,
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
 *
 * @deprecated Kept for compatibility only: `GenerateImageAction` no longer calls it. Use
 * {@link BuildImageGenerationAPIKeys}, which the action and the runner use.
 */
export function ResolveImageGenerationAPIKey(driverClass: string, vendorName: string | undefined, resolve?: RuntimeAPIKeyResolver): string {
    const key = findImageGenerationAPIKey(driverClass, vendorName, resolve);
    if (key) return key;
    throw new Error(`No API key found for ${driverClass} or vendor ${vendorName || 'unknown'}`);
}

/**
 * {@link ResolveImageGenerationAPIKey}'s lookup, answering undefined rather than throwing when nothing
 * resolves. Under a `'RuntimeOnly'` scope only `resolve` answers: the platform key is never a fallback.
 */
function findImageGenerationAPIKey(driverClass: string, vendorName: string | undefined, resolve?: RuntimeAPIKeyResolver, scope: RuntimeCredentialScope = 'Any'): string | undefined {
    const platformKey = (name: string): string | undefined => CredentialScopeAllows(scope, 'Environment') ? GetAIAPIKey(name) : undefined;
    const byDriver = resolve?.(driverClass) || platformKey(driverClass);
    if (byDriver) return byDriver;
    const byVendor = vendorName ? resolve?.(vendorName) || platformKey(vendorName) : '';
    return byVendor || undefined;
}

/** One vendor an image run may reach: the driver class that serves it, and the vendor's name. */
export interface ImageGenerationKeySource {
    /** The driver class the runner builds for this vendor. */
    DriverClass: string;
    /** The vendor's name, for the vendor-name key fallback. */
    VendorName?: string;
}

/**
 * The keys an image run hands the runner as `APIKeys`: at most one per driver class, resolved as
 * {@link ResolveImageGenerationAPIKey} does. A key reaches only the candidates of its own driver
 * class, so a run's own key survives failover to another vendor only if that vendor's class has
 * one here.
 *
 * `sources` should be in the order the runner tries its candidates. When two sources share a driver
 * class, the first whose key resolves wins, so the key a class carries is the one for the vendor the
 * runner reaches first. A class with no key anywhere is left out: the runner may still resolve a
 * credential binding for it, and otherwise skips it.
 *
 * Under a `'RuntimeOnly'` `scope` only the run's own keys are collected, and the runner (given the
 * same scope) skips every class without one rather than resolving a platform credential for it.
 */
export function BuildImageGenerationAPIKeys(sources: ImageGenerationKeySource[], resolve?: RuntimeAPIKeyResolver, scope: RuntimeCredentialScope = 'Any'): AIAPIKey[] {
    const keys: AIAPIKey[] = [];
    for (const source of sources) {
        if (keys.some(k => k.driverClass === source.DriverClass)) continue;
        const apiKey = findImageGenerationAPIKey(source.DriverClass, source.VendorName, resolve, scope);
        if (apiKey) keys.push({ driverClass: source.DriverClass, apiKey });
    }
    return keys;
}

/** The runner options for one action call, and the model the caller named, if any. */
interface PreparedImageRun {
    PinnedModel?: MJAIModelEntityExtended;
    RunOptions: AIImageRunOptions;
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
     *   - Model: Model name or API name to pin (optional; when not specified, the `Default Image
     *     Generation` prompt's bindings choose, with failover between them)
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
            if (!prompt) {
                return {
                    Success: false,
                    Message: "Prompt parameter is required",
                    ResultCode: "MISSING_PROMPT"
                };
            }

            const { PinnedModel, RunOptions } = await this.prepareImageRun(params, this.getParamValue(params, 'model'));
            const runResult = await this.runImageOperation(params, prompt, RunOptions);
            // The model that answered, which after failover may not be the first choice
            return this.toActionResult(params, runResult, runResult.ModelName ?? PinnedModel?.Name ?? '');
        } catch (error) {
            return {
                Success: false,
                Message: `Generate image failed: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "ACTION_FAILED"
            };
        }
    }

    /**
     * Build the runner options for this call.
     *
     * - **The model is pinned only when the caller named one.** Otherwise the `Default Image
     *   Generation` prompt's bindings choose, and its failover reaches the other models. As shipped,
     *   its top binding is the highest-PowerRank active image model, the one this action used to
     *   pick itself.
     * - **`APIKeys` holds a key for every driver class the run may reach** (see
     *   {@link BuildImageGenerationAPIKeys}), so a run's own key carries across vendors on failover.
     *   Within a model the sources follow the runner's vendor order exactly; across models they
     *   follow PowerRank. That order matters only when two vendors share a driver class that has no
     *   key of its own, where it picks whose vendor-name key the class carries.
     * - **The calling agent** (`Context.AgentID`, stamped by BaseAgent) is recorded on the run row.
     *
     * The keys rank as they do for chat prompts: a credential bound to the prompt-model, the
     * model-vendor or the vendor, or a default credential of the vendor's credential type, wins
     * over them. Only with none of those is the key the generator gets the one this action resolves.
     */
    private async prepareImageRun(params: RunActionParams, modelName?: string): Promise<PreparedImageRun> {
        await AIEngineBase.Instance.Config(false, params.ContextUser);
        const imageModels = this.activeImageModels();
        const pinned = modelName ? this.findNamedModel(imageModels, modelName) : undefined;
        const sources = pinned ? this.pinnedKeySources(pinned) : imageModels.flatMap(m => this.keySources(m));
        const runOptions: AIImageRunOptions = {
            ContextUser: params.ContextUser,
            APIKeys: BuildImageGenerationAPIKeys(sources, params.RuntimeAPIKeyResolver, params.CredentialScope)
        };
        if (params.CredentialScope) {
            runOptions.CredentialScope = params.CredentialScope;
        }
        if (pinned) {
            runOptions.ModelID = pinned.ID;
        }
        const agentId = this.contextAgentID(params);
        if (agentId) {
            runOptions.AgentID = agentId;
        }
        return { PinnedModel: pinned, RunOptions: runOptions };
    }

    /** The active image models, highest PowerRank first. */
    private activeImageModels(): MJAIModelEntityExtended[] {
        const models = AIEngineBase.Instance.Models.filter(
            m => m.AIModelType?.toLowerCase() === 'image generator' && m.IsActive
        );
        if (models.length === 0) {
            throw new Error('No active image generator models found');
        }
        return [...models].sort((a, b) => (b.PowerRank || 0) - (a.PowerRank || 0));
    }

    /** The image model the caller named, by name or API name. */
    private findNamedModel(models: MJAIModelEntityExtended[], modelName: string): MJAIModelEntityExtended {
        const wanted = modelName.toLowerCase();
        const found = models.find(m => m.Name.toLowerCase() === wanted || (m.APIName && m.APIName.toLowerCase() === wanted));
        if (!found) {
            throw new Error(`Image generator model '${modelName}' not found`);
        }
        return found;
    }

    /** The named model's key sources. A named model with no active inference provider cannot run. */
    private pinnedKeySources(model: MJAIModelEntityExtended): ImageGenerationKeySource[] {
        const sources = this.keySources(model);
        if (sources.length === 0) {
            throw new Error(`No active inference provider found for model '${model.Name}'`);
        }
        return sources;
    }

    /**
     * A model's active inference vendors, in the order the runner tries them (Priority, highest
     * first), each with the driver class the runner builds for it.
     */
    private keySources(model: MJAIModelEntityExtended): ImageGenerationKeySource[] {
        return model.ModelVendors
            .filter(mv => mv.Status === 'Active' && AIEngineBase.Instance.IsInferenceProvider(mv) && (mv.DriverClass || model.DriverClass))
            .sort((a, b) => (b.Priority || 0) - (a.Priority || 0))
            .map(mv => ({
                DriverClass: mv.DriverClass || model.DriverClass,
                VendorName: AIEngineBase.Instance.Vendors.find(v => UUIDsEqual(v.ID, mv.VendorID))?.Name
            }));
    }

    /** The calling agent's ID, which BaseAgent stamps on the action's context. */
    private contextAgentID(params: RunActionParams): string | undefined {
        const context = params.Context as Record<string, unknown> | undefined;
        const agentId = context?.AgentID;
        return typeof agentId === 'string' && agentId.trim().length > 0 ? agentId : undefined;
    }

    /** Runs the edit when a source image is given, otherwise the generation. */
    private runImageOperation(params: RunActionParams, prompt: string, runOptions: AIImageRunOptions): Promise<AIImageRunResult> {
        const numberOfImages = this.getNumberParam(params, 'numberofimages', 1);
        const size = this.getParamValue(params, 'size') || '1024x1024';
        const outputFormat = this.getParamValue(params, 'outputformat') || 'base64';
        const negativePrompt = this.getParamValue(params, 'negativeprompt');
        const sourceImage = this.getParamValue(params, 'sourceimage');
        if (sourceImage) {
            // Image-to-image: use EditImage when source image is provided
            const mask = this.getParamValue(params, 'mask');
            return this.executeImageEdit(runOptions, { prompt, sourceImage, mask, numberOfImages, size, outputFormat, negativePrompt });
        }
        const quality = this.getParamValue(params, 'quality');
        const style = this.getParamValue(params, 'style');
        return this.executeImageGeneration(runOptions, { prompt, numberOfImages, size, outputFormat, quality, style, negativePrompt });
    }

    /** Maps the runner's result onto the action's result codes and output params. */
    private toActionResult(params: RunActionParams, runResult: AIImageRunResult, modelName: string): ActionResultSimple {
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

        this.addOutputParams(params, result, modelName);

        // Build response - NOTE: images data is in output params, not in Message
        // This keeps Message lightweight for LLM context (base64 images are ~700K tokens each)
        const responseData = {
            message: `Successfully generated ${result.images.length} image(s)`,
            model: modelName,
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
    }

    /** Adds the Images, ImageCount, RevisedPrompt and ModelUsed output params. */
    private addOutputParams(params: RunActionParams, result: ImageGenerationResult, modelName: string): void {
        params.Params.push({
            Name: 'Images',
            Type: 'Output',
            Value: result.images.map((img, index) => this.formatImageOutput(img, index))
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
            Value: modelName
        });
    }

    /**
     * Execute text-to-image generation through the image runner
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
     * Execute image-to-image editing through the image runner
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