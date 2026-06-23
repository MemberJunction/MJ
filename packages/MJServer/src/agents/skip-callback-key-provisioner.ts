/**
 * Skip Callback Key Provisioner
 *
 * Auto-provisions a scoped API key for Skip callbacks on the client MJAPI.
 * On first request to a Skip host, creates a key and returns the raw value
 * so SkipSDK can send it once. Skip persists it in its credential store.
 *
 * On subsequent requests (including after MJ restart), the key record exists
 * in the DB but the raw value is irrecoverable (hashed). Returns null to
 * signal "key exists, don't send it — Skip already has it."
 *
 * Thread safety: uses a promise-based mutex so concurrent first requests
 * don't create duplicate keys.
 *
 * @see MJ/plans/skip-callback-scoped-api-keys.md Section 3.2
 */

import { LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { configInfo } from '../config.js';

/** The email used for the Skip service account (deployed via MJ metadata). */
const SKIP_SERVICE_EMAIL = 'skip-service@skip.internal';

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

/** Promise-based mutex: if provisioning is in-flight, subsequent callers await it. */
let provisioningPromise: Promise<string | null> | null = null;

/**
 * Whether provisioning completed successfully this server lifetime (key exists
 * or was just created). Exported so SkipSDK can distinguish "key exists, Skip
 * has it" (don't send anything) from "provisioning failed" (fall back to legacy).
 */
export let provisioningComplete = false;

/** Raw key from creation — only non-null during the server lifetime that created the key. */
let createdRawKey: string | null = null;

/**
 * Builds the label for a Skip callback key scoped to a specific Skip host.
 * Example: "Skip Callback: https://skip.example.com"
 */
function buildKeyLabel(): string {
    const skipChatUrl = configInfo.askSkip?.chatURL;
    if (!skipChatUrl) {
        throw new Error('ASK_SKIP_CHAT_URL is not configured — cannot provision Skip callback key');
    }
    return `Skip Callback: ${skipChatUrl}`;
}

/**
 * Returns the raw API key for Skip callbacks if one was just created,
 * or null if the key already exists (Skip already has it stored).
 *
 * - First call ever (no key in DB): creates key, returns raw key (send to Skip once)
 * - Subsequent calls (same server lifetime): returns null (key exists, Skip has it)
 * - After restart (key in DB, raw lost): returns null (key exists, Skip has it)
 *
 * Returns null on provisioning failure — caller should fall back to legacy MJ_API_KEY.
 */
export async function getSkipCallbackKey(): Promise<string | null> {
    // Fast path: we've already checked this lifetime
    if (provisioningComplete) {
        return createdRawKey;
    }

    // Mutex: if provisioning is in-flight, piggyback on that promise
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
 * The actual provisioning logic. Runs at most once per server lifetime.
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

        const label = buildKeyLabel();

        // Check if a key already exists for this service account + Skip host.
        const existingKey = await findExistingKey(serviceAccount.ID, label, systemUser);
        if (existingKey) {
            // Key exists — Skip already received the raw key when it was first created.
            // We can't recover the raw value (it's hashed), but we don't need to.
            LogStatus(`[SkipCallbackKeyProvisioner] Found existing Skip callback key (ID: ${existingKey.ID})`);
            provisioningComplete = true;
            createdRawKey = null; // Signal: don't send key, Skip already has it
            return null;
        }

        // No existing key — create one and return the raw value for SkipSDK to send once
        const rawKey = await createKeyWithScopes(serviceAccount, label, systemUser);
        if (rawKey) {
            provisioningComplete = true;
            createdRawKey = rawKey;
            LogStatus('[SkipCallbackKeyProvisioner] Auto-provisioned new Skip callback key — will send to Skip on this request');
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

async function findExistingKey(serviceAccountUserID: string, label: string, contextUser: UserInfo): Promise<ExistingKeyRow | null> {
    const rv = new RunView();
    const result = await rv.RunView<ExistingKeyRow>({
        EntityName: 'MJ: API Keys',
        ExtraFilter: `UserID='${serviceAccountUserID}' AND Label='${label.replace(/'/g, "''")}' AND Status='Active'`,
    }, contextUser);

    if (result.Success && result.Results.length > 0) {
        return result.Results[0];
    }
    return null;
}

/**
 * Creates a new API key for the Skip service account and assigns all required scopes.
 */
async function createKeyWithScopes(serviceAccount: UserInfo, label: string, systemUser: UserInfo): Promise<string | null> {
    const engine = GetAPIKeyEngine();

    const createResult = await engine.CreateAPIKey({
        UserId: serviceAccount.ID,
        Label: label,
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

    const cachedScopes = engine.Scopes;
    const scopeMap = new Map(cachedScopes.map(s => [s.FullPath, s.ID]));

    const missing = REQUIRED_SCOPE_PATHS.filter(p => !scopeMap.has(p));
    if (missing.length > 0) {
        LogError(`[SkipCallbackKeyProvisioner] Missing scopes in engine cache: ${missing.join(', ')}. ` +
            'Run MJ metadata sync to deploy API scope definitions.');
        return false;
    }

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
