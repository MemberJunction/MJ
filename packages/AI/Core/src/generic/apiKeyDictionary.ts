import { MJGlobal } from '@memberjunction/global';

/**
 * Represents an API key configuration for AI services.
 * Used to provide API keys at runtime for specific AI driver classes.
 */
export interface AIAPIKey {
    /**
     * The driver class name (e.g., 'OpenAILLM', 'AnthropicLLM', 'GroqLLM')
     * This should match the exact driver class name used by the AI provider
     */
    driverClass: string;
    
    /**
     * The API key value for the specified driver class
     */
    apiKey: string;
}

/**
 * Default AI API Key Dictionary. You can override this with a custom implementation by creating a sub-class of this class and doing whatever you want in that class
 * Make sure any sub-class implementation is registered with the RegisterClass decorator and a priority higher than 1.
 */
export class AIAPIKeys { 
    private static readonly _apiKeyPrefix = 'AI_VENDOR_API_KEY__';

    // cache the result to not go back to the env package as much
    protected static _cachedAPIKeys: { [key: string]: string } = {};
    protected GetCachedAPIKey(AIDriverName: string): string {
        const normalizedKey = AIDriverName.toUpperCase();
        return AIAPIKeys._cachedAPIKeys[normalizedKey];
    }

    protected SetCachedAPIKey(AIDriverName: string, value: string) {
        const normalizedKey = AIDriverName.toUpperCase();
        AIAPIKeys._cachedAPIKeys[normalizedKey] = value;
    }
    
    public GetAPIKey(AIDriverName: string): string {
        const normalizedKey = AIDriverName.toUpperCase();
        const cached = this.GetCachedAPIKey(normalizedKey);
        if (cached) {
            return cached;
        } 
        else {
            // Adjust the way we build the env key to ensure it's normalized
            const envKey = AIAPIKeys._apiKeyPrefix + normalizedKey;
            const value = this.getEnvVariableCaseInsensitive(envKey);
            if (value) {
                this.SetCachedAPIKey(normalizedKey, value);
                return value;
            }
            else 
                return undefined;
        }
    }

    protected getEnvVariableCaseInsensitive(name: string): string | undefined {
        const upperName = name.toUpperCase();
        const envKey = Object.keys(process.env).find(key => key.toUpperCase() === upperName);
        return envKey ? process.env[envKey] : undefined;
    }
}

/**
 * Helper function that gets the API Key for a given AI Driver Name using the AIAPIKeys class or any registered sub-class of AIAPIKeys
 * @param AIDriverName 
 * @param apiKeys - optional array of AIAPIKey objects to check first before falling back to the global AIAPIKeys class
 * @param verbose - optional flag to enable verbose logging
 * @returns 
 */
export function GetAIAPIKey(AIDriverName: string, apiKeys?: AIAPIKey[], verbose?: boolean): string {
    let apiKey: string;
    if (apiKeys && apiKeys.length > 0) {
    const localKey = apiKeys.find(k => k.driverClass === AIDriverName);
    if (localKey) {
        apiKey = localKey.apiKey;
        if (verbose) {
            console.log(`   Using local API key for driver class: ${AIDriverName}`);
        }
    } else {
        apiKey = GetAIAPIKeyGlobal(AIDriverName);
        if (verbose) {
            console.log(`   No local API key found for driver class ${AIDriverName}, using global key`);
        }
    }
    } else {
        apiKey = GetAIAPIKeyGlobal(AIDriverName);
    }
    return apiKey;
}

export function GetAIAPIKeyGlobal(AIDriverName: string): string {
    const obj = MJGlobal.Instance.ClassFactory.CreateInstance<AIAPIKeys>(AIAPIKeys); // get an instance of the above or a sub-class, whatever is registered with highest priority
    if (obj)
        return obj.GetAPIKey(AIDriverName);
    else
        throw new Error('Could not instantiate AIAPIKeys class');
}