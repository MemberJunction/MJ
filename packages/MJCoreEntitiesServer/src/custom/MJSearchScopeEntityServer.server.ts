import { RegisterClass } from '@memberjunction/global';
import { BaseEntity, EntitySaveOptions, IMetadataProvider, LogError, LogStatus } from '@memberjunction/core';
import { MJSearchScopeEntity, MJSearchScopePermissionEntity } from '@memberjunction/core-entities';

/**
 * Server-side extension of MJSearchScopeEntity that auto-grants the creating
 * user Manage-level permission on a freshly-created scope.
 *
 * Why: Phase 2A introduced SearchScopePermission as a hard gate on every
 * search invocation. Without an automatic grant on scope creation, a user
 * who creates a scope through any UI (Knowledge Hub dashboard's + New, the
 * full custom form's New, or programmatic via `Save()` on a fresh entity)
 * gets a Forbidden response the moment they try to use the scope they
 * just created — a UX trap that breaks the plans/search-scopes-rag-plus/SEARCH_USAGE.md walkthrough's
 * §3 → §4 flow.
 *
 * The grant goes to the user identified by `this.ContextCurrentUser` (the
 * server-side identity already established for the request) at level
 * 'Manage' so they can both run searches against the scope and edit its
 * configuration. Other users / roles can be granted later via the
 * Permissions panel.
 *
 * Best-effort: if the permission write fails, the scope save still
 * succeeds. We log the error and surface it to the resolver — the user
 * will see Forbidden on first use, which is recoverable by manually
 * adding the grant. Tying the scope save to the permission save would
 * trade one UX trap for a worse one (failed creates).
 */
@RegisterClass(BaseEntity, 'MJ: Search Scopes')
export class MJSearchScopeEntityServer extends MJSearchScopeEntity {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const isNewRecord = !this.IsSaved;
        const saved = await super.Save(options);
        if (!saved || !isNewRecord) {
            return saved;
        }

        // Best-effort auto-grant. Don't fail the scope save if this fails.
        try {
            const md = this.ProviderToUse as unknown as IMetadataProvider;
            const ctxUser = this.ContextCurrentUser;
            if (!ctxUser?.ID) {
                LogError(`MJSearchScopeEntityServer: cannot auto-grant permission on scope ${this.ID} — no ContextCurrentUser.`);
                return saved;
            }
            const perm = await md.GetEntityObject<MJSearchScopePermissionEntity>(
                'MJ: Search Scope Permissions',
                ctxUser,
            );
            perm.NewRecord();
            perm.SearchScopeID = this.ID;
            perm.UserID = ctxUser.ID;
            perm.RoleID = null;
            perm.PermissionLevel = 'Manage';
            const permSaved = await perm.Save();
            if (permSaved) {
                LogStatus(`MJSearchScopeEntityServer: auto-granted Manage on scope '${this.Name}' (${this.ID}) to user '${ctxUser.Name}' (${ctxUser.ID}).`);
            } else {
                LogError(`MJSearchScopeEntityServer: auto-grant Save returned false for scope ${this.ID}: ${perm.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`MJSearchScopeEntityServer: auto-grant threw for scope ${this.ID}: ${msg}`);
        }

        return saved;
    }
}
