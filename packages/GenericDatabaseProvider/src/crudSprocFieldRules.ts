/**
 * @fileoverview CRUD sproc field-inclusion and `_Clear`-companion rules.
 *
 * Single source of truth for the decisions that both CodeGen and the runtime
 * data providers must agree on when constructing CRUD stored procedures
 * (`spCreate*` / `spUpdate*` / `spDelete*`).
 *
 * If CodeGen and the provider call-site use different rules, sproc shape
 * disagrees with caller invocation and every save fails at runtime. Co-locating
 * the rules here prevents that drift.
 *
 * Used by:
 * - `GenericDatabaseProvider.UseJsonArgShape()` — runtime predicate that decides
 *   whether to construct a typed-arg `EXEC` or a JSON-arg call for a given entity.
 * - CodeGen base + dialect providers — same predicate gates which sproc DDL
 *   shape gets emitted for each entity.
 *
 * See [plans/json-arg-crud-sprocs.md](../../../plans/json-arg-crud-sprocs.md)
 * and GitHub issue #2552.
 */

import { EntityInfo, EntityFieldInfo } from '@memberjunction/core';

/**
 * Which CRUD verb a sproc projection / inclusion check is being computed for.
 */
export type CRUDSprocType = 'create' | 'update' | 'delete';

/**
 * Soft ceiling on PostgreSQL CRUD sproc parameter counts. PG's hard
 * `FUNC_MAX_ARGS` is 100 (compiled into the server, not adjustable on managed
 * services). 90 leaves 10 args of headroom so adding a column to an entity
 * near the limit doesn't unexpectedly flip its sproc shape between releases.
 *
 * Single source of truth for both runtime (`PostgreSQLDataProvider.ProcedureParamLimit`)
 * and CodeGen (which doesn't have a live provider instance to query at codegen
 * time). Bumping this value should regenerate sprocs for any entity newly
 * crossing the threshold.
 */
export const POSTGRESQL_PROCEDURE_PARAM_LIMIT = 90;

/**
 * Returns true when this field should appear in the parameter list of the
 * named CRUD sproc. Pure decision logic — same rules used by CodeGen at
 * generation time and by the data provider at call-construction time.
 *
 * Rules:
 * - Virtual fields and special-date fields (`__mj_CreatedAt`/`__mj_UpdatedAt`)
 *   are never included.
 * - For DELETE: only primary-key fields are included.
 * - For UPDATE: PKs always; non-PKs only if the field allows update via API.
 * - For CREATE: PKs only when not auto-incrementing (otherwise the database
 *   supplies the value); non-PKs only if the field allows update via API.
 */
export function shouldIncludeFieldInParams(field: EntityFieldInfo, sprocType: CRUDSprocType): boolean {
    if (field.IsVirtual) return false;
    if (field.IsSpecialDateField) return false;

    if (sprocType === 'delete') {
        // DELETE only takes PK params — no non-PK fields participate.
        return field.IsPrimaryKey;
    }

    if (field.IsPrimaryKey) {
        // PK on update: always included. On create: included only if NOT auto-increment.
        return sprocType === 'update' || !field.AutoIncrement;
    }

    // Non-PK on create or update: must be writable via API.
    return field.AllowUpdateAPI;
}

/**
 * Returns true when this field would have a `_Clear` companion BOOLEAN
 * parameter under the **broad** tolerant-SP rule.
 *
 * Broad rule (intentional default): any nullable column gets a `_Clear`
 * companion so callers can persist explicit NULL on fields that COALESCE-merge
 * would otherwise preserve. This is what the typed-arg sproc *would* emit
 * for a given entity if there were no platform constraints.
 *
 * Used here for **projection** — counting what a typed-arg sproc would take
 * to decide whether a JSON-arg shape is needed instead. The PG CodeGen
 * provider currently overrides its emit-time rule to a narrower variant
 * (`needsClearCompanion`) for entities under the JSON-arg threshold; that
 * narrowing is being phased out as the JSON-arg branch takes over for wide
 * entities (see issue #2552).
 */
export function needsClearCompanionBroadRule(field: EntityFieldInfo): boolean {
    return field.AllowsNull;
}

/**
 * Projects how many parameters a typed-arg CRUD sproc would declare for
 * the given entity + sproc verb under broad-rule semantics. Includes base
 * field params and any `_Clear` companions the broad rule would add.
 *
 * `spDelete` projects to its PK count (1 for single-UUID-PK entities) — no
 * `_Clear` companions because DELETE only takes PK params, and PKs aren't
 * nullable.
 */
export function projectedParamCount(entity: EntityInfo, sprocType: CRUDSprocType): number {
    const includedFields = entity.Fields.filter((f) => shouldIncludeFieldInParams(f, sprocType));
    const baseCount = includedFields.length;
    const clearCompanionCount =
        sprocType === 'delete' ? 0 : includedFields.filter((f) => !f.IsPrimaryKey && needsClearCompanionBroadRule(f)).length;
    return baseCount + clearCompanionCount;
}

/**
 * Decides whether the given entity + sproc combination should use a single
 * JSON-arg shape (vs. the default typed-arg + `_Clear` companion shape).
 *
 * Returns true when the projected parameter count meets or exceeds the
 * supplied limit — meaning a typed-arg sproc would either bust a hard
 * platform constraint (PostgreSQL's `FUNC_MAX_ARGS` of 100) or get
 * uncomfortably close to one.
 *
 * Pure function: takes the param limit as a number rather than a provider
 * instance so it's trivially callable from CodeGen (which doesn't always
 * have a live provider) and trivially unit-testable.
 *
 * Same predicate is invoked by `GenericDatabaseProvider.UseJsonArgShape()`
 * at runtime and by CodeGen at generation time, guaranteeing the two stay
 * in lockstep.
 */
export function useJsonArgShape(entity: EntityInfo, sprocType: CRUDSprocType, paramLimit: number): boolean {
    if (!isFinite(paramLimit)) return false;
    return projectedParamCount(entity, sprocType) >= paramLimit;
}
