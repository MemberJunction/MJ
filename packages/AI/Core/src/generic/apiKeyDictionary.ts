import { MJGlobal, RegisterClass } from '@memberjunction/global';
import env from 'env-var';

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
 * @returns 
 */
export function GetAIAPIKey(AIDriverName: string): string {
    const obj = MJGlobal.Instance.ClassFactory.CreateInstance<AIAPIKeys>(AIAPIKeys); // get an instance of the above or a sub-class, whatever is registered with highest priority
    if (obj)
        return obj.GetAPIKey(AIDriverName);
    else
        throw new Error('Could not instantiate AIAPIKeys class');
}