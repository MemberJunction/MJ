import {
    LogError,
    RunView,
    type IMetadataProvider,
    type IRunViewProvider,
    type RunViewParams,
    type UserInfo,
} from '@memberjunction/core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import {
    ComponentNameCollisionRefusal,
    ComponentWriteRefusal,
    FormRowComponentRefusal,
    GUARDED_COMPONENT_FIELDS,
    UserCanManageFormDefaults,
    type FormComponentReference,
    type FormScope,
    type FormScopeOperation,
    type GuardedComponentField,
} from '@memberjunction/core-entities';

/** The entities whose rows draw a component on a form, each through its `ComponentID` column. */
const FORM_ROW_ENTITIES = ['MJ: Entity Form Contributions', 'MJ: Entity Form Overrides'] as const;

/** A form or panel row that uses a component, as the guards read it. */
interface FormComponentUse extends FormComponentReference {
    ID: string;
    ComponentID: string;
}

/** The guarded columns of a component, current or as stored. */
export type GuardedComponentValues = Record<GuardedComponentField, unknown>;

/** What the component guard reads from a `MJ: Components` row. */
export interface GuardedComponentRow {
    readonly ActiveUser: UserInfo | null;
    /** The component's primary key. */
    readonly ID: string;
    /** The guarded columns as the write would store them. */
    readonly Values: GuardedComponentValues;
    readonly RunViewProvider: IRunViewProvider;
    readonly MetadataProvider: IMetadataProvider;
}

/** What the row check reads from a `MJ: Entity Form Contributions` or `MJ: Entity Form Overrides` row. */
export interface GuardedFormComponentRow {
    readonly IsSaved: boolean;
    readonly ActiveUser: UserInfo | null;
    readonly ID: string;
    readonly ComponentID: string;
    GetFieldByName(name: string): { OldValue: unknown } | null | undefined;
    readonly RunViewProvider: IRunViewProvider;
    readonly MetadataProvider: IMetadataProvider;
}

/** The results of one batch of views, or why it failed. */
type BatchOutcome = { Results: Array<Array<Record<string, unknown>>> } | { Error: string };

/**
 * Why this write to a component is refused, or null when it may proceed.
 *
 * With no caller (a trusted server context) nothing is checked. A create by a caller without the
 * `Manage Form Defaults` grant is checked for a name another component already has. An update or
 * delete reads, in one batch and as the caller: every form and panel row that uses the component,
 * the component's stored guarded columns, and (for an update by a caller without the grant) the
 * other components with the same name. The changed columns are found by comparing the write's
 * values with the stored ones. When a read fails, the write is refused.
 */
export async function ComponentGuardRefusal(row: GuardedComponentRow, operation: FormScopeOperation): Promise<string | null> {
    const caller = row.ActiveUser;
    if (!caller) return null;
    const holdsGrant = UserCanManageFormDefaults(caller, row.MetadataProvider);
    if (operation === 'create') {
        return holdsGrant ? null : nameCollisionRefusal(row, caller, sameNameView(row.Values.Name, null));
    }
    const isUpdate = operation === 'update';
    const checkName = isUpdate && !holdsGrant;
    const views = [
        ...usesViews(`ComponentID='${EscapeSQLString(row.ID)}'`),
        ...(isUpdate ? [storedComponentView(row.ID)] : []),
        ...(checkName ? [sameNameView(row.Values.Name, row.ID)] : []),
    ];
    const batch = await runBatch(row.RunViewProvider, views, caller);
    if ('Error' in batch) return readRefusal(batch.Error);
    const [contributions, overrides, stored, sameName] = batch.Results;
    if (isUpdate && stored.length === 0) return readRefusal('the component as stored was not found');
    const changed = isUpdate ? changedFields(row.Values, stored[0]) : [];
    const writeRefusal = ComponentWriteRefusal({
        Operation: operation,
        ChangedFields: changed,
        References: [...contributions, ...overrides].map(asUse),
        CallerID: caller.ID,
        CallerHoldsGrant: holdsGrant,
    });
    if (writeRefusal || !checkName || !changed.some((f) => f === 'Name' || f === 'Namespace')) return writeRefusal;
    return collisionRefusal(row, caller, sameName.map((r) => String(r.ID)));
}

/**
 * Why a form or panel row may not point at its component, or null when it may.
 *
 * Checked when the row is created or its `ComponentID` differs from the value as loaded, for a
 * caller; a trusted server context with no caller is not checked. Every other row that uses the
 * component is read as the caller and checked with `FormRowComponentRefusal`. When the rows cannot
 * be read, the write is refused.
 */
export async function FormRowComponentGuardRefusal(row: GuardedFormComponentRow): Promise<string | null> {
    const caller = row.ActiveUser;
    if (!caller || !row.ComponentID) return null;
    const prior = row.GetFieldByName('ComponentID')?.OldValue;
    if (row.IsSaved && typeof prior === 'string' && UUIDsEqual(prior, row.ComponentID)) return null;
    const batch = await runBatch(row.RunViewProvider, usesViews(`ComponentID='${EscapeSQLString(row.ComponentID)}'`), caller);
    if ('Error' in batch) return readRefusal(batch.Error);
    return FormRowComponentRefusal({
        RowID: row.IsSaved ? row.ID : null,
        References: batch.Results.flat().map(asUse),
        CallerID: caller.ID,
        CallerHoldsGrant: UserCanManageFormDefaults(caller, row.MetadataProvider),
    });
}

/** The name check for a create: the other components with this name, then the rows that use them. */
async function nameCollisionRefusal(row: GuardedComponentRow, caller: UserInfo, view: RunViewParams): Promise<string | null> {
    const batch = await runBatch(row.RunViewProvider, [view], caller);
    if ('Error' in batch) return readRefusal(batch.Error);
    return collisionRefusal(row, caller, batch.Results[0].map((r) => String(r.ID)));
}

/** Applies `ComponentNameCollisionRefusal` to these same-named components, reading the rows that use them. */
async function collisionRefusal(row: GuardedComponentRow, caller: UserInfo, componentIDs: string[]): Promise<string | null> {
    if (componentIDs.length === 0) return null;
    const inList = componentIDs.map((id) => `'${EscapeSQLString(id)}'`).join(',');
    const batch = await runBatch(row.RunViewProvider, usesViews(`ComponentID IN (${inList})`), caller);
    if ('Error' in batch) return readRefusal(batch.Error);
    const uses = batch.Results.flat().map(asUse);
    return ComponentNameCollisionRefusal({
        NamesComponent: true,
        Collisions: componentIDs.map((id) => ({ References: uses.filter((use) => UUIDsEqual(use.ComponentID, id)) })),
        CallerID: caller.ID,
        CallerHoldsGrant: false,
    });
}

/** One view per form entity: the rows whose `ComponentID` matches the filter. */
function usesViews(filter: string): RunViewParams[] {
    return FORM_ROW_ENTITIES.map((EntityName) => ({
        EntityName,
        ExtraFilter: filter,
        Fields: ['ID', 'ComponentID', 'Scope', 'UserID'],
        ResultType: 'simple' as const,
        BypassCache: true,
    }));
}

/** The component's guarded columns as stored. */
function storedComponentView(componentID: string): RunViewParams {
    return {
        EntityName: 'MJ: Components',
        ExtraFilter: `ID='${EscapeSQLString(componentID)}'`,
        Fields: [...GUARDED_COMPONENT_FIELDS],
        ResultType: 'simple',
        BypassCache: true,
    };
}

/**
 * The other components a lookup by this name finds: the same `Name='...'` filter
 * `ComponentMetadataEngine.FindComponent` uses, in any namespace, because that lookup may be
 * made without one.
 */
function sameNameView(name: unknown, excludeID: string | null): RunViewParams {
    const nameFilter = `Name='${EscapeSQLString(String(name ?? '').trim())}'`;
    return {
        EntityName: 'MJ: Components',
        ExtraFilter: excludeID ? `${nameFilter} AND ID<>'${EscapeSQLString(excludeID)}'` : nameFilter,
        Fields: ['ID'],
        ResultType: 'simple',
        BypassCache: true,
    };
}

/** A form or panel row as a `simple` view returns it. */
function asUse(row: Record<string, unknown>): FormComponentUse {
    return {
        ID: String(row.ID ?? ''),
        ComponentID: String(row.ComponentID ?? ''),
        Scope: row.Scope as FormScope,
        UserID: typeof row.UserID === 'string' ? row.UserID : null,
    };
}

/** The guarded columns whose new value differs from the stored one. */
function changedFields(values: GuardedComponentValues, stored: Record<string, unknown>): GuardedComponentField[] {
    return GUARDED_COMPONENT_FIELDS.filter((field) => (values[field] ?? null) !== (stored[field] ?? null));
}

/** Runs the views as the caller. Any view that fails, or a throw, is an error. */
async function runBatch(provider: IRunViewProvider, views: RunViewParams[], caller: UserInfo): Promise<BatchOutcome> {
    try {
        const results = await new RunView(provider).RunViews<Record<string, unknown>>(views, caller);
        const reasons = views.flatMap((view, i) =>
            results?.[i]?.Success ? [] : [results?.[i]?.ErrorMessage || `${view.EntityName} could not be read`]);
        if (reasons.length > 0) {
            LogError(`Form component guard: a read failed, so the write is refused: ${reasons.join('; ')}`);
            return { Error: reasons.join('; ') };
        }
        return { Results: results.map((result) => result.Results ?? []) };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        LogError(`Form component guard: a read threw, so the write is refused: ${message}`);
        return { Error: message };
    }
}

function readRefusal(reason: string): string {
    return `The forms, panels and components this change depends on could not be read, so it is refused: ${reason}`;
}
