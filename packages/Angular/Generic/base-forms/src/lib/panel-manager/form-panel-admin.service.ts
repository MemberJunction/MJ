import { Injectable } from '@angular/core';
import {
    LogError, Metadata, type BaseEntity, type EntityInfo, type IMetadataProvider, type TransactionGroupBase,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
    ActiveContributionSiblings,
    ApplyContributionSpecToRow,
    FormLifecycleComponentStatus,
    InteractiveFormsEngine,
    ParseClaimedFieldNames,
    UserCanManageFormDefaults,
    type FormLifecycleStatus,
    type MJComponentEntity,
    type MJEntityFormContributionEntity,
    type MJEntityFormOverrideEntity,
} from '@memberjunction/core-entities';
import {
    CollectFormContributionRegistrations,
    InvalidateFormContributionRegistrationCache,
} from '../panel-slot/collect-form-contribution-registrations';
import { ResolveFormContributionWinners } from '../panel-slot/form-contribution';
import type { FormContributionSpec } from '@memberjunction/interactive-component-types/forms';
import { ParseContributionConfiguration, type FormOverrideRow, type FormPanelContributionRow, type FormPanelRendering } from './form-panel-inventory';
import { PanelHideKey, SetPanelHidden } from '../panel-slot/panel-hides';
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

/** The two entities the drawer writes. */
type ScopedEntityName = 'MJ: Entity Form Contributions' | 'MJ: Entity Form Overrides';

/** A form or panel row loaded for a write. */
type ScopedEntity = MJEntityFormContributionEntity | MJEntityFormOverrideEntity;

/** One transaction being built: the rows whose status it changes, and every entity enqueued in it. */
interface PendingWrite {
    Provider: IMetadataProvider;
    Group: TransactionGroupBase;
    Changing: ReadonlySet<string>;
    Queued: BaseEntity[];
}

/**
 * The row's stored configuration with the decision's keys over it, so a key the placement
 * dialog does not write survives an edit. Undefined when both are empty.
 */
function mergeConfiguration(stored: string | null, decided: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    const merged = { ...(ParseContributionConfiguration(stored) ?? {}), ...(decided ?? {}) };
    return Object.keys(merged).length > 0 ? merged : undefined;
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
 *
 * Turning a form or panel on follows the rule the Activate actions follow: the one live under the
 * same key for the same audience is retired first, in the same transaction, and each component's
 * status mirrors its row's.
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

    /**
     * Switches a row on or off. Off leaves the row in place, rendering for nobody. On retires the
     * panel live under the same key for the same audience first, in the same transaction.
     */
    public async SetActive(
        rowID: string,
        active: boolean,
        provider?: IMetadataProvider | null,
    ): Promise<FormPanelAdminResult> {
        return this.write(rowID, provider, (row, md) => this.saveAs(md, row, active ? 'Active' : 'Inactive'));
    }

    /**
     * Which panels on this form draw for the current user: the winner of each key, with the
     * user's hidden panels left out — the same resolution the form makes. Undefined when that
     * cannot be resolved, so the list falls back to each item's own status.
     */
    public RenderingFor(
        entity: EntityInfo | null | undefined,
        provider?: IMetadataProvider | null,
    ): FormPanelRendering | undefined {
        const md = provider ?? Metadata.Provider;
        if (!entity || !md) return undefined;
        try {
            const rowIDs = new Set<string>();
            const compiledKeys = new Set<string>();
            const registrations = CollectFormContributionRegistrations(entity, md);
            for (const winner of ResolveFormContributionWinners(entity.Name, registrations).Winners) {
                if (winner.Source === 'metadata') {
                    if (winner.RowID) rowIDs.add(winner.RowID.toLowerCase());
                    continue;
                }
                const key = PanelHideKey(winner);
                if (key) compiledKeys.add(key);
            }
            return { RowIDs: rowIDs, CompiledKeys: compiledKeys };
        } catch (err: unknown) {
            LogError(`FormPanelAdminService: could not resolve what the form draws: ${this.message(err)}`);
            return undefined;
        }
    }

    /**
     * Writes a new placement onto an existing row, through the same row mapper the Create and
     * Modify actions use.
     *
     * Every claim column is rewritten, including the ones the decision leaves out, so a claim the
     * user has just dropped is actually cleared. The key is the one the decision names, or the
     * one the write path derives from its grid claim or the row's component. The order,
     * rail inclusion and configuration, which the placement dialog does not edit, are kept.
     *
     * @param status What the row is saved as: on, a draft, or off. On retires the panel live under
     *   the row's new key for its audience, in the same transaction.
     */
    public async SetPlacement(
        rowID: string,
        contribution: FormContributionSpec,
        status: FormLifecycleStatus,
        provider?: IMetadataProvider | null,
    ): Promise<FormPanelAdminResult> {
        return this.write(rowID, provider, async (row, md) => {
            const relatedName = contribution.relatedEntity?.trim();
            const related = relatedName ? (provider ?? Metadata.Provider)?.EntityByName(relatedName) : null;
            if (relatedName && !related) {
                return { Success: false, Message: `The related entity "${relatedName}" is not registered.` };
            }
            ApplyContributionSpecToRow(row, this.keepUneditedColumns(contribution, row), {
                relatedEntityID: related?.ID ?? null,
                relatedEntityName: related?.Name ?? null,
                componentName: row.Component || null,
            });
            return this.saveAs(md, row, status);
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

    /**
     * The full custom forms the engine holds for this entity, in every status: every shared form
     * and the signed-in user's own.
     */
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
     * Changes who a panel is for, and turns it on.
     *
     * The panel live for that audience under the same key is retired first, in the same
     * transaction, so the audience never sees two and the unique index on active contributions
     * never sees two either. A draft or a panel that is off goes live in the same transaction —
     * publishing one never leaves the audience with neither.
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
     * Changes who a full custom form is for, and makes it live. Whichever form was live for that
     * audience is set aside in the same transaction. A personal form set aside stays in its
     * owner's picker, so the two can be swapped back; a role or everyone form set aside is
     * retracted and no longer offered to anyone.
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
     * Retire the live item for the audience, then re-aim the target and turn it on, in one
     * transaction.
     *
     * The retirement is enqueued first because the transaction applies writes in order, and the
     * unique index on active contributions would otherwise see two live rows mid-statement.
     */
    private async publish(
        entityName: ScopedEntityName,
        targetID: string,
        retiringID: string | null,
        audience: FormAudience,
        provider?: IMetadataProvider | null,
    ): Promise<FormPanelAdminResult> {
        try {
            const md = provider ?? Metadata.Provider;
            if (!md?.CurrentUser) return { Success: false, Message: 'No signed-in user.' };
            const write = await this.begin(md, retiringID ? [targetID, retiringID] : [targetID]);
            if (retiringID) {
                const retired = await this.retire(write, entityName, retiringID);
                if (retired) return retired;
            }
            const target = await this.loadScoped(md, entityName, targetID);
            if (!target) return { Success: false, Message: 'That item is no longer registered.' };
            const columns = AudienceColumns(audience, md.CurrentUser.ID);
            target.Scope = columns.Scope;
            target.RoleID = columns.RoleID;
            target.UserID = columns.UserID;
            const failed = await this.enqueue(write, target, 'Active', 'The change could not be saved.');
            if (failed) return failed;
            const result = await this.submit(write);
            if (result.Success) InvalidateFormContributionRegistrationCache();
            return result;
        } catch (err: unknown) {
            const message = this.message(err);
            LogError(`FormPanelAdminService: publish of ${targetID} failed: ${message}`);
            return { Success: false, Message: message };
        }
    }

    /**
     * Saves a panel row in `status`, in one transaction with what that carries: turning it on
     * retires the panel live under its key for its audience first, and each component's status
     * follows its row's.
     */
    private async saveAs(
        md: IMetadataProvider,
        row: MJEntityFormContributionEntity,
        status: FormLifecycleStatus,
    ): Promise<FormPanelAdminResult> {
        const retiring = status === 'Active' ? ActiveContributionSiblings(this.contributionRows(), row) : [];
        const write = await this.begin(md, [row.ID, ...retiring.map((sibling) => sibling.ID)]);
        for (const sibling of retiring) {
            const retired = await this.retire(write, 'MJ: Entity Form Contributions', sibling.ID);
            if (retired) return retired;
        }
        const failed = await this.enqueue(write, row, status, 'The change could not be saved.');
        return failed ?? this.submit(write);
    }

    private async begin(md: IMetadataProvider, changing: readonly string[]): Promise<PendingWrite> {
        return { Provider: md, Group: await md.CreateTransactionGroup(), Changing: new Set(changing), Queued: [] };
    }

    /** Submits the transaction. When it fails, the reason the first refused write recorded. */
    private async submit(write: PendingWrite): Promise<FormPanelAdminResult> {
        if (await write.Group.Submit()) return { Success: true };
        const refused = write.Queued.find((entity) => entity.LatestResult?.Success === false);
        return { Success: false, Message: refused?.LatestResult?.CompleteMessage || 'The change could not be saved.' };
    }

    /** Enqueues turning off a live form or panel and its component. Null when that is enqueued. */
    private async retire(write: PendingWrite, entityName: ScopedEntityName, id: string): Promise<FormPanelAdminResult | null> {
        const row = await this.loadScoped(write.Provider, entityName, id);
        if (!row) return { Success: false, Message: 'The item it replaces could not be loaded.' };
        return this.enqueue(write, row, 'Inactive', 'The item it replaces could not be retired.');
    }

    /** Enqueues a row's save in `status`, then its component's. Null when both are enqueued. */
    private async enqueue(
        write: PendingWrite,
        row: ScopedEntity,
        status: FormLifecycleStatus,
        fallback: string,
    ): Promise<FormPanelAdminResult | null> {
        row.Status = status;
        row.TransactionGroup = write.Group;
        write.Queued.push(row);
        if (!(await row.Save())) return this.failure(row, fallback);
        return this.mirrorOnComponent(write, row.ComponentID, status);
    }

    /**
     * Enqueues the component status that mirrors `status`. A component another live row still
     * renders keeps its status, and one that already has it is not written. Null unless the write
     * is refused.
     */
    private async mirrorOnComponent(
        write: PendingWrite,
        componentID: string | null | undefined,
        status: FormLifecycleStatus,
    ): Promise<FormPanelAdminResult | null> {
        if (!componentID) return null;
        if (status !== 'Active' && this.componentLiveElsewhere(componentID, write.Changing)) return null;
        const component = await write.Provider.GetEntityObject<MJComponentEntity>('MJ: Components');
        if (!(await component.Load(componentID))) {
            console.warn(`FormPanelAdminService: component ${componentID} could not be loaded, so its status was left as it is.`);
            return null;
        }
        const next = FormLifecycleComponentStatus(status);
        if (component.Status === next) return null;
        component.Status = next;
        component.TransactionGroup = write.Group;
        write.Queued.push(component);
        return (await component.Save()) ? null : this.failure(component, 'Its component could not be updated.');
    }

    /** Whether a live form or panel outside this write still renders the component. */
    private componentLiveElsewhere(componentID: string, changing: ReadonlySet<string>): boolean {
        const ids = [...changing];
        const renders = (row: { ID: string; ComponentID: string; Status: string }): boolean =>
            row.Status === 'Active'
            && UUIDsEqual(row.ComponentID, componentID)
            && !ids.some((id) => UUIDsEqual(id, row.ID));
        try {
            const engine = InteractiveFormsEngine.Instance;
            return engine.Contributions.some(renders) || engine.Overrides.some(renders);
        } catch {
            return false;
        }
    }

    /** A fresh copy of a form or panel row, never the engine's own cached instance. */
    private async loadScoped(
        md: IMetadataProvider,
        entityName: ScopedEntityName,
        id: string,
    ): Promise<ScopedEntity | null> {
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
        act: (row: MJEntityFormContributionEntity, md: IMetadataProvider) => Promise<FormPanelAdminResult>,
    ): Promise<FormPanelAdminResult> {
        if (!rowID) return { Success: false, Message: 'No panel was named.' };
        try {
            const md = provider ?? Metadata.Provider;
            if (!md) return { Success: false, Message: 'No metadata provider is available.' };
            const row = await md.GetEntityObject<MJEntityFormContributionEntity>('MJ: Entity Form Contributions');
            if (!(await row.Load(rowID))) {
                return { Success: false, Message: 'That panel is no longer registered.' };
            }
            const result = await act(row, md);
            if (result.Success) InvalidateFormContributionRegistrationCache();
            return result;
        } catch (err: unknown) {
            const message = this.message(err);
            LogError(`FormPanelAdminService: write on ${rowID} failed: ${message}`);
            return { Success: false, Message: message };
        }
    }

    /** The decision, with the columns the placement dialog does not edit filled in from the row. */
    private keepUneditedColumns(contribution: FormContributionSpec, row: MJEntityFormContributionEntity): FormContributionSpec {
        return {
            ...contribution,
            sortKey: contribution.sortKey ?? row.SortKey,
            inclusion: contribution.inclusion ?? row.Inclusion ?? undefined,
            configuration: mergeConfiguration(row.Configuration, contribution.configuration),
        };
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
            RelatedJoinField: row.RelatedJoinField,
            ChromeGroup: row.ChromeGroup,
            ContributionKey: row.ContributionKey,
            ComponentID: row.ComponentID,
            SortKey: row.SortKey ?? 0,
            Configuration: row.Configuration,
        };
    }

    private message(err: unknown): string {
        return err instanceof Error ? err.message : String(err);
    }
}
