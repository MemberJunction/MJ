import { Injectable } from '@angular/core';
import { LogError, Metadata, type EntityInfo, type IMetadataProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
    InteractiveFormsEngine,
    UserCanManageFormDefaults,
    type MJEntityFormContributionEntity,
    type MJEntityFormOverrideEntity,
} from '@memberjunction/core-entities';
import {
    InvalidateFormContributionRegistrationCache,
    ParseClaimedFieldNames,
} from '../panel-slot/collect-form-contribution-registrations';
import { DEFAULT_FORM_CONTRIBUTION_SLOT, type FormContributionSpec } from '@memberjunction/interactive-component-types/forms';
import type { FormOverrideRow, FormPanelContributionRow } from './form-panel-inventory';
import { SetPanelHidden } from '../panel-slot/panel-hides';
import {
    AudienceColumns,
    LiveContributionAt,
    LiveOverrideAt,
    type FormAudience,
    type ScopedRow,
} from './form-audience';

/** What a write attempt did, in terms the drawer can show. */
export interface FormPanelAdminResult {
    Success: boolean;
    Message?: string;
}

/**
 * Loads and changes the contribution rows behind one entity's form.
 *
 * Reads come from {@link InteractiveFormsEngine}, which already caches every row for
 * every scope and status and emits when one changes — the same cache the form runtime
 * reads, so the manager cannot disagree with the form it is managing.
 *
 * Writes go through `BaseEntity.Save()` and `.Delete()`. Direct SQL against an entity
 * skips the Record Changes audit row, the server cache invalidation, entity actions and
 * validation, all of which fail silently and leave a database that looks right.
 */
@Injectable({ providedIn: 'root' })
export class FormPanelAdminService {

    /**
     * Every contribution registered on this entity, whatever its scope or status.
     *
     * Not `GetApplicableContributions`: that answers what should render right now, which
     * excludes the drafts and switched-off rows this surface exists to bring back.
     */
    public RowsForEntity(entity: EntityInfo | null | undefined): FormPanelContributionRow[] {
        if (!entity?.ID) return [];
        try {
            return InteractiveFormsEngine.Instance.Contributions
                .filter((row) => row.EntityID && UUIDsEqual(row.EntityID, entity.ID))
                .map((row) => this.project(row));
        } catch (err: unknown) {
            LogError(`FormPanelAdminService: could not read contributions: ${this.message(err)}`);
            return [];
        }
    }

    /**
     * Whether the entity carries any contribution row at all, whatever its status.
     *
     * Separate from {@link RowsForEntity} because the container asks this on every
     * change-detection pass to decide whether to offer the manager, and projecting every
     * row to answer a yes-or-no question allocates on the hottest path in the form runtime.
     */
    public HasRowsForEntity(entity: EntityInfo | null | undefined): boolean {
        if (!entity?.ID) return false;
        try {
            return InteractiveFormsEngine.Instance.Contributions
                .some((row) => row.EntityID && UUIDsEqual(row.EntityID, entity.ID));
        } catch {
            // No engine in this context — nothing to manage.
            return false;
        }
    }

    /** Switches a row on or off. Off leaves the row in place, rendering for nobody. */
    public async SetActive(
        rowID: string,
        active: boolean,
        provider?: IMetadataProvider | null,
    ): Promise<FormPanelAdminResult> {
        return this.write(rowID, provider, async (row) => {
            row.Status = active ? 'Active' : 'Inactive';
            const saved = await row.Save();
            return saved
                ? { Success: true }
                : { Success: false, Message: row.LatestResult?.CompleteMessage ?? 'The change could not be saved.' };
        });
    }

    /**
     * Writes a new placement onto an existing row.
     *
     * Every placement column is set, including the ones the decision leaves out, so a
     * claim the user has just dropped is actually cleared. Merging instead would make a
     * panel that stops replacing a section keep replacing it.
     */
    public async SetPlacement(
        rowID: string,
        contribution: FormContributionSpec,
        activeNow: boolean,
        provider?: IMetadataProvider | null,
    ): Promise<FormPanelAdminResult> {
        return this.write(rowID, provider, async (row) => {
            row.Slot = contribution.slot ?? DEFAULT_FORM_CONTRIBUTION_SLOT;
            row.Presentation = contribution.presentation;
            if (contribution.sortKey != null) row.SortKey = contribution.sortKey;
            row.Title = contribution.title;
            row.Icon = contribution.icon ?? null;
            row.ReplacesFieldNames = contribution.replacesFieldNames?.length
                ? JSON.stringify(contribution.replacesFieldNames)
                : null;
            // One replaced section always goes in the single-key column, as the actions write it.
            const sections = [contribution.replacesSectionKey, ...(contribution.replacesSectionKeys ?? [])]
                .map((key) => key?.trim() ?? '')
                .filter((key, index, all) => key.length > 0 && all.indexOf(key) === index);
            row.ReplacesSectionKey = sections.length === 1 ? sections[0] : null;
            row.ReplacesSectionKeys = sections.length > 1 ? JSON.stringify(sections) : null;
            row.InSectionKey = contribution.inSectionKey?.trim() || null;
            // A position is kept only for a panel drawn inside a section, as the CHECK requires.
            row.SectionPosition = row.InSectionKey || row.ReplacesFieldNames ? (contribution.sectionPosition ?? null) : null;
            row.ChromeGroup = contribution.chromeGroup ?? null;
            row.RelatedJoinField = contribution.relatedJoinField ?? null;
            row.Status = activeNow ? 'Active' : 'Pending';
            const saved = await row.Save();
            return saved
                ? { Success: true }
                : { Success: false, Message: row.LatestResult?.CompleteMessage ?? 'The change could not be saved.' };
        });
    }

    /** Deletes a row outright. The Component it points at is left alone. */
    public async Remove(rowID: string, provider?: IMetadataProvider | null): Promise<FormPanelAdminResult> {
        return this.write(rowID, provider, async (row) => {
            const deleted = await row.Delete();
            return deleted
                ? { Success: true }
                : { Success: false, Message: row.LatestResult?.CompleteMessage ?? 'The panel could not be removed.' };
        });
    }

    /**
     * Whether the current user may publish to a role or to everyone.
     *
     * Only decides what the drawer draws. The server-side entity subclasses enforce the same rule
     * on every save, so a client that draws itself a Publish button still has the write refused.
     */
    public CanPublish(provider?: IMetadataProvider | null): boolean {
        const md = provider ?? Metadata.Provider;
        return UserCanManageFormDefaults(md?.CurrentUser, md);
    }

    /** Every full custom form registered on this entity, whatever its audience or status. */
    public OverridesForEntity(entity: EntityInfo | null | undefined): FormOverrideRow[] {
        if (!entity?.ID) return [];
        try {
            return InteractiveFormsEngine.Instance.Overrides
                .filter((row) => row.EntityID && UUIDsEqual(row.EntityID, entity.ID))
                .map((row) => ({
                    ID: row.ID, Name: row.Name, Status: row.Status, Scope: row.Scope,
                    UserID: row.UserID, RoleID: row.RoleID, Role: row.Role,
                }));
        } catch (err: unknown) {
            LogError(`FormPanelAdminService: could not read forms: ${this.message(err)}`);
            return [];
        }
    }

    /**
     * Changes who a panel is for.
     *
     * The panel live for that audience under the same key is retired first, in the same
     * transaction, so the audience never sees two and the unique index on active contributions
     * never sees two either.
     */
    public async PublishContribution(
        rowID: string,
        audience: FormAudience,
        provider?: IMetadataProvider | null,
    ): Promise<FormPanelAdminResult> {
        const rows = this.contributionRows();
        const target = rows.find((row) => UUIDsEqual(row.ID, rowID));
        if (!target) return { Success: false, Message: 'That panel is no longer registered.' };
        const callerID = (provider ?? Metadata.Provider)?.CurrentUser?.ID ?? '';
        const retiring = LiveContributionAt(rows, target, audience, callerID);
        return this.publish('MJ: Entity Form Contributions', target.ID, retiring?.ID ?? null, audience, provider);
    }

    /**
     * Changes who a full custom form is for. Whichever form was live for that audience is set
     * aside in the same transaction — it stays in the picker, so the two can be swapped.
     */
    public async PublishOverride(
        overrideID: string,
        audience: FormAudience,
        provider?: IMetadataProvider | null,
    ): Promise<FormPanelAdminResult> {
        const rows = this.overrideRows();
        const target = rows.find((row) => UUIDsEqual(row.ID, overrideID));
        if (!target) return { Success: false, Message: 'That form is no longer registered.' };
        const callerID = (provider ?? Metadata.Provider)?.CurrentUser?.ID ?? '';
        const retiring = LiveOverrideAt(rows, target, audience, callerID);
        return this.publish('MJ: Entity Form Overrides', target.ID, retiring?.ID ?? null, audience, provider);
    }

    /** Hides a panel from this user's form. Stored per user; nobody else is affected. */
    public Hide(entityName: string, key: string): void {
        SetPanelHidden(entityName, key, true);
        InvalidateFormContributionRegistrationCache();
    }

    /** Brings a hidden panel back. */
    public Show(entityName: string, key: string): void {
        SetPanelHidden(entityName, key, false);
        InvalidateFormContributionRegistrationCache();
    }

    /**
     * Retire the live item for the audience, then re-aim the target, in one transaction.
     *
     * The retirement is enqueued first because the transaction applies writes in order, and the
     * unique index on active contributions would otherwise see two live rows mid-statement.
     */
    private async publish(
        entityName: 'MJ: Entity Form Contributions' | 'MJ: Entity Form Overrides',
        targetID: string,
        retiringID: string | null,
        audience: FormAudience,
        provider?: IMetadataProvider | null,
    ): Promise<FormPanelAdminResult> {
        try {
            const md = provider ?? Metadata.Provider;
            if (!md?.CurrentUser) return { Success: false, Message: 'No signed-in user.' };
            const group = await md.CreateTransactionGroup();
            if (retiringID) {
                const retiring = await this.loadScoped(md, entityName, retiringID);
                if (!retiring) return { Success: false, Message: 'The item it replaces could not be loaded.' };
                retiring.Status = 'Inactive';
                retiring.TransactionGroup = group;
                if (!(await retiring.Save())) return this.failure(retiring, 'The item it replaces could not be retired.');
            }
            const target = await this.loadScoped(md, entityName, targetID);
            if (!target) return { Success: false, Message: 'That item is no longer registered.' };
            const columns = AudienceColumns(audience, md.CurrentUser.ID);
            target.Scope = columns.Scope;
            target.RoleID = columns.RoleID;
            target.UserID = columns.UserID;
            target.TransactionGroup = group;
            if (!(await target.Save())) return this.failure(target, 'The change could not be saved.');
            if (!(await group.Submit())) return { Success: false, Message: 'The change could not be saved.' };
            InvalidateFormContributionRegistrationCache();
            return { Success: true };
        } catch (err: unknown) {
            const message = this.message(err);
            LogError(`FormPanelAdminService: publish of ${targetID} failed: ${message}`);
            return { Success: false, Message: message };
        }
    }

    /** A fresh copy of a form or panel row, never the engine's own cached instance. */
    private async loadScoped(
        md: IMetadataProvider,
        entityName: 'MJ: Entity Form Contributions' | 'MJ: Entity Form Overrides',
        id: string,
    ): Promise<MJEntityFormContributionEntity | MJEntityFormOverrideEntity | null> {
        const row = entityName === 'MJ: Entity Form Contributions'
            ? await md.GetEntityObject<MJEntityFormContributionEntity>(entityName)
            : await md.GetEntityObject<MJEntityFormOverrideEntity>(entityName);
        return (await row.Load(id)) ? row : null;
    }

    private failure(row: { LatestResult?: { CompleteMessage?: string } | null }, fallback: string): FormPanelAdminResult {
        return { Success: false, Message: row.LatestResult?.CompleteMessage || fallback };
    }

    private contributionRows(): ScopedRow[] {
        return InteractiveFormsEngine.Instance.Contributions.map((row) => ({
            ID: row.ID, EntityID: row.EntityID, Status: row.Status, Scope: row.Scope,
            RoleID: row.RoleID, UserID: row.UserID, ContributionKey: row.ContributionKey,
        }));
    }

    private overrideRows(): ScopedRow[] {
        return InteractiveFormsEngine.Instance.Overrides.map((row) => ({
            ID: row.ID, EntityID: row.EntityID, Status: row.Status, Scope: row.Scope,
            RoleID: row.RoleID, UserID: row.UserID,
        }));
    }

    /**
     * Load the row, hand it to the caller, then drop the memo the form runtime reads.
     *
     * The engine emits on its own and that clears the registration cache, but the emission
     * is not guaranteed to land before the next change-detection pass, and a form still
     * drawing a panel the user just removed reads as the removal having failed.
     */
    private async write(
        rowID: string,
        provider: IMetadataProvider | null | undefined,
        act: (row: MJEntityFormContributionEntity) => Promise<FormPanelAdminResult>,
    ): Promise<FormPanelAdminResult> {
        if (!rowID) return { Success: false, Message: 'No panel was named.' };
        try {
            const md = provider ?? Metadata.Provider;
            if (!md) return { Success: false, Message: 'No metadata provider is available.' };
            const row = await md.GetEntityObject<MJEntityFormContributionEntity>('MJ: Entity Form Contributions');
            if (!(await row.Load(rowID))) {
                return { Success: false, Message: 'That panel is no longer registered.' };
            }
            const result = await act(row);
            if (result.Success) InvalidateFormContributionRegistrationCache();
            return result;
        } catch (err: unknown) {
            const message = this.message(err);
            LogError(`FormPanelAdminService: write on ${rowID} failed: ${message}`);
            return { Success: false, Message: message };
        }
    }

    private project(row: MJEntityFormContributionEntity): FormPanelContributionRow {
        return {
            ID: row.ID,
            Name: row.Name,
            Title: row.Title,
            Icon: row.Icon,
            Slot: row.Slot,
            Presentation: row.Presentation,
            Status: row.Status,
            Scope: row.Scope,
            UserID: row.UserID,
            RoleID: row.RoleID,
            Role: row.Role,
            ReplacesSectionKey: row.ReplacesSectionKey,
            ReplacesFieldNames: ParseClaimedFieldNames(row.ReplacesFieldNames),
            ReplacesSectionKeys: ParseClaimedFieldNames(row.ReplacesSectionKeys),
            InSectionKey: row.InSectionKey,
            SectionPosition: row.SectionPosition,
            RelatedEntity: row.RelatedEntity,
            ChromeGroup: row.ChromeGroup,
            ContributionKey: row.ContributionKey,
            ComponentID: row.ComponentID,
            SortKey: row.SortKey ?? 0,
        };
    }

    private message(err: unknown): string {
        return err instanceof Error ? err.message : String(err);
    }
}
