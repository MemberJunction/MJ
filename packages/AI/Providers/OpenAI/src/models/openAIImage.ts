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
            const response = await this._openAI.images.generate(openAIParams);

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

            const openAIParams: OpenAI.Images.ImageEditParams = {
                image: imageFile,
                prompt: params.prompt,
                model: params.model || 'gpt-image-1.5',
                n: params.n || 1,
                size: this.normalizeSize(params.size) as '1024x1024' | '1536x1024' | '1024x1536' | 'auto',
                response_format: params.outputFormat === 'url' ? 'url' : 'b64_json'
            };

            if (maskInput) {
                const maskFile = new File([maskInput.buffer], 'mask.png', { type: 'image/png' });
                openAIParams.mask = maskFile;
            }

            const response = await this._openAI.images.edit(openAIParams);

            return this.processEditResponse(response, startTime, params);
        } catch (error) {
            return this.handleError(error, startTime);
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

            // Note: The variations API only supports limited sizes
            const variationSize = this.normalizeVariationSize(params.size);

            const openAIParams: OpenAI.Images.ImageCreateVariationParams = {
                image: imageFile,
                model: params.model || 'gpt-image-1.5',
                n: params.n || 1,
                size: variationSize,
                response_format: params.outputFormat === 'url' ? 'url' : 'b64_json'
            };

            const response = await this._openAI.images.createVariation(openAIParams);

            return this.processVariationResponse(response, startTime, params);
        } catch (error) {
            return this.handleError(error, startTime);
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
     * Build OpenAI-specific generation parameters
     */
    private buildGenerationParams(params: ImageGenerationParams): OpenAI.Images.ImageGenerateParams {
        const model = params.model || 'gpt-image-1.5';

        const openAIParams: OpenAI.Images.ImageGenerateParams = {
            prompt: params.prompt,
            model: model,
            n: params.n || 1,
            size: this.normalizeSize(params.size) as OpenAI.Images.ImageGenerateParams['size'],
            response_format: params.outputFormat === 'url' ? 'url' : 'b64_json'
        };

        // Quality parameter for HD output
        if (params.quality) {
            openAIParams.quality = params.quality === 'hd' ? 'hd' : 'standard';
        }

        // Style parameter
        if (params.style) {
            openAIParams.style = params.style === 'natural' ? 'natural' : 'vivid';
        }

        if (params.user) {
            openAIParams.user = params.user;
        }

        return openAIParams;
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
