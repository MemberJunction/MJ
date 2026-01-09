import { BaseModel, BaseResult, ModelUsage } from "./baseModel";

/**
 * Represents a single generated image from an image generation request.
 * Supports multiple formats for maximum flexibility with different providers.
 */
export class GeneratedImage {
    /**
     * Raw binary image data. Either data or url will be populated, not both.
     */
    data?: Buffer;

    /**
     * Base64-encoded image data. Convenience representation of the data field.
     * If data is populated, base64 will also be populated with the encoded value.
     */
    base64?: string;

    /**
     * URL to the generated image. Some providers return URLs instead of direct data.
     * Either url or data will be populated, not both.
     * URLs may be temporary and expire after a period of time.
     */
    url?: string;

    /**
     * The image format/encoding
     */
    format: 'png' | 'jpg' | 'jpeg' | 'webp' | 'gif' = 'png';

    /**
     * Width of the generated image in pixels
     */
    width?: number;

    /**
     * Height of the generated image in pixels
     */
    height?: number;

    /**
     * Provider-specific index when multiple images are generated
     */
    index?: number;

    /**
     * Optional content filter results from the provider
     */
    contentFilterResults?: ContentFilterResult;
}

/**
 * Content filter/safety results from image generation
 */
export interface ContentFilterResult {
    /**
     * Whether the image was filtered/blocked
     */
    filtered: boolean;

    /**
     * Reason for filtering if applicable
     */
    reason?: string;

    /**
     * Provider-specific category information
     */
    categories?: Record<string, boolean>;
}

/**
 * Result of an image generation request
 */
export class ImageGenerationResult extends BaseResult {
    /**
     * Array of generated images. May contain multiple images if n > 1 was requested.
     */
    images: GeneratedImage[] = [];

    /**
     * Some providers (like OpenAI DALL-E 3) may revise the prompt for safety or quality.
     * The revised prompt used for generation is returned here.
     */
    revisedPrompt?: string;

    /**
     * Usage information if provided by the model
     */
    usage?: ModelUsage;

    /**
     * Provider-specific metadata
     */
    metadata?: Record<string, unknown>;
}

/**
 * Size specification for image generation.
 * Common sizes supported by most providers.
 */
export type ImageSize =
    | '256x256'
    | '512x512'
    | '1024x1024'
    | '1024x1792'  // Portrait
    | '1792x1024'  // Landscape
    | '1536x1024'  // Gemini landscape
    | '1024x1536'  // Gemini portrait
    | string;       // Allow custom sizes for providers that support them

/**
 * Quality level for image generation
 */
export type ImageQuality = 'standard' | 'hd' | 'low' | 'medium' | 'high';

/**
 * Style preset for image generation
 */
export type ImageStyle = 'vivid' | 'natural' | 'photorealistic' | 'artistic' | 'anime' | string;

/**
 * Response format - how the generated image should be returned
 */
export type ImageResponseFormat = 'url' | 'b64_json' | 'buffer';

/**
 * Parameters for text-to-image generation
 */
export class ImageGenerationParams {
    /**
     * Model name/ID to use for generation
     */
    model?: string;

    /**
     * Text prompt describing the image to generate. Required.
     */
    prompt: string;

    /**
     * Negative prompt - things to avoid in the generated image.
     * Not all providers support this.
     */
    negativePrompt?: string;

    /**
     * Number of images to generate. Default is 1.
     * Some providers have limits on the maximum number.
     */
    n?: number = 1;

    /**
     * Size of the generated image(s)
     */
    size?: ImageSize = '1024x1024';

    /**
     * Quality level for the generated image
     */
    quality?: ImageQuality = 'standard';

    /**
     * Style preset for the generated image
     */
    style?: ImageStyle;

    /**
     * How the generated image should be returned
     */
    outputFormat?: ImageResponseFormat = 'b64_json';

    /**
     * Optional seed for reproducible generation.
     * Not all providers support seeding.
     */
    seed?: number;

    /**
     * Aspect ratio as an alternative to explicit size.
     * Format: "width:height" e.g., "16:9", "1:1", "9:16"
     */
    aspectRatio?: string;

    /**
     * User identifier for tracking/abuse prevention
     */
    user?: string;

    /**
     * Provider-specific additional parameters
     */
    providerOptions?: Record<string, unknown>;
}

/**
 * Parameters for image editing/inpainting
 */
export class ImageEditParams {
    /**
     * Model name/ID to use for editing
     */
    model?: string;

    /**
     * The original image to edit. Can be a Buffer, base64 string, or URL.
     */
    image: Buffer | string;

    /**
     * Text prompt describing the edit to make
     */
    prompt: string;

    /**
     * Mask image indicating which areas to edit.
     * Transparent/white areas will be regenerated.
     * Can be a Buffer, base64 string, or URL.
     */
    mask?: Buffer | string;

    /**
     * Negative prompt - things to avoid
     */
    negativePrompt?: string;

    /**
     * Number of edited images to generate
     */
    n?: number = 1;

    /**
     * Size of the output image(s)
     */
    size?: ImageSize;

    /**
     * How the result should be returned
     */
    outputFormat?: ImageResponseFormat = 'b64_json';

    /**
     * Provider-specific additional parameters
     */
    providerOptions?: Record<string, unknown>;
}

/**
 * Parameters for creating image variations
 */
export class ImageVariationParams {
    /**
     * Model name/ID to use for variations
     */
    model?: string;

    /**
     * The original image to create variations of.
     * Can be a Buffer, base64 string, or URL.
     */
    image: Buffer | string;

    /**
     * Optional prompt to guide the variation
     */
    prompt?: string;

    /**
     * Number of variations to generate
     */
    n?: number = 1;

    /**
     * Size of the output image(s)
     */
    size?: ImageSize;

    /**
     * How the result should be returned
     */
    outputFormat?: ImageResponseFormat = 'b64_json';

    /**
     * Strength of variation (0-1). Higher values create more different images.
     */
    strength?: number;

    /**
     * Provider-specific additional parameters
     */
    providerOptions?: Record<string, unknown>;
}

/**
 * Information about an available image generation model
 */
export class ImageModelInfo {
    /**
     * Model identifier
     */
    id: string;

    /**
     * Human-readable model name
     */
    name: string;

    /**
     * Model description
     */
    description?: string;

    /**
     * Supported image sizes
     */
    supportedSizes?: ImageSize[];

    /**
     * Maximum number of images per request
     */
    maxImages?: number;

    /**
     * Whether the model supports image editing/inpainting
     */
    supportsEditing?: boolean;

    /**
     * Whether the model supports image variations
     */
    supportsVariations?: boolean;

    /**
     * Whether the model supports negative prompts
     */
    supportsNegativePrompt?: boolean;

    /**
     * Whether the model supports seeded generation
     */
    supportsSeed?: boolean;
}

/**
 * Base class for all image generation models.
 * Each AI provider will have a sub-class implementing the abstract methods.
 * Not all sub-classes will support all methods - use GetSupportedMethods()
 * to determine what methods are available for a specific provider.
 */
export abstract class BaseImageGenerator extends BaseModel {
    /**
     * Generate image(s) from a text prompt.
     * This is the primary method for text-to-image generation.
     *
     * @param params Parameters controlling the image generation
     * @returns Result containing generated image(s)
     */
    public abstract GenerateImage(params: ImageGenerationParams): Promise<ImageGenerationResult>;

    /**
     * Edit an existing image using a text prompt and optional mask.
     * Also known as inpainting. The mask specifies which areas to regenerate.
     *
     * @param params Parameters for the edit operation
     * @returns Result containing edited image(s)
     * @throws Error if not supported by this provider
     */
    public abstract EditImage(params: ImageEditParams): Promise<ImageGenerationResult>;

    /**
     * Create variations of an existing image.
     * Generates new images that are similar to the input but with variations.
     *
     * @param params Parameters for the variation operation
     * @returns Result containing image variations
     * @throws Error if not supported by this provider
     */
    public abstract CreateVariation(params: ImageVariationParams): Promise<ImageGenerationResult>;

    /**
     * Get information about available image generation models from this provider.
     *
     * @returns Array of available model information
     */
    public abstract GetModels(): Promise<ImageModelInfo[]>;

    /**
     * Get the list of methods supported by this provider.
     * Use this to check capabilities before calling methods that may not be implemented.
     *
     * @returns Array of supported method names
     */
    public abstract GetSupportedMethods(): Promise<string[]>;

    /**
     * Helper method to convert image input (Buffer, base64, or URL) to the format
     * required by the specific provider. Subclasses can override as needed.
     *
     * @param input Image as Buffer, base64 string, or URL
     * @returns Normalized image data
     */
    protected async normalizeImageInput(input: Buffer | string): Promise<{ buffer: Buffer; base64: string }> {
        let buffer: Buffer;

        if (Buffer.isBuffer(input)) {
            buffer = input;
        } else if (typeof input === 'string') {
            if (input.startsWith('http://') || input.startsWith('https://')) {
                // Fetch image from URL
                const response = await fetch(input);
                if (!response.ok) {
                    throw new Error(`Failed to fetch image from URL: ${response.statusText}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                buffer = Buffer.from(arrayBuffer);
            } else {
                // Assume base64
                buffer = Buffer.from(input, 'base64');
            }
        } else {
            throw new Error('Image input must be a Buffer, base64 string, or URL');
        }

        return {
            buffer,
            base64: buffer.toString('base64')
        };
    }

    /**
     * Helper method to create a successful result with proper timing
     */
    protected createSuccessResult(startTime: Date, images: GeneratedImage[]): ImageGenerationResult {
        const result = new ImageGenerationResult(true, startTime, new Date());
        result.images = images;
        return result;
    }

    /**
     * Helper method to create an error result with proper timing
     */
    protected createErrorResult(startTime: Date, errorMessage: string): ImageGenerationResult {
        const result = new ImageGenerationResult(false, startTime, new Date());
        result.errorMessage = errorMessage;
        return result;
    }
}

/**
 * @deprecated Use BaseImageGenerator instead. This class is kept for backward compatibility.
 */
export abstract class BaseDiffusion extends BaseImageGenerator {
}
