import {
    BaseEntity,
    EntityDeleteOptions,
    EntitySaveOptions,
    LogError,
    RunView,
    SimpleEmbeddingResult,
    type IMetadataProvider,
    type UserInfo,
} from "@memberjunction/core";
import { EscapeSQLString, RegisterClass } from "@memberjunction/global";
import {
    ComponentWriteIsGuarded,
    ComponentWriteRefusal,
    GUARDED_COMPONENT_FIELDS,
    MJComponentEntityExtended,
    UserCanManageFormDefaults,
    type FormComponentReference,
    type FormScopeOperation,
} from "@memberjunction/core-entities";
import { EmbedTextLocalHelper } from "./util";
import { FormScopeRefusalResult } from "./FormScopeGuard";

/** The entities whose rows draw a component on a form, each through its `ComponentID` column. */
const FORM_COMPONENT_USERS = ['MJ: Entity Form Contributions', 'MJ: Entity Form Overrides'] as const;

/** The rows that use a component, or why they could not be read. */
type FormReferenceLookup = { References: FormComponentReference[] } | { Error: string };

/**
 * Server-side `MJ: Components` entity.
 *
 * Generates the `FunctionalRequirements` and `TechnicalDesign` embeddings on save.
 *
 * Also guards the component behind a full custom form or panel. A form or panel draws the
 * component its row points at, so changing the component's specification, status, name or type,
 * or deleting it, changes every form and panel that uses it. Such a write is checked against each
 * `MJ: Entity Form Contributions` and `MJ: Entity Form Overrides` row that uses the component,
 * with `ComponentWriteRefusal` from `@memberjunction/core-entities`: a `Role` or `Global` row needs
 * the `Manage Form Defaults` authorization, another user's personal row refuses everyone, and the
 * caller's own personal row passes. A create, a change to any other column, a component no row
 * uses, and a save or delete with no caller (a trusted server context) are not checked.
 *
 * The rows are read as the caller, so a read permission or row-level security filter that hides a
 * row from the caller also hides it from this check. When they cannot be read, the write is refused.
 *
 * The check needs a query, and `Validate()` is synchronous, so it runs in `Save()` (an ordinary
 * save and a `ReplayOnly` save alike) and in `Delete()`, before the write. A `ReplayOnly` save
 * skips validation, so it is checked as a change to every guarded column.
 */
@RegisterClass(BaseEntity, 'MJ: Components')
export class MJComponentEntityServer extends MJComponentEntityExtended  {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const operation = this.IsSaved ? 'update' : 'create';
        const refusal = await this.formComponentRefusal(operation, options?.ReplayOnly === true);
        if (refusal) {
            this.RegisterResultHistoryEntry(FormScopeRefusalResult(operation, refusal));
            return false;
        }
        await this.GenerateEmbeddingsByFieldName([
            { 
                fieldName: "FunctionalRequirements", 
                vectorFieldName: "FunctionalRequirementsVector", 
                modelFieldName: "FunctionalRequirementsVectorEmbeddingModelID" 
            },
            { 
                fieldName: "TechnicalDesign", 
                vectorFieldName: "TechnicalDesignVector", 
                modelFieldName: "TechnicalDesignVectorEmbeddingModelID" 
            }
        ]);
        const saveResult: boolean = await super.Save(options);
        return saveResult;
    }

    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const refusal = await this.formComponentRefusal('delete', false);
        if (refusal) {
            this.RegisterResultHistoryEntry(FormScopeRefusalResult('delete', refusal));
            return false;
        }
        return super.Delete(options);
    }
 
    /**
     * Simple proxy to local helper method for embeddings. Needed for BaseEntity sub-classes that want to use embeddings built into BaseEntity
     * @param textToEmbed 
     * @returns 
     */
    protected override async EmbedTextLocal(textToEmbed: string): Promise<SimpleEmbeddingResult> {
        return EmbedTextLocalHelper(this, textToEmbed);
    }

    /** Why this write is refused because of the forms and panels that use the component, or null. */
    private async formComponentRefusal(operation: FormScopeOperation, replayOnly: boolean): Promise<string | null> {
        const caller = this.ActiveUser;
        const write = {
            Operation: operation,
            ChangedFields: this.guardedChanges(operation, replayOnly),
            CallerID: caller?.ID ?? null,
        };
        if (!ComponentWriteIsGuarded(write)) return null;
        const lookup = await this.loadFormReferences(caller);
        if ('Error' in lookup) {
            return `The forms and panels that use this component could not be read, so this change is refused: ${lookup.Error}`;
        }
        return ComponentWriteRefusal({
            ...write,
            References: lookup.References,
            CallerHoldsGrant: UserCanManageFormDefaults(caller, this.ProviderToUse as unknown as IMetadataProvider),
        });
    }

    /**
     * The guarded columns an update changes: those whose value differs from the value as loaded,
     * or all of them for a `ReplayOnly` save. Empty for a create or a delete, which read none.
     */
    private guardedChanges(operation: FormScopeOperation, replayOnly: boolean): readonly string[] {
        if (operation !== 'update') return [];
        if (replayOnly) return GUARDED_COMPONENT_FIELDS;
        return GUARDED_COMPONENT_FIELDS.filter((name) => this.GetFieldByName(name)?.Dirty === true);
    }

    /** Every form and panel row that uses this component as stored, read as the caller. */
    private async loadFormReferences(caller: UserInfo): Promise<FormReferenceLookup> {
        const storedID = String(this.GetFieldByName('ID')?.OldValue ?? this.ID);
        const filter = `ComponentID='${EscapeSQLString(storedID)}'`;
        try {
            const results = await new RunView(this.RunViewProviderToUse).RunViews<FormComponentReference>(
                FORM_COMPONENT_USERS.map((EntityName) => ({
                    EntityName,
                    ExtraFilter: filter,
                    Fields: ['Scope', 'UserID'],
                    ResultType: 'simple' as const,
                    BypassCache: true,
                })),
                caller,
            );
            const reasons = FORM_COMPONENT_USERS.flatMap((name, i) =>
                results?.[i]?.Success ? [] : [results?.[i]?.ErrorMessage || `${name} could not be read`]);
            if (reasons.length > 0) return { Error: reasons.join('; ') };
            return { References: results.flatMap((result) => result.Results ?? []) };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`MJComponentEntityServer: could not read the forms and panels that use component ${storedID}: ${message}`);
            return { Error: message };
        }
    }
}
