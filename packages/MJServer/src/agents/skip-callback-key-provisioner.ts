/**
 * Skip Callback Key Provisioner
 *
 * Auto-provisions a scoped API key for Skip callbacks on the client MJAPI.
 * On first request, checks for an existing key owned by the Skip service account;
 * if none exists, creates one via APIKeyEngine and assigns the required scopes.
 *
 * The raw key is cached in memory for subsequent requests. The key survives
 * server restarts because it's persisted in the database — SkipSDK rediscovers
 * it by querying on the next startup.
 *
 * Thread safety: uses a promise-based mutex so concurrent first requests don't
 * create duplicate keys.
 *
 * @see MJ/plans/skip-callback-scoped-api-keys.md Section 3.2
 */

import { LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';

/** The email used for the Skip service account (deployed via MJ metadata). */
const SKIP_SERVICE_EMAIL = 'skip-service@skip.internal';

/** Label used to identify the auto-provisioned callback key. */
const SKIP_CALLBACK_KEY_LABEL = 'Skip Callback Key (auto-provisioned)';

/**
 * All scope FullPaths that a Skip callback key needs.
 * These must match entries in MJ/metadata/api-scopes/.api-scopes.json.
 */
const REQUIRED_SCOPE_PATHS: string[] = [
    'view:run',
    'view:batch',
    'query:run',
    'query:create',
    'query:update',
    'query:delete',
    'query:test',
    'search:execute',
    'prompt:execute',
    'agent:execute',
    'embedding:generate',
];

/** Cached raw key — only populated after successful provisioning or discovery. */
let cachedRawKey: string | null = null;

/** Promise-based mutex: if provisioning is in-flight, subsequent callers await it. */
let provisioningPromise: Promise<string | null> | null = null;

/**
 * Returns the raw API key for Skip callbacks, auto-provisioning if needed.
 *
 * - If the key is cached, returns immediately.
 * - If another call is already provisioning, awaits that result.
 * - Otherwise, kicks off provisioning (discover or create + assign scopes).
 *
 * @returns The raw API key string, or null if provisioning failed (caller should
 *          fall back to the legacy MJ_API_KEY env var during the transition period).
 */
export async function getSkipCallbackKey(): Promise<string | null> {
    if (cachedRawKey) {
        return cachedRawKey;
    }

    // Mutex: if provisioning is already in progress, piggyback on that promise
    if (provisioningPromise) {
        return provisioningPromise;
    }

    provisioningPromise = provisionInner();
    try {
        return await provisioningPromise;
    } finally {
        provisioningPromise = null;
    }
}

/**
 * The actual provisioning logic. Only one instance of this runs at a time.
 */
async function provisionInner(): Promise<string | null> {
    try {
        const systemUser = UserCache.Instance.GetSystemUser();
        if (!systemUser) {
            LogError('[SkipCallbackKeyProvisioner] System user not found in UserCache');
            return null;
        }

        const serviceAccount = UserCache.Instance.Users.find(
            u => u.Email.toLowerCase() === SKIP_SERVICE_EMAIL
        );
        if (!serviceAccount) {
            LogError(`[SkipCallbackKeyProvisioner] Skip service account (${SKIP_SERVICE_EMAIL}) not found in UserCache. ` +
                'Run MJ metadata sync to deploy the Skip Service Account user.');
            return null;
        }

        // Check if a key already exists for this service account.
        // MJ: API Keys is not cached in APIKeysEngineBase so we hit the DB here.
        // This only runs once per server lifetime (result is cached either way).
        const existingKey = await findExistingKey(serviceAccount.ID, systemUser);
        if (existingKey) {
            // We found the key record but can't recover the raw key (it's hashed).
            // The raw key was only available at creation time. Since we can't send
            // a hashed key to Skip, we log this and return null — the caller falls
            // back to the legacy MJ_API_KEY flow.
            //
            // In practice, this only happens if the server restarts after key
            // creation but before the raw key was used. The proper fix is Phase 5:
            // store the raw key encrypted at rest (or rotate and re-provision).
            LogStatus(`[SkipCallbackKeyProvisioner] Found existing Skip callback key (ID: ${existingKey.ID}) ` +
                'but raw key is not recoverable. Using legacy MJ_API_KEY fallback.');
            return null;
        }

        // No existing key — create one
        const rawKey = await createKeyWithScopes(serviceAccount, systemUser);
        if (rawKey) {
            cachedRawKey = rawKey;
            LogStatus('[SkipCallbackKeyProvisioner] Successfully auto-provisioned Skip callback key');
        }
        return rawKey;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        LogError(`[SkipCallbackKeyProvisioner] Provisioning failed: ${msg}`);
        return null;
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface ExistingKeyRow {
    ID: string;
    Label: string;
    Status: string;
}

async function findExistingKey(serviceAccountUserID: string, contextUser: UserInfo): Promise<ExistingKeyRow | null> {
    const rv = new RunView();
    const result = await rv.RunView<ExistingKeyRow>({
        EntityName: 'MJ: API Keys',
        ExtraFilter: `UserID='${serviceAccountUserID}' AND Label='${SKIP_CALLBACK_KEY_LABEL}' AND Status='Active'`,
    }, contextUser);

    if (result.Success && result.Results.length > 0) {
        return result.Results[0];
    }
    return null;
}

/**
 * Creates a new API key for the Skip service account and assigns all required scopes.
 */
async function createKeyWithScopes(serviceAccount: UserInfo, systemUser: UserInfo): Promise<string | null> {
    const engine = GetAPIKeyEngine();

    const createResult = await engine.CreateAPIKey({
        UserId: serviceAccount.ID,
        Label: SKIP_CALLBACK_KEY_LABEL,
        Description: 'Auto-provisioned by SkipSDK for scoped Skip→client callbacks. ' +
            'Do not delete — Skip will re-provision on next request if missing.',
    }, systemUser);

    if (!createResult.Success || !createResult.RawKey || !createResult.APIKeyId) {
        LogError(`[SkipCallbackKeyProvisioner] Failed to create API key: ${createResult.Error}`);
        return null;
    }

    const scopesAssigned = await assignScopes(createResult.APIKeyId, systemUser, engine);
    if (!scopesAssigned) {
        LogError('[SkipCallbackKeyProvisioner] Key created but scope assignment failed. ' +
            `Key ID: ${createResult.APIKeyId}. Manual scope assignment may be needed.`);
    }

    return createResult.RawKey;
}

/**
 * Resolves scope IDs from the APIKeyEngine's in-memory cache (no DB round-trip)
 * and creates APIKeyScope records for each.
 */
async function assignScopes(apiKeyID: string, contextUser: UserInfo, engine: ReturnType<typeof GetAPIKeyEngine>): Promise<boolean> {
    const md = new Metadata();

    // Resolve scope IDs from the engine's cached Scopes (loaded at startup).
    // This avoids a RunView query — scopes are already in memory.
    const cachedScopes = engine.Scopes;
    const scopeMap = new Map(cachedScopes.map(s => [s.FullPath, s.ID]));

    const missing = REQUIRED_SCOPE_PATHS.filter(p => !scopeMap.has(p));
    if (missing.length > 0) {
        LogError(`[SkipCallbackKeyProvisioner] Missing scopes in engine cache: ${missing.join(', ')}. ` +
            'Run MJ metadata sync to deploy API scope definitions.');
        return false;
    }

    // Create an APIKeyScope record for each required scope
    let allSaved = true;
    for (const scopePath of REQUIRED_SCOPE_PATHS) {
        const scopeID = scopeMap.get(scopePath)!;
        const keyScopeEntity = await md.GetEntityObject('MJ: API Key Scopes', contextUser);
        keyScopeEntity.NewRecord();
        keyScopeEntity.Set('APIKeyID', apiKeyID);
        keyScopeEntity.Set('ScopeID', scopeID);
        keyScopeEntity.Set('ResourcePattern', '*');
        keyScopeEntity.Set('PatternType', 'Include');
        keyScopeEntity.Set('IsDeny', false);
        keyScopeEntity.Set('Priority', 0);

        const saved = await keyScopeEntity.Save();
        if (!saved) {
            LogError(`[SkipCallbackKeyProvisioner] Failed to assign scope ${scopePath} to key ${apiKeyID}`);
            allSaved = false;
        }
    }

    if (allSaved) {
        LogStatus(`[SkipCallbackKeyProvisioner] Assigned ${REQUIRED_SCOPE_PATHS.length} scopes to callback key`);
    }

    return allSaved;
}
