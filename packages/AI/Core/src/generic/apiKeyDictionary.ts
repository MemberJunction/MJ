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
 * Which credentials a run may spend.
 *
 * - `'Any'` (the default): the run's own credentials first, then the platform's — MJ Credentials
 *   bound to the prompt, model or vendor, then the `AI_VENDOR_API_KEY__<DRIVER>` environment keys.
 * - `'RuntimeOnly'`: only what the caller supplied for this run — `apiKeys`, or a per-request
 *   `credentialId` on a prompt. A driver class the run carries no key for has NO key, so that vendor
 *   is not a candidate and failover cannot reach the platform account.
 *
 * A host that runs work for a customer on the customer's own key sets `'RuntimeOnly'`, so a key the
 * customer did not supply is a visible failure rather than a silent charge to the platform.
 */
export type AICredentialScope = 'Any' | 'RuntimeOnly';

/**
 * Where a credential comes from, from the point of view of the run spending it.
 *
 * - `'Runtime'`: supplied by the caller for this run — `apiKeys`, or a prompt's per-request `credentialId`.
 * - `'PlatformCredential'`: MJ Credentials the platform configured — `AICredentialBinding`s on the
 *   prompt-model, model-vendor or vendor, and a vendor's default credential.
 * - `'Environment'`: the platform's `AI_VENDOR_API_KEY__<DRIVER>` keys, and any host seam whose
 *   default is them (a registered `AIAPIKeys` subclass, `RealtimeClientSessionService.getAPIKeyForDriver`).
 */
export type AICredentialSource = 'Runtime' | 'PlatformCredential' | 'Environment';

/**
 * Whether a run under `scope` may spend a credential from `source`. Every credential-scope decision
 * goes through here, so adding an {@link AICredentialScope} value is a compile error in this switch
 * until it is answered — never a value that silently behaves as `'Any'` at a call site that compared
 * against `'RuntimeOnly'`. A value outside the type (an untyped caller) throws, failing closed.
 *
 * @param scope The run's scope; omitted means `'Any'`.
 * @param source The source a caller is about to consult.
 */
export function CredentialScopeAllows(scope: AICredentialScope | undefined, source: AICredentialSource): boolean {
    const effective = scope ?? 'Any';
    switch (effective) {
        case 'Any':
            return true;
        case 'RuntimeOnly':
            return source === 'Runtime';
        default: {
            const unhandled: never = effective;
            throw new Error(`Unknown AI credential scope '${String(unhandled)}'; expected 'Any' or 'RuntimeOnly'`);
        }
    }
}

/**
 * Helper function that gets the API Key for a given AI Driver Name using the AIAPIKeys class or any registered sub-class of AIAPIKeys
 * @param AIDriverName 
 * @param apiKeys - optional array of AIAPIKey objects to check first before falling back to the global AIAPIKeys class
 * @param verbose - optional flag to enable verbose logging
 * @param scope - `'RuntimeOnly'` answers from `apiKeys` alone and never falls back to the global key; see {@link AICredentialScope}
 * @returns The key, or `undefined` when none applies
 */
export function GetAIAPIKey(AIDriverName: string, apiKeys?: AIAPIKey[], verbose?: boolean, scope: AICredentialScope = 'Any'): string {
    const localKey = apiKeys?.find(k => k.driverClass === AIDriverName);
    if (localKey) {
        if (verbose) {
            console.log(`   Using local API key for driver class: ${AIDriverName}`);
        }
        return localKey.apiKey;
    }
    if (!CredentialScopeAllows(scope, 'Environment')) {
        if (verbose) {
            console.log(`   No local API key found for driver class ${AIDriverName}; credential scope ${scope} does not allow the global key`);
        }
        return undefined;
    }
    if (verbose && apiKeys && apiKeys.length > 0) {
        console.log(`   No local API key found for driver class ${AIDriverName}, using global key`);
    }
    return GetAIAPIKeyGlobal(AIDriverName);
}

export function GetAIAPIKeyGlobal(AIDriverName: string): string {
    const obj = MJGlobal.Instance.ClassFactory.CreateInstance<AIAPIKeys>(AIAPIKeys); // get an instance of the above or a sub-class, whatever is registered with highest priority
    if (obj)
        return obj.GetAPIKey(AIDriverName);
    else
        throw new Error('Could not instantiate AIAPIKeys class');
}