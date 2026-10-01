/**
 * Picks the single secret a harness needs out of a decrypted credential.
 *
 * ## Why this exists
 *
 * `MJ: Credentials.Values` is a JSON blob of EVERY field the credential type defines — an
 * `aws-iam` credential carries `accessKeyId`, `secretAccessKey` and `region` together. A harness
 * grant maps ONE environment variable name to a credential, so something has to decide which field
 * that variable receives. The previous behaviour was to inject the whole blob as the variable's
 * value: the harness then saw `{"apiKey":"sk-..."}` where it expected `sk-...`, and — worse — any
 * unrelated fields in the blob (endpoints, secondary tokens) were exposed along with it.
 */

/**
 * Field names that conventionally hold "the" secret, in order of preference. Compared
 * case-insensitively.
 *
 * Drawn from the credential types shipped in `metadata/credential-types`: `apiKey` (API Key, API Key
 * with Endpoint, PandaDoc, Dropbox Sign), `ApiKey` (GrowthZone), `token` (Databricks), `accessToken`
 * (MCP OAuth Token), `authToken` (Twilio) — plus the snake_case and generic spellings customers use
 * for their own types. The order puts the most specific API-credential spellings first so that a
 * type carrying both, say, `apiKey` and `secret` yields the API key.
 */
export const CREDENTIAL_SECRET_FIELD_PRIORITY: readonly string[] = [
    'apiKey',
    'api_key',
    'token',
    'accessToken',
    'access_token',
    'authToken',
    'secret',
    'value',
];

/** The outcome of {@link ExtractCredentialSecret}: the secret, or why none could be chosen. */
export interface CredentialSecretResult {
    /** True when a single secret was chosen. */
    Success: boolean;
    /** The chosen secret. Present exactly when `Success` is true. */
    Secret?: string;
    /** Why no secret could be chosen. Present exactly when `Success` is false; never contains a value. */
    Reason?: string;
}

/**
 * Chooses the one field of a decrypted credential to inject as an environment variable.
 *
 * 1. A credential with exactly one field yields that field — there is nothing to choose between.
 * 2. Otherwise the first present field in {@link CREDENTIAL_SECRET_FIELD_PRIORITY} wins.
 * 3. Otherwise it is ambiguous and the result is a failure. Guessing here would hand the harness an
 *    arbitrary field, which is how a `region` string ends up in an `AWS_SECRET_ACCESS_KEY`.
 *
 * Failure reasons name the fields that exist but never their values, so the reason is safe to log.
 */
export function ExtractCredentialSecret(values: Record<string, unknown> | null | undefined): CredentialSecretResult {
    const names = Object.keys(values ?? {});
    if (!values || names.length === 0) {
        return { Success: false, Reason: 'the credential has no values' };
    }

    const chosen = names.length === 1 ? names[0] : findPreferredField(names);
    if (chosen === undefined) {
        return {
            Success: false,
            Reason:
                `the credential has ${names.length} fields (${names.join(', ')}) and none is a recognised ` +
                `secret field (${CREDENTIAL_SECRET_FIELD_PRIORITY.join(', ')}), so which one to inject is ambiguous`,
        };
    }

    const value = values[chosen];
    if (typeof value !== 'string' || value.length === 0) {
        return { Success: false, Reason: `field '${chosen}' is empty or not a string` };
    }
    return { Success: true, Secret: value };
}

/** First name matching the priority list, case-insensitively, in priority order. */
function findPreferredField(names: string[]): string | undefined {
    for (const preferred of CREDENTIAL_SECRET_FIELD_PRIORITY) {
        const match = names.find((n) => n.toLowerCase() === preferred.toLowerCase());
        if (match !== undefined) {
            return match;
        }
    }
    return undefined;
}
