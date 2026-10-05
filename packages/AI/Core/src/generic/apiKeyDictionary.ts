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
        // A row with no driver class has no key — that is an ANSWER, not a crash (#3532). This threw
        // `Cannot read properties of null (reading 'toUpperCase')` for one malformed AI model row and
        // took out prompt execution entirely, naming neither the row nor the operation. Every caller
        // already handles a falsy key; none of them expected this to throw.
        if (!AIDriverName) {
            return undefined;
        }
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
/**
 * Resolves the API key to use for ONE AI driver class.
 *
 * A shape for handing a *scoped* key-resolution capability to code that spends an AI key without
 * handing over the key list itself. A holder can ask for the one driver class it needs; it cannot
 * enumerate the run's credentials, and whoever built the resolver decides whether to answer.
 * Realtime uses it. `@memberjunction/actions-base` declares the same signature separately as
 * `RuntimeAPIKeyResolver` (it does not depend on this package), and the prompt runner still takes
 * the key list (`AIPromptParams.apiKeys`).
 *
 * `undefined` means "no key for that driver class" — which is also how a deliberate refusal reads,
 * so a caller treats both the same way: fall back to the platform key, or skip that vendor.
 *
 * Build one with {@link MakeAIAPIKeyResolver}.
 */
export type AIAPIKeyResolver = (driverClass: string) => string | undefined;

/**
 * Builds an {@link AIAPIKeyResolver} over a runtime key list: the list's key for the driver class
 * first, then the platform (environment) key — the same precedence as `GetAIAPIKey`. For prompts
 * that is only the legacy tier: `AIPromptRunner` tries MJ Credentials first (a per-request
 * `credentialId`, then `AICredentialBinding`s, then the vendor's default credential) and reaches
 * this order only when none of them resolves. This resolver never consults credentials.
 *
 * Pass the run's `apiKeys` and the resolver honours a customer's own credentials; pass nothing and
 * it is exactly the platform lookup, so a caller never has to special-case "this run has no keys".
 *
 * A caller with its own platform-key seam should layer run keys over that seam rather than use this
 * resolver, whose environment fallback would answer first and bypass the seam.
 *
 * @param apiKeys The runtime keys for a run, if any (`ExecuteAgentParams.apiKeys`).
 * @param verbose Log which source answered — never the key itself.
 */
export function MakeAIAPIKeyResolver(apiKeys?: AIAPIKey[], verbose?: boolean): AIAPIKeyResolver {
    return (driverClass: string): string | undefined => GetAIAPIKey(driverClass, apiKeys, verbose) || undefined;
}
