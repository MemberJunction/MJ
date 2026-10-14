import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";
import { RegisterClass } from "@memberjunction/global";
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

/**
 * The model used when a caller pins none. Google's Stable ID for Nano Banana Pro; the `gemini-3-pro-image-preview`
 * ID it replaces still answers as of 2026-10 but is no longer the documented one. Callers that go through MJ's AI
 * model catalog (the image runner, Generate Image) pin a model and never see this default.
 */
const DEFAULT_IMAGE_MODEL = 'gemini-3-pro-image';

/**
 * Google Gemini image models (the Nano Banana family) implementation of the BaseImageGenerator class.
 * Supports Google's most advanced image generation model with 2K/4K resolution support.
 *
 * Default model: gemini-3-pro-image (Nano Banana Pro, Stable); the catalog pins others — gemini-nano-banana-2.1,
 * gemini-3.1-flash-image (Nano Banana 2), gemini-3.1-flash-lite-image (Nano Banana 2 Lite). The -preview ID is legacy.
 * - Native multimodal image generation
 * - High resolution output (up to 4K)
 * - Advanced style control and prompt understanding
 */
@RegisterClass(BaseImageGenerator, 'GeminiImageGenerator')
export class GeminiImageGenerator extends BaseImageGenerator {
    protected _gemini: GoogleGenAI | null = null;
    private _geminiPromise: Promise<GoogleGenAI> | null = null;

    constructor(apiKey: string) {
        super(apiKey);
    }

    /**
     * Factory method to create the GoogleGenAI client instance.
     * Subclasses can override this to provide custom configuration.
     */
    protected async createClient(): Promise<GoogleGenAI> {
        return new GoogleGenAI({ apiKey: this.apiKey });
    }

    /**
     * Ensure the Gemini client is initialized before use.
     */
    private async ensureGeminiClient(): Promise<GoogleGenAI> {
        if (this._gemini) {
            return this._gemini;
        }

        if (!this._geminiPromise) {
            this._geminiPromise = this.createClient();
        }

        this._gemini = await this._geminiPromise;
        return this._gemini;
    }

    /**
     * Generate image(s) from a text prompt using Gemini 3 Pro Image (Nano Banana Pro).
     */
    public async GenerateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
        const startTime = new Date();

        try {
            const client = await this.ensureGeminiClient();
            const modelName = params.model || DEFAULT_IMAGE_MODEL;

            // Build the generation config
            const generateConfig = this.buildGenerationConfig(params);

            // Generate images
            const images: GeneratedImage[] = [];
            const numImages = params.n || 1;

            // Generate images one at a time for consistency
            for (let i = 0; i < numImages; i++) {
                const response = await client.models.generateContent({
                    model: modelName,
                    contents: params.prompt,
                    config: generateConfig
                });

                const generatedImage = this.extractImageFromResponse(response, i, params);
                if (generatedImage) {
                    images.push(generatedImage);
                }
            }

            if (images.length === 0) {
                return this.createErrorResult(startTime, 'No images were generated');
            }

            return this.createSuccessResult(startTime, images);
        } catch (error) {
            return this.handleError(error, startTime);
        }
    }

    /**
     * Edit an existing image using Gemini's multimodal capabilities.
     * Uses image-to-image generation with the original image as context.
     */
    public async EditImage(params: ImageEditParams): Promise<ImageGenerationResult> {
        const startTime = new Date();

        try {
            const client = await this.ensureGeminiClient();
            const modelName = params.model || DEFAULT_IMAGE_MODEL;

            // Normalize the input image
            const imageInput = await this.normalizeImageInput(params.image);

            // Build multimodal content with the image and edit prompt
            const content = [
                {
                    inlineData: {
                        data: imageInput.base64,
                        mimeType: 'image/png'
                    }
                },
                {
                    text: `Edit this image: ${params.prompt}`
                }
            ];

            const generateConfig = this.buildGenerationConfig({
                ...params,
                prompt: params.prompt
            } as ImageGenerationParams);

            const response = await client.models.generateContent({
                model: modelName,
                contents: content,
                config: generateConfig
            });

            const generatedImage = this.extractImageFromResponse(response, 0, params as unknown as ImageGenerationParams);
            if (!generatedImage) {
                return this.createErrorResult(startTime, 'Image editing did not produce a result');
            }

            return this.createSuccessResult(startTime, [generatedImage]);
        } catch (error) {
            return this.handleError(error, startTime);
        }
    }

    /**
     * Create variations of an existing image.
     * Uses the original image as context with a variation prompt.
     */
    public async CreateVariation(params: ImageVariationParams): Promise<ImageGenerationResult> {
        const startTime = new Date();

        try {
            const client = await this.ensureGeminiClient();
            const modelName = params.model || DEFAULT_IMAGE_MODEL;

            // Normalize the input image
            const imageInput = await this.normalizeImageInput(params.image);

            const variationPrompt = params.prompt || 'Create a variation of this image with similar style and content but with subtle creative differences';

            // Build multimodal content with the image and variation prompt
            const content = [
                {
                    inlineData: {
                        data: imageInput.base64,
                        mimeType: 'image/png'
                    }
                },
                {
                    text: variationPrompt
                }
            ];

            const generateConfig = this.buildGenerationConfig({
                ...params,
                prompt: variationPrompt
            } as ImageGenerationParams);

            const images: GeneratedImage[] = [];
            const numVariations = params.n || 1;

            for (let i = 0; i < numVariations; i++) {
                const response = await client.models.generateContent({
                    model: modelName,
                    contents: content,
                    config: generateConfig
                });

                const generatedImage = this.extractImageFromResponse(response, i, params as unknown as ImageGenerationParams);
                if (generatedImage) {
                    images.push(generatedImage);
                }
            }

            if (images.length === 0) {
                return this.createErrorResult(startTime, 'No image variations were generated');
            }

            return this.createSuccessResult(startTime, images);
        } catch (error) {
            return this.handleError(error, startTime);
        }
    }

    /**
     * Get available Gemini image generation models.
     */
    public async GetModels(): Promise<ImageModelInfo[]> {
        const sizes = ['1024x1024', '1536x1024', '1024x1536', '2048x2048', '3840x2160', '2160x3840'];
        return [
            {
                id: 'gemini-3-pro-image',
                name: 'Nano Banana Pro (Gemini 3 Pro Image)',
                description: 'Google\'s state-of-the-art image generation and editing model. 1K, 2K and 4K output; reference objects, character and style references; negative prompts and seeds.',
                supportedSizes: sizes,
                maxImages: 4,
                supportsEditing: true,
                supportsVariations: true,
                supportsNegativePrompt: true,
                supportsSeed: true
            },
            {
                id: 'gemini-nano-banana-2.1',
                name: 'Nano Banana 2.1',
                description: 'Google\'s current high-efficiency image generation and editing model (October 2026): better visual quality, typography and multi-turn consistency than Nano Banana 2. 1K, 2K and 4K output.',
                supportedSizes: sizes,
                maxImages: 4,
                supportsEditing: true,
                supportsVariations: true,
                supportsNegativePrompt: true,
                supportsSeed: true
            },
            {
                id: 'gemini-3.1-flash-image',
                name: 'Nano Banana 2 (Gemini 3.1 Flash Image)',
                description: 'High-efficiency image generation and editing optimized for speed and volume (February 2026). 0.5K, 1K, 2K and 4K output; up to 14 reference images. Succeeded by Nano Banana 2.1.',
                supportedSizes: ['512x512', ...sizes],
                maxImages: 4,
                supportsEditing: true,
                supportsVariations: true,
                supportsNegativePrompt: true,
                supportsSeed: true
            },
            {
                id: 'gemini-3.1-flash-lite-image',
                name: 'Nano Banana 2 Lite (Gemini 3.1 Flash Lite Image)',
                description: 'Ultra-low-latency, cost-effective image generation and editing for high-volume interactive use (June 2026). 1K output only; not optimized for multiple reference inputs or multi-turn editing.',
                supportedSizes: ['1024x1024', '1536x1024', '1024x1536'],
                maxImages: 4,
                supportsEditing: true,
                supportsVariations: false,
                supportsNegativePrompt: true,
                supportsSeed: true
            },
            {
                id: 'gemini-3-pro-image-preview',
                name: 'Nano Banana Pro (legacy preview ID)',
                description: 'The pre-Stable ID for Nano Banana Pro. Still answers as of October 2026; prefer gemini-3-pro-image.',
                supportedSizes: sizes,
                maxImages: 4,
                supportsEditing: true,
                supportsVariations: true,
                supportsNegativePrompt: true,
                supportsSeed: true
            }
        ];
    }

    /**
     * Get supported methods for this provider.
     */
    public async GetSupportedMethods(): Promise<string[]> {
        return ['GenerateImage', 'EditImage', 'CreateVariation', 'GetModels'];
    }

    /**
     * Build generation config for Gemini API.
     */
    private buildGenerationConfig(params: ImageGenerationParams): Record<string, unknown> {
        const config: Record<string, unknown> = {
            // Request image output modality
            responseModalities: [Modality.IMAGE, Modality.TEXT]
        };

        // Add size/aspect ratio if specified
        if (params.size) {
            const [width, height] = params.size.split('x').map(Number);
            if (!isNaN(width) && !isNaN(height)) {
                // Gemini 3 Pro Image supports explicit dimensions
                config.imageSize = { width, height };

                // Also set aspect ratio for compatibility
                if (width > height) {
                    config.aspectRatio = '16:9';
                } else if (height > width) {
                    config.aspectRatio = '9:16';
                } else {
                    config.aspectRatio = '1:1';
                }
            }
        }

        if (params.aspectRatio) {
            config.aspectRatio = params.aspectRatio;
        }

        // Add negative prompt if supported
        if (params.negativePrompt) {
            config.negativePrompt = params.negativePrompt;
        }

        // Add seed for reproducibility
        if (params.seed !== undefined) {
            config.seed = params.seed;
        }

        // Quality setting
        if (params.quality) {
            config.quality = params.quality;
        }

        // Style setting
        if (params.style) {
            config.style = params.style;
        }

        // Merge any provider-specific options
        if (params.providerOptions) {
            Object.assign(config, params.providerOptions);
        }

        return config;
    }

    /**
     * Extract image data from Gemini response.
     */
    private extractImageFromResponse(
        response: GenerateContentResponse,
        index: number,
        params: ImageGenerationParams
    ): GeneratedImage | null {
        const candidates = response.candidates;
        if (!candidates || candidates.length === 0) {
            return null;
        }

        const candidate = candidates[0];
        if (!candidate.content || !candidate.content.parts) {
            return null;
        }

        // Find the image part in the response
        for (const part of candidate.content.parts) {
            // Check for inline data (base64 image)
            if (part.inlineData && part.inlineData.data) {
                const generatedImage = new GeneratedImage();
                generatedImage.base64 = part.inlineData.data;
                generatedImage.data = Buffer.from(part.inlineData.data, 'base64');
                generatedImage.format = this.getMimeTypeFormat(part.inlineData.mimeType || 'image/png');
                generatedImage.index = index;

                // Set dimensions from params if available
                if (params.size) {
                    const [width, height] = params.size.split('x').map(Number);
                    if (!isNaN(width) && !isNaN(height)) {
                        generatedImage.width = width;
                        generatedImage.height = height;
                    }
                }

                return generatedImage;
            }

            // Check for file data (URL reference)
            if (part.fileData && part.fileData.fileUri) {
                const generatedImage = new GeneratedImage();
                generatedImage.url = part.fileData.fileUri;
                generatedImage.format = this.getMimeTypeFormat(part.fileData.mimeType || 'image/png');
                generatedImage.index = index;
                return generatedImage;
            }
        }

        return null;
    }

    /**
     * Convert MIME type to image format.
     */
    private getMimeTypeFormat(mimeType: string): 'png' | 'jpg' | 'jpeg' | 'webp' | 'gif' {
        if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
            return 'jpeg';
        }
        if (mimeType.includes('webp')) {
            return 'webp';
        }
        if (mimeType.includes('gif')) {
            return 'gif';
        }
        return 'png';
    }

    /**
     * Handle errors and create error result.
     */
    private handleError(error: unknown, startTime: Date): ImageGenerationResult {
        const errorInfo = ErrorAnalyzer.analyzeError(error, 'Gemini');
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        console.error('Gemini Image Generation error:', errorMessage, errorInfo);

        const result = this.createErrorResult(startTime, errorMessage);
        result.errorInfo = errorInfo;

        return result;
    }
}

