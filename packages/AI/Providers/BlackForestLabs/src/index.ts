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
 * Configuration for BFL API polling
 */
interface BFLPollingConfig {
    /** Maximum time to wait for result in milliseconds (default: 120000 = 2 min) */
    maxWaitTime: number;
    /** Interval between status checks in milliseconds (default: 2000 = 2 sec) */
    pollInterval: number;
}

/**
 * BFL API task response
 */
interface BFLTaskResponse {
    id: string;
    status?: string;
}

/**
 * BFL API result response
 */
interface BFLResultResponse {
    id: string;
    status: 'Ready' | 'Pending' | 'Error' | 'Request Moderated' | 'Content Moderated' | 'Task not found';
    result?: {
        sample: string; // URL to the generated image
        prompt?: string;
        seed?: number;
    };
}

/**
 * Black Forest Labs FLUX Image Generator implementation.
 * Supports FLUX.2 Pro, FLUX 1.1 Pro, and other FLUX models via the BFL API.
 *
 * BFL uses an async task-based API:
 * 1. Submit generation request -> get task ID
 * 2. Poll for result until ready
 * 3. Retrieve generated image URL
 */
@RegisterClass(BaseImageGenerator, 'FLUXImageGenerator')
export class FLUXImageGenerator extends BaseImageGenerator {
    private _baseUrl = 'https://api.bfl.ai/v1';
    private _pollingConfig: BFLPollingConfig = {
        maxWaitTime: 120000, // 2 minutes
        pollInterval: 2000   // 2 seconds
    };

    constructor(apiKey: string, baseUrl?: string) {
        super(apiKey);
        if (baseUrl && baseUrl.length > 0) {
            this._baseUrl = baseUrl;
        }
    }

    /**
     * Configure polling behavior for async task completion
     */
    public setPollingConfig(config: Partial<BFLPollingConfig>): void {
        this._pollingConfig = { ...this._pollingConfig, ...config };
    }

    /**
     * Generate image(s) from a text prompt using FLUX models.
     */
    public async GenerateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
        const startTime = new Date();

        try {
            const modelEndpoint = this.getModelEndpoint(params.model || 'flux-2-pro');
            const requestBody = this.buildGenerationRequest(params);

            // Submit generation task
            const taskResponse = await this.submitTask(modelEndpoint, requestBody);

            if (!taskResponse.id) {
                return this.createErrorResult(startTime, 'No task ID returned from BFL API');
            }

            // Poll for result
            const resultResponse = await this.waitForResult(taskResponse.id);

            if (resultResponse.status === 'Error' || resultResponse.status === 'Request Moderated' ||
                resultResponse.status === 'Content Moderated') {
                return this.createErrorResult(startTime, `Generation failed: ${resultResponse.status}`);
            }

            if (!resultResponse.result?.sample) {
                return this.createErrorResult(startTime, 'No image URL in result');
            }

            // Download image and create result
            const generatedImage = await this.downloadImage(resultResponse.result.sample, 0);

            const result = this.createSuccessResult(startTime, [generatedImage]);

            // Include seed if available for reproducibility in metadata
            if (resultResponse.result.seed !== undefined) {
                result.metadata = { seed: resultResponse.result.seed };
            }

            return result;
        } catch (error) {
            return this.handleError(error, startTime);
        }
    }

    /**
     * Edit an existing image using FLUX Fill model.
     * BFL offers FLUX.1 Fill [pro] for inpainting/outpainting operations.
     */
    public async EditImage(params: ImageEditParams): Promise<ImageGenerationResult> {
        const startTime = new Date();

        try {
            // Normalize input images
            const imageInput = await this.normalizeImageInput(params.image);
            const maskInput = params.mask ? await this.normalizeImageInput(params.mask) : undefined;

            // Use FLUX Fill for editing
            const endpoint = '/flux-pro-1.1-fill';

            const requestBody: Record<string, unknown> = {
                prompt: params.prompt,
                image: imageInput.base64,
                output_format: 'png'
            };

            if (maskInput) {
                requestBody.mask = maskInput.base64;
            }

            // Submit task
            const taskResponse = await this.submitTask(endpoint, requestBody);

            if (!taskResponse.id) {
                return this.createErrorResult(startTime, 'No task ID returned from BFL API');
            }

            // Wait for result
            const resultResponse = await this.waitForResult(taskResponse.id);

            if (resultResponse.status !== 'Ready' || !resultResponse.result?.sample) {
                return this.createErrorResult(startTime, `Edit failed: ${resultResponse.status}`);
            }

            const generatedImage = await this.downloadImage(resultResponse.result.sample, 0);

            return this.createSuccessResult(startTime, [generatedImage]);
        } catch (error) {
            return this.handleError(error, startTime);
        }
    }

    /**
     * Create variations of an existing image.
     * Uses image-to-image generation with the original as a reference.
     */
    public async CreateVariation(params: ImageVariationParams): Promise<ImageGenerationResult> {
        const startTime = new Date();

        try {
            const imageInput = await this.normalizeImageInput(params.image);

            // For variations, we use the Kontext model or img2img endpoint
            const endpoint = '/flux-kontext-pro';

            const variationPrompt = params.prompt || 'Create a variation of this image with similar style and content';

            const requestBody: Record<string, unknown> = {
                prompt: variationPrompt,
                image: imageInput.base64,
                output_format: 'png'
            };

            // Submit task
            const taskResponse = await this.submitTask(endpoint, requestBody);

            if (!taskResponse.id) {
                return this.createErrorResult(startTime, 'No task ID returned from BFL API');
            }

            // Wait for result
            const resultResponse = await this.waitForResult(taskResponse.id);

            if (resultResponse.status !== 'Ready' || !resultResponse.result?.sample) {
                return this.createErrorResult(startTime, `Variation failed: ${resultResponse.status}`);
            }

            const generatedImage = await this.downloadImage(resultResponse.result.sample, 0);

            return this.createSuccessResult(startTime, [generatedImage]);
        } catch (error) {
            return this.handleError(error, startTime);
        }
    }

    /**
     * Get available FLUX models.
     */
    public async GetModels(): Promise<ImageModelInfo[]> {
        return [
            {
                id: 'flux-2-pro',
                name: 'FLUX.2 Pro',
                description: 'Black Forest Labs\' most capable model. 32B parameter transformer delivering photorealistic 4MP images with exceptional detail accuracy.',
                supportedSizes: ['1024x1024', '1024x768', '768x1024', '1536x1024', '1024x1536', '2048x2048'],
                maxImages: 1, // BFL API generates one image per request
                supportsEditing: true,
                supportsVariations: true,
                supportsNegativePrompt: false,
                supportsSeed: true
            },
            {
                id: 'flux-1.1-pro',
                name: 'FLUX 1.1 Pro',
                description: 'Production-ready model with excellent quality and fast generation. Well-suited for high-volume workloads.',
                supportedSizes: ['1024x1024', '1024x768', '768x1024', '1536x1024', '1024x1536'],
                maxImages: 1,
                supportsEditing: true,
                supportsVariations: true,
                supportsNegativePrompt: false,
                supportsSeed: true
            },
            {
                id: 'flux-dev',
                name: 'FLUX.1 [dev]',
                description: 'Open-weights 12B parameter model for development and testing.',
                supportedSizes: ['1024x1024', '1024x768', '768x1024'],
                maxImages: 1,
                supportsEditing: false,
                supportsVariations: false,
                supportsNegativePrompt: false,
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
     * Get the API endpoint for a model.
     */
    private getModelEndpoint(model: string): string {
        const modelEndpoints: Record<string, string> = {
            'flux-2-pro': '/flux-pro-2',
            'flux-1.1-pro': '/flux-pro-1.1',
            'flux-pro': '/flux-pro',
            'flux-dev': '/flux-dev',
            'flux-schnell': '/flux-schnell',
            'flux-ultra': '/flux-ultra'
        };

        return modelEndpoints[model.toLowerCase()] || '/flux-pro-1.1';
    }

    /**
     * Build the generation request body.
     */
    private buildGenerationRequest(params: ImageGenerationParams): Record<string, unknown> {
        const request: Record<string, unknown> = {
            prompt: params.prompt,
            output_format: 'png'
        };

        // Handle size/dimensions
        if (params.size) {
            const [width, height] = params.size.split('x').map(Number);
            if (!isNaN(width) && !isNaN(height)) {
                request.width = width;
                request.height = height;
            }
        } else {
            request.width = 1024;
            request.height = 1024;
        }

        // Aspect ratio (if dimensions not set)
        if (params.aspectRatio && !params.size) {
            request.aspect_ratio = params.aspectRatio;
        }

        // Seed for reproducibility
        if (params.seed !== undefined) {
            request.seed = params.seed;
        }

        // Steps (if supported by model)
        if (params.providerOptions?.steps) {
            request.steps = params.providerOptions.steps;
        }

        // Guidance scale
        if (params.providerOptions?.guidance) {
            request.guidance = params.providerOptions.guidance;
        }

        return request;
    }

    /**
     * Submit a task to the BFL API.
     */
    private async submitTask(endpoint: string, body: Record<string, unknown>): Promise<BFLTaskResponse> {
        const response = await fetch(`${this._baseUrl}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Key': this.apiKey
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`BFL API error (${response.status}): ${errorText}`);
        }

        return await response.json() as BFLTaskResponse;
    }

    /**
     * Poll for task completion.
     */
    private async waitForResult(taskId: string): Promise<BFLResultResponse> {
        const startTime = Date.now();

        while (Date.now() - startTime < this._pollingConfig.maxWaitTime) {
            const response = await fetch(`${this._baseUrl}/get_result?id=${taskId}`, {
                method: 'GET',
                headers: {
                    'X-Key': this.apiKey
                }
            });

            if (!response.ok) {
                throw new Error(`BFL API error checking result: ${response.status}`);
            }

            const result = await response.json() as BFLResultResponse;

            if (result.status === 'Ready' || result.status === 'Error' ||
                result.status === 'Request Moderated' || result.status === 'Content Moderated' ||
                result.status === 'Task not found') {
                return result;
            }

            // Wait before next poll
            await this.sleep(this._pollingConfig.pollInterval);
        }

        throw new Error(`Timeout waiting for result after ${this._pollingConfig.maxWaitTime}ms`);
    }

    /**
     * Download an image from URL and convert to GeneratedImage.
     */
    private async downloadImage(url: string, index: number): Promise<GeneratedImage> {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to download image: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');

        const generatedImage = new GeneratedImage();
        generatedImage.data = buffer;
        generatedImage.base64 = base64;
        generatedImage.url = url;
        generatedImage.format = 'png';
        generatedImage.index = index;

        return generatedImage;
    }

    /**
     * Sleep for specified milliseconds.
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Handle errors and create error result.
     */
    private handleError(error: unknown, startTime: Date): ImageGenerationResult {
        const errorInfo = ErrorAnalyzer.analyzeError(error, 'Black Forest Labs');
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        console.error('FLUX Image Generation error:', errorMessage, errorInfo);

        const result = this.createErrorResult(startTime, errorMessage);
        result.errorInfo = errorInfo;

        return result;
    }
}

/**
 * Prevents tree-shaking from removing this class.
 */
export function LoadFLUXImageGenerator() {
    // This function intentionally does nothing
}
