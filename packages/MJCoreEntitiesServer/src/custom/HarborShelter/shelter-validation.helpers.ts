import { BaseEntity, RunView, ValidationResult } from '@memberjunction/core';
import { ShelterFail } from '@memberjunction/core-entities';

/**
 * MJ Academy — read helpers shared by every Harbor Street server-side entity class.
 *
 * THE CONTRACT THAT MATTERS: a read either SUCCEEDS (with a row, or with nothing) or FAILS, and the
 * two must never collapse into one `null`. Treating a failed read as "nothing found" silently skips
 * the rule and writes the row anyway — and nothing downstream catches it, because a foreign key
 * knows nothing about capacity, species or vaccination history.
 */

export type ShelterRead<T> = { ok: true; row: T | null } | { ok: false };
export type ShelterReadList<T> = { ok: true; rows: T[] } | { ok: false };
export type ShelterCount = { ok: true; count: number } | { ok: false };

/** Read at most one row. See the module note on the ok/fail contract. */
export async function ShelterReadOne<T>(
    entity: BaseEntity,
    entityName: string,
    filter: string,
    fields: string[],
): Promise<ShelterRead<T>> {
    try {
        const rv = new RunView(entity.RunViewProviderToUse);
        const res = await rv.RunView<T>(
            { EntityName: entityName, ExtraFilter: filter, Fields: fields, MaxRows: 1, ResultType: 'simple' },
            entity.ContextCurrentUser,
        );
        if (!res.Success) return { ok: false };
        return { ok: true, row: res.Results?.[0] ?? null };
    } catch {
        return { ok: false };
    }
}

/**
 * Read every matching row. Use only where the ROWS are needed -- to name the offenders in an error
 * message, say. When a number is all you need, ShelterCountRows transfers one row instead of all of
 * them.
 */
export async function ShelterReadMany<T>(
    entity: BaseEntity,
    entityName: string,
    filter: string,
    fields: string[],
): Promise<ShelterReadList<T>> {
    try {
        const rv = new RunView(entity.RunViewProviderToUse);
        const res = await rv.RunView<T>(
            { EntityName: entityName, ExtraFilter: filter, Fields: fields, ResultType: 'simple' },
            entity.ContextCurrentUser,
        );
        if (!res.Success) return { ok: false };
        return { ok: true, rows: res.Results ?? [] };
    } catch {
        return { ok: false };
    }
}

/** A COUNT, not a fetch: MaxRows 1 plus TotalRowCount asks SQL to count and transfers one row. */
export async function ShelterCountRows(
    entity: BaseEntity,
    entityName: string,
    filter: string,
): Promise<ShelterCount> {
    try {
        const rv = new RunView(entity.RunViewProviderToUse);
        const res = await rv.RunView<{ ID: string }>(
            { EntityName: entityName, ExtraFilter: filter, Fields: ['ID'], MaxRows: 1, ResultType: 'simple' },
            entity.ContextCurrentUser,
        );
        if (!res.Success) return { ok: false };
        return { ok: true, count: res.TotalRowCount ?? 0 };
    } catch {
        return { ok: false };
    }
}

/**
 * FAIL CLOSED when a rule could not be evaluated. Blocking a legitimate save is recoverable — the
 * user retries and sees why. Writing an illegitimate one is not: the bad row is durable.
 */
export function ShelterUnverified(result: ValidationResult, field: string, what: string): void {
    ShelterFail(result, field, `Could not verify ${what} — the check could not be completed. Please try again.`, null);
}

/** True when the record is new, or any named field is dirty. Drives every fast path. */
export function ShelterIsNewOrDirty(entity: BaseEntity, ...fields: string[]): boolean {
    if (!entity.IsSaved) return true;
    return fields.some((f) => entity.GetFieldByName(f)?.Dirty === true);
}

/** Statuses meaning the animal is physically here and therefore occupying a unit. */
export const SHELTER_IN_CARE: ReadonlyArray<string> = ['Intake', 'Available', 'Hold'];
export const SHELTER_IN_CARE_SQL = `Status IN ('Intake', 'Available', 'Hold')`;
