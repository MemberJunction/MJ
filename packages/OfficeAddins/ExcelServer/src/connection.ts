/**
 * @fileoverview Mints the API key the Excel add-in signs in with.
 *
 * The key belongs to the signed-in user and is created AS that user, so MJ's own permissions decide
 * whether they may connect Excel at all (plan O10). It is limited to the `view:run` and `query:run`
 * scopes; MJ's API keys deny every scope-checked operation outside a key's scopes, so it can't save,
 * delete or mint more keys. It is bound to the `MJAPI` application when one is defined, expires, and
 * shows up on the API Keys page, where it can be revoked.
 *
 * A key is never left without its scopes: if any step after creation fails, the key is revoked
 * before the error is reported.
 *
 * @module @memberjunction/excel-addin-server
 */
import { IMetadataProvider, LogError, UserInfo } from '@memberjunction/core';
import { MJAPIKeyApplicationEntity, MJAPIKeyScopeEntity } from '@memberjunction/core-entities';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import { APIKeysEngineBase } from '@memberjunction/api-keys-base';

/** The label every Excel connection key carries on the API Keys page. */
export const EXCEL_CONNECTION_KEY_LABEL = 'Excel add-in';

/** The only scopes an Excel connection key holds. */
export const EXCEL_CONNECTION_SCOPES: readonly string[] = ['view:run', 'query:run'];

/** The application a key is bound to, so it works against MJAPI only. */
export const EXCEL_CONNECTION_APPLICATION = 'MJAPI';

/** A new connection key. `APIKey` is the raw key, available only now. */
export interface ExcelConnectionKey {
    APIKey: string;
    APIKeyID: string;
    ExpiresAt: Date;
    Label: string;
}

const MS_PER_DAY = 86400000;

/** Creates, scopes and binds the user's Excel connection key. Throws with a message fit to show them. */
export async function CreateExcelConnectionKey(
    user: UserInfo,
    provider: IMetadataProvider,
    lifetimeDays: number,
    now: Date = new Date(),
): Promise<ExcelConnectionKey> {
    if (!user?.ID) {
        throw new Error('Sign in to MemberJunction before connecting Excel.');
    }
    const scopeIDs = await resolveScopeIDs(user, provider);
    const expiresAt = new Date(now.getTime() + lifetimeDays * MS_PER_DAY);
    const engine = GetAPIKeyEngine();
    const created = await engine.CreateAPIKey({
        UserId: user.ID,
        Label: EXCEL_CONNECTION_KEY_LABEL,
        Description: `Lets Microsoft Excel run the views and queries ${user.Name || user.Email} can see, read-only. Created ${now.toISOString().slice(0, 10)} by the MemberJunction Excel add-in.`,
        ExpiresAt: expiresAt,
    }, user, provider);
    if (!created.Success || !created.RawKey || !created.APIKeyId) {
        throw new Error(
            `Excel couldn't be connected: ${created.Error || 'the key could not be created'}. ` +
            'If your role isn\'t allowed to create API keys, ask an administrator to allow it.',
        );
    }
    await finishKeyOrRevoke(created.APIKeyId, scopeIDs, user, provider);
    return { APIKey: created.RawKey, APIKeyID: created.APIKeyId, ExpiresAt: expiresAt, Label: EXCEL_CONNECTION_KEY_LABEL };
}

/** Finds the scope rows before anything is created, so a missing scope creates nothing. */
async function resolveScopeIDs(user: UserInfo, provider: IMetadataProvider): Promise<string[]> {
    const base = APIKeysEngineBase.Instance;
    await base.Config(false, user, provider);
    return EXCEL_CONNECTION_SCOPES.map(path => {
        const scope = base.GetScopeByPath(path);
        if (!scope) {
            throw new Error(`Excel can't be connected: this server has no "${path}" API scope.`);
        }
        return scope.ID;
    });
}

async function finishKeyOrRevoke(apiKeyID: string, scopeIDs: string[], user: UserInfo, provider: IMetadataProvider): Promise<void> {
    try {
        for (const scopeID of scopeIDs) {
            await addScope(apiKeyID, scopeID, user, provider);
        }
        await bindApplication(apiKeyID, user, provider);
    } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        await revokeAfterFailure(apiKeyID, user, provider, reason);
        throw new Error(
            `Excel couldn't be connected: ${reason}. ` +
            'If your role isn\'t allowed to create API keys, ask an administrator to allow it.',
        );
    }
}

async function addScope(apiKeyID: string, scopeID: string, user: UserInfo, provider: IMetadataProvider): Promise<void> {
    const keyScope = await provider.GetEntityObject<MJAPIKeyScopeEntity>('MJ: API Key Scopes', user);
    keyScope.APIKeyID = apiKeyID;
    keyScope.ScopeID = scopeID;
    keyScope.ResourcePattern = '*';
    keyScope.PatternType = 'Include';
    keyScope.IsDeny = false;
    keyScope.Priority = 0;
    if (!(await keyScope.Save())) {
        throw new Error(`the key's scope could not be saved (${keyScope.LatestResult?.CompleteMessage ?? 'unknown error'})`);
    }
}

async function bindApplication(apiKeyID: string, user: UserInfo, provider: IMetadataProvider): Promise<void> {
    const application = APIKeysEngineBase.Instance.GetApplicationByName(EXCEL_CONNECTION_APPLICATION);
    if (!application) {
        return;
    }
    const binding = await provider.GetEntityObject<MJAPIKeyApplicationEntity>('MJ: API Key Applications', user);
    binding.APIKeyID = apiKeyID;
    binding.ApplicationID = application.ID;
    if (!(await binding.Save())) {
        throw new Error(`the key could not be limited to ${EXCEL_CONNECTION_APPLICATION} (${binding.LatestResult?.CompleteMessage ?? 'unknown error'})`);
    }
}

async function revokeAfterFailure(apiKeyID: string, user: UserInfo, provider: IMetadataProvider, reason: string): Promise<void> {
    try {
        const revoked = await GetAPIKeyEngine().RevokeAPIKey(apiKeyID, user, provider);
        if (!revoked) {
            LogError(`Excel add-in: API key ${apiKeyID} was created but not finished (${reason}) and could NOT be revoked. Revoke it on the API Keys page.`);
        }
    } catch (e) {
        LogError(`Excel add-in: API key ${apiKeyID} was created but not finished (${reason}); revoking it threw: ${e instanceof Error ? e.message : String(e)}. Revoke it on the API Keys page.`);
    }
}
