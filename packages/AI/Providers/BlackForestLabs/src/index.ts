import { RegisterClass } from "@memberjunction/global";
import {
    BaseImageGenerator,
    ImageGenerationParams,
    ImageGenerationResult,
    ImageEditParams,
    ImageVariationParams,
    ImageModelInfo,
    GeneratedImage,
    ModelUsage,
    ErrorAnalyzer,
    AbortableDelay,
    IsRequestAborted,
    ThrowIfAborted
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
 * BFL API task response returned by task submission endpoints.
 */
interface BFLTaskResponse {
    id: string;
    polling_url?: string;
    cost?: number | null;
    input_mp?: number | null;
    output_mp?: number | null;
    status?: string;
}

/**
 * BFL API result response returned by `/v1/get_result` or a regional `polling_url`.
 */
interface BFLResultResponse {
    id: string;
    status:
        | 'Ready'
        | 'Pending'
        | 'Reasoning'
        | 'Generating'
        | 'Error'
        | 'Request Moderated'
        | 'Content Moderated'
        | 'No Card Generated'
        | 'Task not found';
    result?: {
        sample: string; // Signed URL to the generated media
        prompt?: string;
        seed?: number;
        start_time?: number;
        end_time?: number;
        duration?: number;
    };
    progress?: number | null;
    details?: Record<string, unknown> | null;
    preview?: Record<string, unknown> | null;
    cost?: number | null;
}

/**
 * Black Forest Labs FLUX Image Generator implementation.
 * Supports FLUX.2 Pro, FLUX 1.1 Pro, and other FLUX models via the BFL API.
 *
 * BFL uses an async task-based API:
 * 1. Submit generation request -> get task ID and regional `polling_url`
 * 2. Poll `polling_url` (or `/get_result`) until ready
 * 3. Retrieve generated image from the signed delivery URL
 *
 * A request's `CancellationToken` is handed to every `fetch` (submit, poll and download), and the
 * wait between polls ends as soon as it aborts, so cancelling a request stops it at once. The call
 * then resolves as cancelled, never as a failure to fail over.
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
    public SetPollingConfig(config: Partial<BFLPollingConfig>): void {
        this._pollingConfig = { ...this._pollingConfig, ...config };
    }

    /** @deprecated Use {@link SetPollingConfig}. */
    public setPollingConfig(config: Partial<BFLPollingConfig>): void {
        return this.SetPollingConfig(config);
    }

    /**
     * Generate image(s) from a text prompt using FLUX models.
     */
    public async GenerateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
        const startTime = new Date();

        try {
            ThrowIfAborted(params.CancellationToken, 'Black Forest Labs');
            const modelEndpoint = this.getModelEndpoint(params.model || 'flux-2-pro');
            const requestBody = this.buildGenerationRequest(params);

            // Submit generation task
            const taskResponse = await this.submitTask(modelEndpoint, requestBody, params.CancellationToken);

            if (!taskResponse.id) {
                return this.createErrorResult(startTime, 'No task ID returned from BFL API');
            }

            // Poll for result using BFL's returned polling_url when present
            const resultResponse = await this.pollForResult(taskResponse, params.CancellationToken);

            if (this.isFailureStatus(resultResponse.status)) {
                return this.createErrorResult(startTime, this.formatFailureMessage('Generation failed', resultResponse));
            }

            if (!resultResponse.result?.sample) {
                return this.createErrorResult(startTime, 'No image URL in result');
            }

            // Download image and create result
            const generatedImage = await this.downloadImage(
                resultResponse.result.sample,
                0,
                params.CancellationToken
            );

            const result = this.createSuccessResult(startTime, [generatedImage]);
            this.applyUsageAndMetadata(result, taskResponse, resultResponse);

            return result;
        } catch (error) {
            return this.handleError(error, startTime, params.CancellationToken);
        }
    }

    /**
     * Edit an existing image using FLUX Fill model.
     * BFL offers FLUX.1 Fill [pro] for inpainting/outpainting operations.
     */
    public async EditImage(params: ImageEditParams): Promise<ImageGenerationResult> {
        const startTime = new Date();

        try {
            ThrowIfAborted(params.CancellationToken, 'Black Forest Labs');
            // Normalize input images
            const imageInput = await this.normalizeImageInput(params.image);
            const maskInput = params.mask ? await this.normalizeImageInput(params.mask) : undefined;

            // Use FLUX.1 Fill [pro] (/v1/flux-pro-1.0-fill) for editing
            const endpoint = '/flux-pro-1.0-fill';

            const requestBody: Record<string, unknown> = {
                prompt: params.prompt,
                image: imageInput.base64,
                output_format: 'png'
            };

            if (maskInput) {
                requestBody.mask = maskInput.base64;
            }

            // Submit task
            const taskResponse = await this.submitTask(endpoint, requestBody, params.CancellationToken);

            if (!taskResponse.id) {
                return this.createErrorResult(startTime, 'No task ID returned from BFL API');
            }

            // Wait for result
            const resultResponse = await this.pollForResult(taskResponse, params.CancellationToken);

            if (resultResponse.status !== 'Ready' || !resultResponse.result?.sample) {
                return this.createErrorResult(startTime, this.formatFailureMessage('Edit failed', resultResponse));
            }

            const generatedImage = await this.downloadImage(resultResponse.result.sample, 0, params.CancellationToken);

            const result = this.createSuccessResult(startTime, [generatedImage]);
            this.applyUsageAndMetadata(result, taskResponse, resultResponse);
            return result;
        } catch (error) {
            return this.handleError(error, startTime, params.CancellationToken);
        }
    }

    /**
     * Create variations of an existing image.
     * Uses image-to-image generation with the original as a reference.
     */
    public async CreateVariation(params: ImageVariationParams): Promise<ImageGenerationResult> {
        const startTime = new Date();

        try {
            ThrowIfAborted(params.CancellationToken, 'Black Forest Labs');
            const imageInput = await this.normalizeImageInput(params.image);

            // For variations, we use the Kontext model or img2img endpoint
            const endpoint = '/flux-kontext-pro';

            const variationPrompt = params.prompt || 'Create a variation of this image with similar style and content';

            const requestBody: Record<string, unknown> = {
                prompt: variationPrompt,
                input_image: imageInput.base64,
                output_format: 'png'
            };

            // Submit task
            const taskResponse = await this.submitTask(endpoint, requestBody, params.CancellationToken);

            if (!taskResponse.id) {
                return this.createErrorResult(startTime, 'No task ID returned from BFL API');
            }

            // Wait for result
            const resultResponse = await this.pollForResult(taskResponse, params.CancellationToken);

            if (resultResponse.status !== 'Ready' || !resultResponse.result?.sample) {
                return this.createErrorResult(startTime, this.formatFailureMessage('Variation failed', resultResponse));
            }

            const generatedImage = await this.downloadImage(resultResponse.result.sample, 0, params.CancellationToken);

            const result = this.createSuccessResult(startTime, [generatedImage]);
            this.applyUsageAndMetadata(result, taskResponse, resultResponse);
            return result;
        } catch (error) {
            return this.handleError(error, startTime, params.CancellationToken);
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
            'flux-2-pro': '/flux-2-pro',
            'flux-1.1-pro': '/flux-pro-1.1',
            'flux-dev': '/flux-dev',
            'flux-ultra': '/flux-pro-1.1-ultra'
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
    private async submitTask(endpoint: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<BFLTaskResponse> {
        const response = await fetch(`${this._baseUrl}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Key': this.apiKey
            },
            body: JSON.stringify(body),
            signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`BFL API error (${response.status}): ${errorText}`);
        }

        return await response.json() as BFLTaskResponse;
    }

    /**
     * Poll for task completion using BFL's returned `polling_url` (or `${this._baseUrl}/get_result?id=${id}`
     * when `polling_url` is omitted). Only an `https://` URL whose hostname ends in `.bfl.ai` is polled.
     * The signal aborts the poll in flight and the wait between polls.
     */
    private async pollForResult(
        task: { id: string; polling_url?: string },
        signal?: AbortSignal
    ): Promise<BFLResultResponse> {
        const startTime = Date.now();
        const pollUrl = this.resolvePollingUrl(task);

        while (Date.now() - startTime < this._pollingConfig.maxWaitTime) {
            const response = await fetch(pollUrl, {
                method: 'GET',
                headers: {
                    'X-Key': this.apiKey
                },
                signal
            });

            if (!response.ok) {
                await response.body?.cancel().catch(() => { /* nothing to drain */ });
                throw new Error(`BFL API error checking result: ${response.status}`);
            }

            const result = await response.json() as BFLResultResponse;

            if (result.status === 'Ready' || this.isFailureStatus(result.status)) {
                return result;
            }

            // Wait before next poll, ending the wait as soon as the request is cancelled
            await AbortableDelay(this._pollingConfig.pollInterval, signal);
        }

        throw new Error(`Timeout waiting for result after ${this._pollingConfig.maxWaitTime}ms`);
    }

    /**
     * Validate and resolve the polling URL for a submitted task. Falls back to
     * `${this._baseUrl}/get_result?id=${id}` only when `polling_url` is missing.
     * Any non-`https:` or non-`.bfl.ai` URL throws without sending the API key.
     */
    private resolvePollingUrl(task: { id: string; polling_url?: string }): string {
        const candidate = task.polling_url ?? `${this._baseUrl}/get_result?id=${task.id}`;
        if (!this.isValidBflPollingUrl(candidate)) {
            throw new Error(`Refusing to poll non-BFL or non-HTTPS URL: ${candidate}`);
        }
        return candidate;
    }

    private isValidBflPollingUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'https:' && parsed.hostname.toLowerCase().endsWith('.bfl.ai');
        } catch {
            return false;
        }
    }

    private isFailureStatus(status: BFLResultResponse['status']): boolean {
        return (
            status === 'Error' ||
            status === 'Request Moderated' ||
            status === 'Content Moderated' ||
            status === 'No Card Generated' ||
            status === 'Task not found'
        );
    }

    private formatFailureMessage(prefix: string, resultResponse: BFLResultResponse): string {
        const reasons = resultResponse.details?.['Moderation Reasons'];
        const reasonText = Array.isArray(reasons)
            ? reasons.map(String).join(', ')
            : typeof reasons === 'string' && reasons.length > 0
                ? reasons
                : undefined;
        return reasonText
            ? `${prefix}: ${resultResponse.status} (${reasonText})`
            : `${prefix}: ${resultResponse.status}`;
    }

    private applyUsageAndMetadata(
        result: ImageGenerationResult,
        taskResponse: BFLTaskResponse,
        resultResponse: BFLResultResponse
    ): void {
        const settledOrSubmitCost = resultResponse.cost ?? taskResponse.cost;
        if (typeof settledOrSubmitCost === 'number') {
            const usage = ModelUsage.ForMedia('Images', 0, 1);
            usage.cost = settledOrSubmitCost / 100;
            usage.costCurrency = 'USD';
            result.usage = usage;
        }

        const metadata: Record<string, unknown> = {};
        if (resultResponse.result?.seed !== undefined) {
            metadata.seed = resultResponse.result.seed;
        }
        if (typeof settledOrSubmitCost === 'number') {
            metadata.cost = settledOrSubmitCost;
        }
        if (Object.keys(metadata).length > 0) {
            result.metadata = metadata;
        }
    }

    /**
     * Download an image from URL and convert to GeneratedImage, inferring `format`
     * from the response `Content-Type` header before falling back to `'png'`.
     */
    private async downloadImage(
        url: string,
        index: number,
        signal?: AbortSignal
    ): Promise<GeneratedImage> {
        const response = await fetch(url, { signal });

        if (!response.ok) {
            await response.body?.cancel().catch(() => { /* nothing to drain */ });
            throw new Error(`Failed to download image: ${response.status}`);
        }

        const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
        let format: GeneratedImage['format'] = 'png';
        if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) {
            format = 'jpeg';
        } else if (contentType.includes('image/png')) {
            format = 'png';
        } else if (contentType.includes('image/webp')) {
            format = 'webp';
        } else if (contentType.includes('image/gif')) {
            format = 'gif';
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');

        const generatedImage = new GeneratedImage();
        generatedImage.data = buffer;
        generatedImage.base64 = base64;
        generatedImage.url = url;
        generatedImage.format = format;
        generatedImage.index = index;

        return generatedImage;
    }

    /**
     * Handle errors and create error result. A request its signal aborted is classified by why it was
     * aborted, not as a provider error: a caller cancellation is reported as cancelled (never failed
     * over), and an abort caused by a timeout as a retriable network error.
     */
    private handleError(error: unknown, startTime: Date, signal?: AbortSignal): ImageGenerationResult {
        if (IsRequestAborted(error, signal)) {
            return this.CancelledResult(signal, error);
        }
        const errorInfo = ErrorAnalyzer.analyzeError(error, 'Black Forest Labs');
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        console.error('FLUX Image Generation error:', errorMessage, errorInfo);

        const result = this.createErrorResult(startTime, errorMessage);
        result.errorInfo = errorInfo;

        return result;
    }
}

