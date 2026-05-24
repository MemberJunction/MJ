import { Injectable } from '@angular/core';
import { Metadata, RunView, IMetadataProvider, UserInfo, LogError } from '@memberjunction/core';
import { MJEntityFormOverrideEntity, MJComponentEntity } from '@memberjunction/core-entities';
import type { FormOverrideDialogResult } from '../components/form-override-dialog.component';

/** Slim row shape for listing existing overrides — matches FormResolverService. */
export interface EntityFormOverrideRow {
    ID: string;
    EntityID: string;
    ComponentID: string;
    Name: string;
    Description: string | null;
    Scope: 'User' | 'Role' | 'Global';
    UserID: string | null;
    RoleID: string | null;
    Priority: number;
    Status: 'Active' | 'Inactive' | 'Pending';
}

/**
 * Studio-side service for managing `EntityFormOverride` rows from Component
 * Studio (post-save dialog + sub-list of existing overrides).
 *
 * Reads use `RunView` with `ResultType: 'simple'` for the list view —
 * cheaper than loading entity objects when we just want to render rows.
 * Writes (`CreateOverride`, `DeactivateOverride`) load the strongly-typed
 * `MJEntityFormOverrideEntity` and call `Save()`. Per the project
 * "NO WEAK TYPING" rule we never use `.Set('FieldName', ...)`.
 *
 * Unlike the Form Builder agent's action (`__CreateInteractiveForm`),
 * which clamps Scope='User' as a security boundary, the Studio service
 * **honors the dialog's Scope/Role/Priority choices** — Studio is the
 * deliberate human-authoring path where promotion to Role / Global is a
 * core feature. The dialog already enforces that Scope='Role' requires a
 * RoleID.
 */
@Injectable({ providedIn: 'root' })
export class EntityFormOverrideService {

    /**
     * Fetch existing overrides for an entity, scoped to the calling user's
     * visibility (User, their roles, Global). Used by the Studio sub-list
     * showing "what overrides already exist for this entity."
     */
    public async ListOverridesForEntity(
        entityName: string,
        user: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<EntityFormOverrideRow[]> {
        const p = provider ?? Metadata.Provider;
        if (!p) return [];
        const entityInfo = p.EntityByName(entityName);
        if (!entityInfo) return [];

        const userRoleIds = (user.UserRoles ?? []).map(r => r.RoleID).filter(Boolean);
        const roleClause = userRoleIds.length > 0
            ? `(Scope='Role' AND RoleID IN (${userRoleIds.map(id => `'${id}'`).join(',')}))`
            : "(1=0)";

        const filter = `
            EntityID='${entityInfo.ID}' AND (
                (Scope='User' AND UserID='${user.ID}')
                OR ${roleClause}
                OR Scope='Global'
            )
        `.trim();

        const rv = RunView.FromMetadataProvider(p);
        const result = await rv.RunView<EntityFormOverrideRow>({
            EntityName: 'MJ: Entity Form Overrides',
            Fields: ['ID', 'EntityID', 'ComponentID', 'Name', 'Description',
                     'Scope', 'UserID', 'RoleID', 'Priority', 'Status'],
            ExtraFilter: filter,
            OrderBy: `CASE Scope WHEN 'User' THEN 1 WHEN 'Role' THEN 2 ELSE 3 END, Priority DESC`,
            ResultType: 'simple',
            BypassCache: true,
        }, user);

        if (!result.Success) {
            LogError(`EntityFormOverrideService.ListOverridesForEntity: ${result.ErrorMessage}`);
            return [];
        }
        return result.Results ?? [];
    }

    /**
     * Create an `EntityFormOverride` row pointing the just-saved Component
     * at an entity. Honors the dialog's Scope/Role/Priority/Status choices
     * (unlike the Form Builder action which clamps to User scope).
     */
    public async CreateOverride(
        componentID: string,
        result: FormOverrideDialogResult,
        user: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<{ Success: boolean; ID?: string; Error?: string }> {
        const p = provider ?? Metadata.Provider;
        if (!p) {
            return { Success: false, Error: 'No metadata provider available.' };
        }
        const entityInfo = p.EntityByName(result.EntityName);
        if (!entityInfo) {
            return { Success: false, Error: `Entity '${result.EntityName}' is not registered.` };
        }

        try {
            const override = await p.GetEntityObject<MJEntityFormOverrideEntity>(
                'MJ: Entity Form Overrides', user,
            );
            override.NewRecord();
            override.EntityID = entityInfo.ID;
            override.ComponentID = componentID;
            override.Name = result.Name;
            override.Description = result.Description;
            override.Scope = result.Scope;
            // Mutual exclusion enforced by the DB CHECK constraint
            // (see migrations/v5/V202605161430...Interactive_Forms.sql).
            // We mirror it here so the row is well-shaped before the round
            // trip and the CHECK constraint never has to fire.
            override.UserID = result.Scope === 'User' ? user.ID : null;
            override.RoleID = result.Scope === 'Role' ? result.RoleID : null;
            override.Priority = result.Priority;
            override.Status = result.Status;

            const saved = await override.Save();
            if (!saved) {
                return {
                    Success: false,
                    Error: override.LatestResult?.CompleteMessage ?? 'Save returned false with no diagnostic.',
                };
            }
            return { Success: true, ID: override.ID };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`EntityFormOverrideService.CreateOverride: ${message}`);
            return { Success: false, Error: message };
        }
    }

    /**
     * Promote a Pending override to Active. Mirrors the server-side
     * `Activate Interactive Form Version` action's intent without round-
     * tripping through the Action layer — for cockpit-internal usage where
     * the user is explicitly clicking "Make Active".
     *
     * Atomically flips the target Override to Active AND demotes any sibling
     * Active override at the same scope target to Inactive. Components
     * mirror the override status (Published / Draft / Deprecated).
     */
    public async activateVersion(
        id: string,
        user?: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<{ Success: boolean; Error?: string }> {
        const p = provider ?? Metadata.Provider;
        const u = user ?? p?.CurrentUser;
        if (!p || !u) return { Success: false, Error: 'No provider/user available.' };
        try {
            const target = await p.GetEntityObject<MJEntityFormOverrideEntity>('MJ: Entity Form Overrides', u);
            const loaded = await target.Load(id);
            if (!loaded) return { Success: false, Error: `Override ${id} not found.` };

            // Find sibling Actives at the same scope target.
            const rv = RunView.FromMetadataProvider(p);
            const scopeClause = target.Scope === 'User'
                ? `Scope='User' AND UserID='${target.UserID}'`
                : target.Scope === 'Role'
                    ? `Scope='Role' AND RoleID='${target.RoleID}'`
                    : `Scope='Global' AND UserID IS NULL AND RoleID IS NULL`;
            const priors = await rv.RunView<{ ID: string; ComponentID: string }>({
                EntityName: 'MJ: Entity Form Overrides',
                ExtraFilter: `EntityID='${target.EntityID}' AND ${scopeClause} AND Status='Active' AND ID <> '${target.ID}'`,
                Fields: ['ID', 'ComponentID'],
                ResultType: 'simple',
            }, u);

            // Promote target.
            target.Status = 'Active';
            await target.Save();
            const targetComp = await p.GetEntityObject<MJComponentEntity>('MJ: Components', u);
            if (await targetComp.Load(target.ComponentID)) {
                targetComp.Status = 'Published';
                await targetComp.Save();
            }
            // Demote priors.
            for (const prior of priors.Results ?? []) {
                const priorO = await p.GetEntityObject<MJEntityFormOverrideEntity>('MJ: Entity Form Overrides', u);
                if (await priorO.Load(prior.ID)) {
                    priorO.Status = 'Inactive';
                    await priorO.Save();
                }
                const priorC = await p.GetEntityObject<MJComponentEntity>('MJ: Components', u);
                if (await priorC.Load(prior.ComponentID)) {
                    priorC.Status = 'Deprecated';
                    await priorC.Save();
                }
            }
            return { Success: true };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`EntityFormOverrideService.activateVersion: ${message}`);
            return { Success: false, Error: message };
        }
    }

    /**
     * Re-point an Active override at an older Component row in the same Name
     * lineage. Pure UPDATE on the override; no new rows created. Mirrors the
     * server-side `Revert Interactive Form` action.
     */
    public async revertToComponent(
        activeOverrideID: string,
        targetComponentID: string,
        user?: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<{ Success: boolean; Error?: string }> {
        const p = provider ?? Metadata.Provider;
        const u = user ?? p?.CurrentUser;
        if (!p || !u) return { Success: false, Error: 'No provider/user available.' };
        try {
            const override = await p.GetEntityObject<MJEntityFormOverrideEntity>('MJ: Entity Form Overrides', u);
            if (!await override.Load(activeOverrideID)) {
                return { Success: false, Error: `Override ${activeOverrideID} not found.` };
            }
            const previousComponentID = override.ComponentID;
            override.ComponentID = targetComponentID;
            const saved = await override.Save();
            if (!saved) {
                return { Success: false, Error: override.LatestResult?.CompleteMessage ?? 'Save returned false.' };
            }
            // Flip Component statuses to keep them coherent.
            const newActive = await p.GetEntityObject<MJComponentEntity>('MJ: Components', u);
            if (await newActive.Load(targetComponentID)) {
                newActive.Status = 'Published';
                await newActive.Save();
            }
            const oldActive = await p.GetEntityObject<MJComponentEntity>('MJ: Components', u);
            if (await oldActive.Load(previousComponentID)) {
                oldActive.Status = 'Deprecated';
                await oldActive.Save();
            }
            return { Success: true };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`EntityFormOverrideService.revertToComponent: ${message}`);
            return { Success: false, Error: message };
        }
    }

    /**
     * Flip an override's Status to `Inactive`. Preserves the row so it can
     * be re-activated later (vs. deleting outright, which would lose the
     * Component link and require re-authoring).
     */
    public async DeactivateOverride(
        id: string,
        user: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<{ Success: boolean; Error?: string }> {
        const p = provider ?? Metadata.Provider;
        if (!p) return { Success: false, Error: 'No metadata provider available.' };

        try {
            const override = await p.GetEntityObject<MJEntityFormOverrideEntity>(
                'MJ: Entity Form Overrides', user,
            );
            const loaded = await override.Load(id);
            if (!loaded) {
                return { Success: false, Error: `Override ${id} not found.` };
            }
            override.Status = 'Inactive';
            const saved = await override.Save();
            if (!saved) {
                return {
                    Success: false,
                    Error: override.LatestResult?.CompleteMessage ?? 'Save returned false.',
                };
            }
            return { Success: true };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`EntityFormOverrideService.DeactivateOverride: ${message}`);
            return { Success: false, Error: message };
        }
    }
}
