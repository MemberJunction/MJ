/**
 * @fileoverview Authentication and API key types for Skip API
 * 
 * This file contains types related to authentication and API key management
 * within the Skip API system. These types define the structure for:
 * 
 * - API key specifications for different AI vendors (SkipAPIRequestAPIKey)
 * 
 * The authentication system allows clients to provide API keys for various
 * AI service providers that Skip will use on behalf of the client. This enables
 * Skip to access different AI models and services while maintaining security
 * by not storing these credentials permanently.
 * 
 * The vendor driver names correspond to registered classes in the MemberJunction
 * AI namespace that provide standardized interfaces to different AI providers
 * such as OpenAI, Anthropic, Google, and others.
 * 
 * @author MemberJunction
 * @since 2.0.0
 */

/**
 * Defines the API key information for AI service providers that Skip will use
 * on behalf of the client. Skip never stores these credentials - they are only
 * used for the duration of the request to access the specified AI services.
 */
export class SkipAPIRequestAPIKey {
    /**
     * These are the supported LLM vendors that Skip can use. These driver names map to the
     * registered classes in the MemberJunction AI namespace for example the @memberjunction/ai-openai package includes
     * a class called OpenAILLM that is registered with the MemberJunction AI system as a valid sub-class of BaseLLM
     */
    vendorDriverName: 'OpenAILLM' | 'MistralLLM' | 'GeminiLLM' | 'AnthropicLLM' | 'GroqLLM';
    /**
     * This is the actual API key for the specified vendor. 
     * NOTE: Skip NEVER stores this information, it is only used to make requests to the AI vendor of choice
     */
    apiKey: string;
}