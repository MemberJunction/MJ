/**
 * IT187's (the Predictive Studio prediction-serving bundle's) user-key minting. IT187 is a server-transport bundle
 * whose identities authenticate through the live MJAPI, so each key and its scope rule must be written THROUGH MJAPI
 * on a system-key connection: MJAPI's key-scope cache then sees them at once, instead of on its timed reload (written
 * in process, IT187 Setup was refused "No matching key scope rules" for over 200 s). The shared FLS client helper
 * writes on `ctx.Provider`, which serves the client-transport bundles; this PS-owned copy keeps that helper as `next`
 * ships it.
 *
 * @module @memberjunction/integration-test-suite
 */
import type { IMetadataProvider } from '@memberjunction/core';
import type { MJAPIKeyScopeEntity } from '@memberjunction/core-entities';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';
import type { MintedUserKeyIds } from './fls-client.checks';

/** Mints IT187's user API keys through MJAPI. */
export class PsServingKeys {
    /**
     * Mints a user API key and grants it `full_access` on `'*'` (scope enforcement fails closed, so a key with no rule
     * cannot even run a batched view), both written through `wire`. Records the key and its rule in `keys` for
     * teardown (`DeleteMintedUserKeys`).
     *
     * @param ctx the check context (its user is the key's creator of record)
     * @param keys the created-ID accumulators the key and rule are appended to
     * @param userId the user the key authenticates as
     * @param label the key's label
     * @param wire a system-key connection to MJAPI (`BuildSystemKeyProvider`)
     * @returns the raw key
     * @throws Error when the key or its rule is not saved, or the seeded `full_access` scope is missing
     */
    public static async MintFullAccessKeyThroughMJAPI(ctx: IntegrationCheckContext, keys: MintedUserKeyIds, userId: string, label: string, wire: IMetadataProvider): Promise<string> {
        const engine = GetAPIKeyEngine();
        const created = await engine.CreateAPIKey({ UserId: userId, Label: label }, ctx.User, wire);
        if (!created.Success || !created.RawKey || !created.APIKeyId) {
            throw new Error(`CreateAPIKey('${label}') failed: ${created.Error ?? 'no raw key returned'}`);
        }
        keys.CreatedKeyIds.push(created.APIKeyId);
        const fullAccess = engine.Scopes.find((s) => s.FullPath === 'full_access');
        if (!fullAccess) throw new Error("the seeded 'full_access' API scope was not found — cannot authorize the minted key");
        const rule = await wire.GetEntityObject<MJAPIKeyScopeEntity>('MJ: API Key Scopes', wire.CurrentUser);
        rule.NewRecord();
        rule.APIKeyID = created.APIKeyId;
        rule.ScopeID = fullAccess.ID;
        rule.ResourcePattern = '*';
        rule.PatternType = 'Include';
        rule.IsDeny = false;
        rule.Priority = 0;
        if (!(await rule.Save())) throw new Error(`granting full_access to the minted key failed: ${rule.LatestResult?.CompleteMessage ?? ''}`);
        keys.CreatedScopeRuleIds.push(rule.ID);
        return created.RawKey;
    }
}
