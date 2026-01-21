import { RegisterClass } from '@memberjunction/global';
import {
    BaseImageGenerator,
    ImageGenerationParams,
    ImageGenerationResult,
    ImageEditParams,
    ImageVariationParams,
    ImageModelInfo,
    GeneratedImage,
    ErrorAnalyzer
} from "@memberjunction/ai";
import OpenAI from "openai";
import { type Uploadable } from "openai";

/**
 * Extended image generation params for GPT Image models (gpt-image-1, gpt-image-1.5).
 * The OpenAI SDK v5.x doesn't include these types yet, so we define them locally.
 * These match the OpenAI API spec for GPT Image models introduced in 2025.
 */
interface GptImageGenerateParams {
    prompt: string;
    model: string;
    n?: number;
    size?: string;
    output_format?: 'png' | 'jpeg' | 'webp';
    quality?: 'high' | 'medium' | 'low';
    user?: string;
}

/**
 * Extended image edit params for GPT Image models.
 */
interface GptImageEditParams {
    image: Uploadable;
    prompt: string;
    model: string;
    n?: number;
    size?: string;
    output_format?: 'png' | 'jpeg' | 'webp';
    mask?: Uploadable;
}

/**
 * Extended image variation params for GPT Image models.
 */
interface GptImageVariationParams {
    image: Uploadable;
    model: string;
    n?: number;
    size?: string;
    output_format?: 'png' | 'jpeg' | 'webp';
}

/**
 * OpenAI GPT-4o Image implementation of the BaseImageGenerator class.
 * Supports gpt-image-1.5 (December 2025) for native multimodal image generation.
 *
 * This replaces the older DALL-E models with OpenAI's GPT-4o native image generation
 * capabilities, which produce higher quality results through the ChatGPT API.
 */
@RegisterClass(BaseImageGenerator, 'OpenAIImageGenerator')
export class OpenAIImageGenerator extends BaseImageGenerator {
    private _openAI: OpenAI;

    constructor(apiKey: string, baseURL?: string) {
        super(apiKey);

        const params: Record<string, string> = { apiKey };
        if (baseURL && baseURL.length > 0) {
            params.baseURL = baseURL;
        }
        this._openAI = new OpenAI(params);
    }

    /**
     * Read-only getter for the OpenAI client instance
     */
    public get OpenAI(): OpenAI {
        return this._openAI;
    }

    /**
     * Generate image(s) from a text prompt using GPT-4o Image Generation
     */
    public async GenerateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
        const startTime = new Date();

        try {
            const openAIParams = this.buildGenerationParams(params);

            // The OpenAI SDK v5.x types don't include GPT Image model parameters (output_format, etc.)
            // but the API accepts them. We cast here at the API boundary since we've validated
            // our params match the actual API spec. SDK v6.x includes proper GPT Image types.
            const response = await this._openAI.images.generate(
                openAIParams as OpenAI.Images.ImageGenerateParams
            );

            // Handle the response - ensure it's not a stream
            if ('data' in response) {
                return this.processGenerationResponse(response, startTime, params);
            } else {
                return this.createErrorResult(startTime, 'Unexpected streaming response from OpenAI');
            }
        } catch (error) {
            return this.handleError(error, startTime);
        }
    }

    /**
     * Edit an existing image.
     * Note: GPT-4o Image models support image editing through the chat interface with vision.
     * This method uses the images.edit endpoint for supported operations.
     */
    public async EditImage(params: ImageEditParams): Promise<ImageGenerationResult> {
        const startTime = new Date();

        try {
            const imageInput = await this.normalizeImageInput(params.image);
            const maskInput = params.mask ? await this.normalizeImageInput(params.mask) : undefined;

            // Create File objects for OpenAI API
            const imageFile = new File([imageInput.buffer], 'image.png', { type: 'image/png' });
            const maskFile = maskInput
                ? new File([maskInput.buffer], 'mask.png', { type: 'image/png' })
                : undefined;

            const openAIParams = this.buildEditParams(params, imageFile, maskFile);

            // Cast at API boundary - see comment in GenerateImage for rationale
            const response = await this._openAI.images.edit(
                openAIParams as OpenAI.Images.ImageEditParams
            );

            // Handle the response - ensure it's not a stream
            if ('data' in response) {
                return this.processEditResponse(response, startTime, params);
            } else {
                return this.createErrorResult(startTime, 'Unexpected streaming response from OpenAI');
            }
        } catch (error) {
            return this.handleError(error, startTime);
        }
    }

    /**
     * Build edit params for either GPT Image or DALL-E models
     */
    private buildEditParams(
        params: ImageEditParams,
        imageFile: File,
        maskFile?: File
    ): GptImageEditParams | OpenAI.Images.ImageEditParams {
        const model = params.model || 'gpt-image-1.5';

        if (this.isGptImageModel(model)) {
            const gptParams: GptImageEditParams = {
                image: imageFile,
                prompt: params.prompt,
                model: model,
                n: params.n || 1,
                size: this.normalizeSize(params.size),
                output_format: 'png'
            };
            if (maskFile) {
                gptParams.mask = maskFile;
            }
            return gptParams;
        } else {
            const dalleParams: OpenAI.Images.ImageEditParams = {
                image: imageFile,
                prompt: params.prompt,
                model: model,
                n: params.n || 1,
                size: this.normalizeSize(params.size) as OpenAI.Images.ImageEditParams['size'],
                response_format: params.outputFormat === 'url' ? 'url' : 'b64_json'
            };
            if (maskFile) {
                dalleParams.mask = maskFile;
            }
            return dalleParams;
        }
    }

    /**
     * Create variations of an existing image.
     * Uses GPT-4o's multimodal capabilities to generate variations.
     */
    public async CreateVariation(params: ImageVariationParams): Promise<ImageGenerationResult> {
        const startTime = new Date();

        try {
            const imageInput = await this.normalizeImageInput(params.image);

            // Create File object for OpenAI API
            const imageFile = new File([imageInput.buffer], 'image.png', { type: 'image/png' });

            const openAIParams = this.buildVariationParams(params, imageFile);

            // Cast at API boundary - see comment in GenerateImage for rationale
            const response = await this._openAI.images.createVariation(
                openAIParams as OpenAI.Images.ImageCreateVariationParams
            );

            return this.processVariationResponse(response, startTime, params);
        } catch (error) {
            return this.handleError(error, startTime);
        }
    }

    /**
     * Build variation params for either GPT Image or DALL-E models
     */
    private buildVariationParams(
        params: ImageVariationParams,
        imageFile: File
    ): GptImageVariationParams | OpenAI.Images.ImageCreateVariationParams {
        const model = params.model || 'gpt-image-1.5';
        const variationSize = this.normalizeVariationSize(params.size);

        if (this.isGptImageModel(model)) {
            return {
                image: imageFile,
                model: model,
                n: params.n || 1,
                size: variationSize,
                output_format: 'png'
            };
        } else {
            return {
                image: imageFile,
                model: model,
                n: params.n || 1,
                size: variationSize as OpenAI.Images.ImageCreateVariationParams['size'],
                response_format: params.outputFormat === 'url' ? 'url' : 'b64_json'
            };
        }
    }

    /**
     * Get available GPT-4o Image models
     */
    public async GetModels(): Promise<ImageModelInfo[]> {
        return [
            {
                id: 'gpt-image-1.5',
                name: 'GPT-4o Image 1.5',
                description: 'OpenAI\'s latest native multimodal image generation model (December 2025). High quality image generation through GPT-4o architecture.',
                supportedSizes: ['1024x1024', '1536x1024', '1024x1536', '2048x2048', 'auto'],
                maxImages: 4,
                supportsEditing: true,
                supportsVariations: true,
                supportsNegativePrompt: false,
                supportsSeed: true
            },
            {
                id: 'gpt-image-1',
                name: 'GPT-4o Image 1.0',
                description: 'OpenAI\'s GPT-4o native image generation model (April 2025). Multimodal image generation.',
                supportedSizes: ['1024x1024', '1536x1024', '1024x1536', 'auto'],
                maxImages: 4,
                supportsEditing: true,
                supportsVariations: true,
                supportsNegativePrompt: false,
                supportsSeed: true
            }
        ];
    }

    /**
     * Get supported methods for this provider
     */
    public async GetSupportedMethods(): Promise<string[]> {
        return ['GenerateImage', 'EditImage', 'CreateVariation', 'GetModels'];
    }

    /**
     * Build OpenAI-specific generation parameters.
     * Returns either GPT Image params or DALL-E params based on model.
     */
    private buildGenerationParams(params: ImageGenerationParams): GptImageGenerateParams | OpenAI.Images.ImageGenerateParams {
        const model = params.model || 'gpt-image-1.5';

        if (this.isGptImageModel(model)) {
            return this.buildGptImageGenerateParams(params, model);
        } else {
            return this.buildDalleGenerateParams(params, model);
        }
    }

    /**
     * Build params for GPT Image models (gpt-image-1, gpt-image-1.5)
     */
    private buildGptImageGenerateParams(params: ImageGenerationParams, model: string): GptImageGenerateParams {
        const gptParams: GptImageGenerateParams = {
            prompt: params.prompt,
            model: model,
            n: params.n || 1,
            size: this.normalizeSize(params.size),
            output_format: 'png'
        };

        // GPT Image models use: high, medium, low
        if (params.quality) {
            gptParams.quality = params.quality === 'hd' ? 'high' : 'medium';
        }

        if (params.user) {
            gptParams.user = params.user;
        }

        return gptParams;
    }

    /**
     * Build params for DALL-E models (dall-e-2, dall-e-3)
     */
    private buildDalleGenerateParams(params: ImageGenerationParams, model: string): OpenAI.Images.ImageGenerateParams {
        const dalleParams: OpenAI.Images.ImageGenerateParams = {
            prompt: params.prompt,
            model: model,
            n: params.n || 1,
            size: this.normalizeSize(params.size) as OpenAI.Images.ImageGenerateParams['size'],
            response_format: params.outputFormat === 'url' ? 'url' : 'b64_json'
        };

        // DALL-E models use: hd, standard
        if (params.quality) {
            dalleParams.quality = params.quality === 'hd' ? 'hd' : 'standard';
        }

        // Style parameter (DALL-E 3 only)
        if (params.style) {
            dalleParams.style = params.style === 'natural' ? 'natural' : 'vivid';
        }

        if (params.user) {
            dalleParams.user = params.user;
        }

        return dalleParams;
    }

    /**
     * Check if the model is a GPT Image model
     */
    private isGptImageModel(model: string): boolean {
        return model.startsWith('gpt-image');
    }

    /**
     * Normalize size parameter to OpenAI-supported sizes for GPT-4o Image
     */
    private normalizeSize(size: string | undefined): string {
        if (!size) {
            return '1024x1024';
        }

        // GPT-4o Image supported sizes
        const supportedSizes = ['1024x1024', '1536x1024', '1024x1536', '2048x2048', 'auto'];
        if (supportedSizes.includes(size)) {
            return size;
        }

        // Map common aspect ratios
        if (size.includes('portrait') || size === '9:16') {
            return '1024x1536';
        }
        if (size.includes('landscape') || size === '16:9') {
            return '1536x1024';
        }
        if (size.includes('2k') || size.includes('2048')) {
            return '2048x2048';
        }

        return '1024x1024';
    }

    /**
     * Normalize size for variation API which only supports limited sizes
     */
    private normalizeVariationSize(size: string | undefined): '256x256' | '512x512' | '1024x1024' {
        if (!size) {
            return '1024x1024';
        }

        // Variation API only supports these sizes
        if (size === '256x256' || size === '512x512' || size === '1024x1024') {
            return size;
        }

        // Default to largest supported size
        return '1024x1024';
    }

    /**
     * Process the generation API response into our result type
     */
    private processGenerationResponse(
        response: OpenAI.Images.ImagesResponse,
        startTime: Date,
        params: ImageGenerationParams
    ): ImageGenerationResult {
        const result = this.createSuccessResult(startTime, []);

        for (let i = 0; i < response.data.length; i++) {
            const imageData = response.data[i];
            const generatedImage = new GeneratedImage();

            if (imageData.b64_json) {
                generatedImage.base64 = imageData.b64_json;
                generatedImage.data = Buffer.from(imageData.b64_json, 'base64');
            }

            if (imageData.url) {
                generatedImage.url = imageData.url;
            }

            if (imageData.revised_prompt) {
                result.revisedPrompt = imageData.revised_prompt;
            }

            generatedImage.format = 'png';
            generatedImage.index = i;

            // Parse size for dimensions
            const size = params.size || '1024x1024';
            if (size !== 'auto') {
                const [width, height] = size.split('x').map(Number);
                if (!isNaN(width) && !isNaN(height)) {
                    generatedImage.width = width;
                    generatedImage.height = height;
                }
            }

            result.images.push(generatedImage);
        }

        return result;
    }

    /**
     * Process the edit API response
     */
    private processEditResponse(
        response: OpenAI.Images.ImagesResponse,
        startTime: Date,
        params: ImageEditParams
    ): ImageGenerationResult {
        const result = this.createSuccessResult(startTime, []);

        for (let i = 0; i < response.data.length; i++) {
            const imageData = response.data[i];
            const generatedImage = new GeneratedImage();

            if (imageData.b64_json) {
                generatedImage.base64 = imageData.b64_json;
                generatedImage.data = Buffer.from(imageData.b64_json, 'base64');
            }

            if (imageData.url) {
                generatedImage.url = imageData.url;
            }

            generatedImage.format = 'png';
            generatedImage.index = i;

            result.images.push(generatedImage);
        }

        return result;
    }

    /**
     * Process the variation API response
     */
    private processVariationResponse(
        response: OpenAI.Images.ImagesResponse,
        startTime: Date,
        params: ImageVariationParams
    ): ImageGenerationResult {
        const result = this.createSuccessResult(startTime, []);

        for (let i = 0; i < response.data.length; i++) {
            const imageData = response.data[i];
            const generatedImage = new GeneratedImage();

            if (imageData.b64_json) {
                generatedImage.base64 = imageData.b64_json;
                generatedImage.data = Buffer.from(imageData.b64_json, 'base64');
            }

            if (imageData.url) {
                generatedImage.url = imageData.url;
            }

            generatedImage.format = 'png';
            generatedImage.index = i;

            result.images.push(generatedImage);
        }

        return result;
    }

    /**
     * Handle errors and create error result
     */
    private handleError(error: unknown, startTime: Date): ImageGenerationResult {
        const errorInfo = ErrorAnalyzer.analyzeError(error, 'OpenAI');
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        console.error('OpenAI Image Generation error:', errorMessage, errorInfo);

        const result = this.createErrorResult(startTime, errorMessage);
        result.errorInfo = errorInfo;

        return result;
    }
}

/**
 * Prevents tree-shaking from removing this class
 */
export function LoadOpenAIImageGenerator() {
    // This function intentionally does nothing
}
