import {
    CompositeKey,
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
    type OwnedComponentCheck,
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

/** The views one guard batch can run, by role. */
type ViewRole = 'contributions' | 'overrides' | 'stored' | 'sameName' | 'created';

/** A batch to run: undefined leaves a view out, null is a view that could not be built. */
type ViewSet = Partial<Record<ViewRole, RunViewParams | null | undefined>>;

/** The rows each view returned, by role, or why the batch failed. */
type BatchOutcome = { Results: Partial<Record<ViewRole, Array<Record<string, unknown>>>> } | { Error: string };

/** Who is writing, as every guard needs to know. */
interface GuardCaller {
    User: UserInfo;
    HoldsGrant: boolean;
    RunViewProvider: IRunViewProvider;
    MetadataProvider: IMetadataProvider;
}

/**
 * Why this write to a component is refused, or null when it may proceed.
 *
 * With no caller (a trusted server context) nothing is checked. A create by a caller without the
 * `Manage Form Defaults` grant is checked for a name another component already has. An update or
 * delete reads, in one batch and as the caller: every form and panel row that uses the component,
 * the component's stored guarded columns (update), the other components with the same name
 * (update without the grant), and whether the caller created the component (without the grant).
 * These are read for every update, whatever it changes. The changed columns are found by
 * comparing the write's values with the stored ones. When a read fails, the write is refused.
 */
export async function ComponentGuardRefusal(row: GuardedComponentRow, operation: FormScopeOperation): Promise<string | null> {
    const caller = guardCaller(row);
    if (!caller) return null;
    if (operation === 'create') return caller.HoldsGrant ? null : createNameRefusal(row, caller);
    const isUpdate = operation === 'update';
    const batch = await runBatch(caller, {
        ...usesViews([row.ID]),
        stored: isUpdate ? storedComponentView(row.ID) : undefined,
        sameName: isUpdate && !caller.HoldsGrant ? sameNameView(row.Values.Name, row.ID) : undefined,
        created: caller.HoldsGrant ? undefined : createdByCallerView(caller, [row.ID]),
    });
    if ('Error' in batch) return readRefusal(batch.Error);
    const stored = batch.Results.stored ?? [];
    if (isUpdate && stored.length === 0) return readRefusal('the component as stored was not found');
    const changed = isUpdate ? changedFields(row.Values, stored[0]) : [];
    const writeRefusal = ComponentWriteRefusal({
        Operation: operation,
        ChangedFields: changed,
        ...ownership(batch.Results, row.ID),
        CallerID: caller.User.ID,
        CallerHoldsGrant: caller.HoldsGrant,
    });
    if (writeRefusal || caller.HoldsGrant || !changed.some((f) => f === 'Name' || f === 'Namespace')) return writeRefusal;
    return collisionRefusal(caller, idsOf(batch.Results.sameName));
}

/**
 * Why a form or panel row may not point at its component, or null when it may.
 *
 * Checked when the row is created or its `ComponentID` differs from the value as loaded, for a
 * caller; a trusted server context with no caller is not checked. The rows that use the component
 * and, without the grant, whether the caller created it are read in one batch as the caller and
 * checked with `FormRowComponentRefusal`. When a read fails, the write is refused.
 */
export async function FormRowComponentGuardRefusal(row: GuardedFormComponentRow): Promise<string | null> {
    const caller = guardCaller(row);
    if (!caller || !row.ComponentID) return null;
    const prior = row.GetFieldByName('ComponentID')?.OldValue;
    if (row.IsSaved && typeof prior === 'string' && UUIDsEqual(prior, row.ComponentID)) return null;
    const batch = await runBatch(caller, {
        ...usesViews([row.ComponentID]),
        created: caller.HoldsGrant ? undefined : createdByCallerView(caller, [row.ComponentID]),
    });
    if ('Error' in batch) return readRefusal(batch.Error);
    return FormRowComponentRefusal({
        RowID: row.IsSaved ? row.ID : null,
        ...ownership(batch.Results, row.ComponentID),
        CallerID: caller.User.ID,
        CallerHoldsGrant: caller.HoldsGrant,
    });
}

/** The caller and whether they hold the grant, or null with no caller. */
function guardCaller(row: { ActiveUser: UserInfo | null; RunViewProvider: IRunViewProvider; MetadataProvider: IMetadataProvider }): GuardCaller | null {
    if (!row.ActiveUser) return null;
    return {
        User: row.ActiveUser,
        HoldsGrant: UserCanManageFormDefaults(row.ActiveUser, row.MetadataProvider),
        RunViewProvider: row.RunViewProvider,
        MetadataProvider: row.MetadataProvider,
    };
}

/** The name check for a create: the other components with this name, then whose they are. */
async function createNameRefusal(row: GuardedComponentRow, caller: GuardCaller): Promise<string | null> {
    const batch = await runBatch(caller, { sameName: sameNameView(row.Values.Name, null) });
    if ('Error' in batch) return readRefusal(batch.Error);
    return collisionRefusal(caller, idsOf(batch.Results.sameName));
}

/** Applies `ComponentNameCollisionRefusal` to these same-named components, reading whose they are. */
async function collisionRefusal(caller: GuardCaller, componentIDs: string[]): Promise<string | null> {
    if (componentIDs.length === 0) return null;
    const batch = await runBatch(caller, {
        ...usesViews(componentIDs),
        created: createdByCallerView(caller, componentIDs),
    });
    if ('Error' in batch) return readRefusal(batch.Error);
    return ComponentNameCollisionRefusal({
        NamesComponent: true,
        Collisions: componentIDs.map((id) => ownership(batch.Results, id)),
        CallerID: caller.User.ID,
        CallerHoldsGrant: false,
    });
}

/** The rows that use one component, and whether the caller created it, from a batch's results. */
function ownership(results: Partial<Record<ViewRole, Array<Record<string, unknown>>>>, componentID: string): OwnedComponentCheck {
    const uses = [...(results.contributions ?? []), ...(results.overrides ?? [])].map(asUse);
    const createdKey = recordChangeKey(componentID).toLowerCase();
    return {
        References: uses.filter((use) => UUIDsEqual(use.ComponentID, componentID)),
        CreatedByCaller: (results.created ?? []).some((r) => String(r.RecordID ?? '').toLowerCase() === createdKey),
    };
}

/** One view per form entity: the rows that use any of these components. */
function usesViews(componentIDs: string[]): Pick<Record<ViewRole, RunViewParams>, 'contributions' | 'overrides'> {
    const filter = componentIDs.length === 1
        ? `ComponentID='${EscapeSQLString(componentIDs[0])}'`
        : `ComponentID IN (${componentIDs.map((id) => `'${EscapeSQLString(id)}'`).join(',')})`;
    const view = (EntityName: string): RunViewParams => ({
        EntityName,
        ExtraFilter: filter,
        Fields: ['ID', 'ComponentID', 'Scope', 'UserID'],
        ResultType: 'simple',
        BypassCache: true,
    });
    return { contributions: view(FORM_ROW_ENTITIES[0]), overrides: view(FORM_ROW_ENTITIES[1]) };
}

/**
 * The caller's `Create` record changes for these components, with `Source` 'Internal'.
 * `MJ: Components` tracks record changes, so every component created through the platform has one,
 * written by the database provider in the same batch as the insert. `MJRecordChangeEntityServer`
 * refuses an Internal `Create` record change created by a caller, so such a row cannot be forged
 * through the API. Null when the component entity is missing from the metadata, which `runBatch` reports as a
 * failed read.
 */
function createdByCallerView(caller: GuardCaller, componentIDs: string[]): RunViewParams | null {
    const componentEntity = caller.MetadataProvider.EntityByName('MJ: Components');
    if (!componentEntity) return null;
    const recordIDs = componentIDs.map((id) => `'${EscapeSQLString(recordChangeKey(id))}'`).join(',');
    return {
        EntityName: 'MJ: Record Changes',
        ExtraFilter: `EntityID='${EscapeSQLString(componentEntity.ID)}' AND Source='Internal' AND Type='Create' ` +
            `AND UserID='${EscapeSQLString(caller.User.ID)}' AND RecordID IN (${recordIDs})`,
        Fields: ['RecordID'],
        ResultType: 'simple',
        BypassCache: true,
    };
}

/** A component's `RecordID` as `MJ: Record Changes` stores it for 'MJ: Components': `ID|<id>`. */
function recordChangeKey(componentID: string): string {
    return CompositeKey.FromID(componentID).ToURLSegment(); // first-pk-ok: 'MJ: Components' has the single key ID
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
 * The other components a lookup by this name finds. The name is compared trimmed and lower-cased,
 * as `ComponentMetadataEngineServer.FindComponent` compares it, so stored padding or a
 * case-sensitive database cannot hide a match. It is matched in any namespace, because a lookup
 * may be made without one. The new name is trimmed of all whitespace, as the lookup trims it; SQL
 * `LTRIM`/`RTRIM` remove only spaces from the stored name, so a stored name padded with a tab or a
 * line break is not matched. On SQL Server the name is a Unicode literal (`N'...'`), so a name with
 * characters outside the database's code page is compared as stored.
 */
function sameNameView(name: unknown, excludeID: string | null): RunViewParams {
    const literal = EscapeSQLString(String(name ?? '').trim());
    const exclude = excludeID ? ` AND ID<>'${EscapeSQLString(excludeID)}'` : '';
    return {
        EntityName: 'MJ: Components',
        ExtraFilter: {
            default: `LOWER(LTRIM(RTRIM(Name)))=LOWER('${literal}')${exclude}`,
            sqlserver: `LOWER(LTRIM(RTRIM(Name)))=LOWER(N'${literal}')${exclude}`,
        },
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

function idsOf(rows: Array<Record<string, unknown>> | undefined): string[] {
    return (rows ?? []).map((r) => String(r.ID));
}

/** The guarded columns whose new value differs from the stored one. */
function changedFields(values: GuardedComponentValues, stored: Record<string, unknown>): GuardedComponentField[] {
    return GUARDED_COMPONENT_FIELDS.filter((field) => (values[field] ?? null) !== (stored[field] ?? null));
}

/**
 * Runs the given views in one `RunViews` call as the caller. A view that could not be built, any
 * view that fails, or a throw is an error.
 */
async function runBatch(caller: GuardCaller, views: ViewSet): Promise<BatchOutcome> {
    const entries = Object.entries(views) as Array<[ViewRole, RunViewParams | null | undefined]>;
    if (entries.some(([, view]) => view === null)) {
        return failedRead('the MJ: Components entity is not in the metadata');
    }
    const present = entries.filter((entry): entry is [ViewRole, RunViewParams] => !!entry[1]);
    try {
        const results = await new RunView(caller.RunViewProvider).RunViews<Record<string, unknown>>(present.map(([, view]) => view), caller.User);
        const reasons = present.flatMap(([, view], i) =>
            results?.[i]?.Success ? [] : [results?.[i]?.ErrorMessage || `${view.EntityName} could not be read`]);
        if (reasons.length > 0) return failedRead(reasons.join('; '));
        return { Results: Object.fromEntries(present.map(([role], i) => [role, results[i].Results ?? []])) };
    } catch (err) {
        return failedRead(err instanceof Error ? err.message : String(err));
    }
}

function failedRead(reason: string): BatchOutcome {
    LogError(`Form component guard: a read failed, so the write is refused: ${reason}`);
    return { Error: reason };
}

function readRefusal(reason: string): string {
    return `The forms, panels and components this change depends on could not be read, so it is refused: ${reason}`;
}
