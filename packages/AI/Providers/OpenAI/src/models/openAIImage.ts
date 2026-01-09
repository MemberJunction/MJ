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
 * OpenAI DALL-E implementation of the BaseImageGenerator class.
 * Supports DALL-E 2 and DALL-E 3 models for image generation.
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
     * Generate image(s) from a text prompt using DALL-E
     */
    public async GenerateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
        const startTime = new Date();

        try {
            const openAIParams = this.buildGenerationParams(params);
            const response = await this._openAI.images.generate(openAIParams);

            return this.processGenerationResponse(response, startTime, params);
        } catch (error) {
            return this.handleError(error, startTime);
        }
    }

    /**
     * Edit an existing image using DALL-E 2 inpainting
     * Note: DALL-E 3 does not support image editing
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
                model: params.model || 'dall-e-2',
                n: params.n || 1,
                size: this.normalizeSize(params.size) as '256x256' | '512x512' | '1024x1024',
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
     * Create variations of an existing image using DALL-E 2
     * Note: DALL-E 3 does not support image variations
     */
    public async CreateVariation(params: ImageVariationParams): Promise<ImageGenerationResult> {
        const startTime = new Date();

        try {
            const imageInput = await this.normalizeImageInput(params.image);

            // Create File object for OpenAI API
            const imageFile = new File([imageInput.buffer], 'image.png', { type: 'image/png' });

            const openAIParams: OpenAI.Images.ImageCreateVariationParams = {
                image: imageFile,
                model: params.model || 'dall-e-2',
                n: params.n || 1,
                size: this.normalizeSize(params.size) as '256x256' | '512x512' | '1024x1024',
                response_format: params.outputFormat === 'url' ? 'url' : 'b64_json'
            };

            const response = await this._openAI.images.createVariation(openAIParams);

            return this.processVariationResponse(response, startTime, params);
        } catch (error) {
            return this.handleError(error, startTime);
        }
    }

    /**
     * Get available DALL-E models
     */
    public async GetModels(): Promise<ImageModelInfo[]> {
        // OpenAI doesn't have a list models endpoint for images,
        // so we return the known DALL-E models
        return [
            {
                id: 'dall-e-3',
                name: 'DALL-E 3',
                description: 'The latest and most capable DALL-E model. Creates highly detailed and accurate images.',
                supportedSizes: ['1024x1024', '1024x1792', '1792x1024'],
                maxImages: 1, // DALL-E 3 only supports n=1
                supportsEditing: false,
                supportsVariations: false,
                supportsNegativePrompt: false,
                supportsSeed: false
            },
            {
                id: 'dall-e-2',
                name: 'DALL-E 2',
                description: 'Previous generation DALL-E model. Supports editing and variations.',
                supportedSizes: ['256x256', '512x512', '1024x1024'],
                maxImages: 10,
                supportsEditing: true,
                supportsVariations: true,
                supportsNegativePrompt: false,
                supportsSeed: false
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
        const model = params.model || 'dall-e-3';
        const isDallE3 = model.includes('dall-e-3');

        const openAIParams: OpenAI.Images.ImageGenerateParams = {
            prompt: params.prompt,
            model: model,
            n: isDallE3 ? 1 : (params.n || 1), // DALL-E 3 only supports n=1
            size: this.normalizeSize(params.size, isDallE3) as OpenAI.Images.ImageGenerateParams['size'],
            response_format: params.outputFormat === 'url' ? 'url' : 'b64_json'
        };

        // DALL-E 3 specific parameters
        if (isDallE3) {
            if (params.quality) {
                openAIParams.quality = params.quality === 'hd' ? 'hd' : 'standard';
            }
            if (params.style) {
                openAIParams.style = params.style === 'natural' ? 'natural' : 'vivid';
            }
        }

        if (params.user) {
            openAIParams.user = params.user;
        }

        return openAIParams;
    }

    /**
     * Normalize size parameter to OpenAI-supported sizes
     */
    private normalizeSize(size: string | undefined, isDallE3: boolean = false): string {
        if (!size) {
            return '1024x1024';
        }

        // DALL-E 3 supported sizes
        if (isDallE3) {
            const dallE3Sizes = ['1024x1024', '1024x1792', '1792x1024'];
            if (dallE3Sizes.includes(size)) {
                return size;
            }
            // Map common aspect ratios
            if (size.includes('portrait') || size === '9:16') {
                return '1024x1792';
            }
            if (size.includes('landscape') || size === '16:9') {
                return '1792x1024';
            }
            return '1024x1024';
        }

        // DALL-E 2 supported sizes
        const dallE2Sizes = ['256x256', '512x512', '1024x1024'];
        if (dallE2Sizes.includes(size)) {
            return size;
        }

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
            const [width, height] = size.split('x').map(Number);
            if (!isNaN(width) && !isNaN(height)) {
                generatedImage.width = width;
                generatedImage.height = height;
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
