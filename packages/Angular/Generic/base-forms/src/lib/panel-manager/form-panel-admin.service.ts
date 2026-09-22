import { Injectable } from '@angular/core';
import { LogError, Metadata, type EntityInfo, type IMetadataProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { InteractiveFormsEngine, type MJEntityFormContributionEntity } from '@memberjunction/core-entities';
import {
    InvalidateFormContributionRegistrationCache,
    ParseClaimedFieldNames,
} from '../panel-slot/collect-form-contribution-registrations';
import { DEFAULT_FORM_CONTRIBUTION_SLOT, type FormContributionSpec } from '@memberjunction/interactive-component-types/forms';
import type { FormPanelContributionRow } from './form-panel-inventory';

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
            row.Title = contribution.title;
            row.Icon = contribution.icon ?? null;
            row.ReplacesSectionKey = contribution.replacesSectionKey ?? null;
            row.ReplacesFieldNames = contribution.replacesFieldNames?.length
                ? JSON.stringify(contribution.replacesFieldNames)
                : null;
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
            const md = new Metadata();
            const row = await (provider ?? Metadata.Provider ?? md)
                .GetEntityObject<MJEntityFormContributionEntity>('MJ: Entity Form Contributions');
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
            ReplacesSectionKey: row.ReplacesSectionKey,
            ReplacesFieldNames: ParseClaimedFieldNames(row.ReplacesFieldNames),
            RelatedEntity: row.RelatedEntity,
            ChromeGroup: row.ChromeGroup,
            ContributionKey: row.ContributionKey,
        };
    }

    private message(err: unknown): string {
        return err instanceof Error ? err.message : String(err);
    }
}
