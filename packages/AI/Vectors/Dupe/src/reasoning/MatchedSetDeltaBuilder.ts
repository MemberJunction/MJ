/**
 * @fileoverview Builds the field-level deltas for a matched set, server-side.
 *
 * Mirrors the shape produced by `RecordComparisonEngine` in
 * `@memberjunction/core-entities-server`, but is implemented locally in this package
 * because `core-entities-server` *depends on* `@memberjunction/ai-vector-dupe` — importing
 * it here would create a build cycle. (Phase 1.5 may unify these once the cycle is broken;
 * for now the logic is duplicated deliberately and kept small.)
 *
 * It loads the source record + its candidates with a single read-only `RunView`
 * (`ResultType: 'simple'`, never mutating) and emits only the fields that differ across
 * the set, so the reasoner sees signal, not noise.
 *
 * @module @memberjunction/ai-vector-dupe
 */

import {
    RunView,
    CompositeKey,
    EntityInfo,
    EntityFieldInfo,
    UserInfo,
    LogError
} from '@memberjunction/core';
import { ReasoningFieldDelta } from './DuplicateReasoningTypes';

/** A scalar field value as loaded from the database. */
type FieldValue = string | number | boolean | null;

/**
 * Loads the records for a matched set and computes the differing-field deltas in the
 * shape the reasoning template expects ({@link ReasoningFieldDelta}).
 */
export class MatchedSetDeltaBuilder {
    private readonly runView: RunView;

    /**
     * @param runView a RunView bound to the detector's request-scoped provider
     */
    constructor(runView: RunView) {
        this.runView = runView;
    }

    /**
     * Build the field deltas for a matched set.
     *
     * @param entityInfo the entity being deduped
     * @param keys the source key first, then each candidate key (order preserved)
     * @param contextUser the run's context user
     * @returns differing-field deltas, or [] when records can't be loaded
     */
    public async Build(
        entityInfo: EntityInfo,
        keys: CompositeKey[],
        contextUser?: UserInfo
    ): Promise<ReasoningFieldDelta[]> {
        if (keys.length === 0) {
            return [];
        }
        const fields = this.selectFields(entityInfo);
        const rows = await this.loadRows(entityInfo, keys, fields, contextUser);
        if (rows === null) {
            return [];
        }
        const valuesByKey = this.mapRowsToKeys(entityInfo, keys, rows);
        return this.computeDeltas(fields, keys, valuesByKey);
    }

    /** Non-PK, non-system fields, in name-field → DefaultInView → Sequence order. */
    protected selectFields(entityInfo: EntityInfo): EntityFieldInfo[] {
        return entityInfo.Fields
            .filter(f => !f.IsPrimaryKey && !f.Name.startsWith('__mj_'))
            .sort((a, b) => this.fieldOrder(a, b));
    }

    /** Field ordering for stable, readable output. */
    protected fieldOrder(a: EntityFieldInfo, b: EntityFieldInfo): number {
        if (a.IsNameField !== b.IsNameField) {
            return a.IsNameField ? -1 : 1;
        }
        if (a.DefaultInView !== b.DefaultInView) {
            return a.DefaultInView ? -1 : 1;
        }
        return (a.Sequence ?? 0) - (b.Sequence ?? 0);
    }

    /** Single read-only RunView OR-ing every key. Returns rows or null on failure. */
    protected async loadRows(
        entityInfo: EntityInfo,
        keys: CompositeKey[],
        fields: EntityFieldInfo[],
        contextUser?: UserInfo
    ): Promise<Record<string, FieldValue>[] | null> {
        const filter = keys
            .filter(k => k.HasValue)
            .map(k => `(${k.ToWhereClause()})`)
            .join(' OR ');
        if (!filter) {
            return null;
        }

        const selectFields = new Set<string>();
        for (const pk of entityInfo.PrimaryKeys) {
            selectFields.add(pk.Name);
        }
        for (const f of fields) {
            selectFields.add(f.Name);
        }

        const result = await this.runView.RunView<Record<string, FieldValue>>({
            EntityName: entityInfo.Name,
            ExtraFilter: filter,
            Fields: Array.from(selectFields),
            ResultType: 'simple',
            MaxRows: keys.length
        }, contextUser);

        if (!result.Success) {
            LogError(`MatchedSetDeltaBuilder.loadRows failed: ${result.ErrorMessage}`);
            return null;
        }
        return result.Results ?? [];
    }

    /** Correlate each key (by its URL-segment string) to its loaded row's values. */
    protected mapRowsToKeys(
        entityInfo: EntityInfo,
        keys: CompositeKey[],
        rows: Record<string, FieldValue>[]
    ): Map<string, Record<string, FieldValue>> {
        const map = new Map<string, Record<string, FieldValue>>();
        for (const key of keys) {
            const row = rows.find(r => this.rowMatchesKey(entityInfo, key, r));
            map.set(this.keyId(key), row ?? {});
        }
        return map;
    }

    /** True when every PK value on the row equals the key's value (case-insensitive). */
    protected rowMatchesKey(
        entityInfo: EntityInfo,
        key: CompositeKey,
        row: Record<string, FieldValue>
    ): boolean {
        return entityInfo.PrimaryKeys.every(pk => {
            const keyValue = key.GetValueByFieldName(pk.Name);
            return this.valuesEqual(row[pk.Name], keyValue as FieldValue);
        });
    }

    /** Compute deltas for differing fields only. */
    protected computeDeltas(
        fields: EntityFieldInfo[],
        keys: CompositeKey[],
        valuesByKey: Map<string, Record<string, FieldValue>>
    ): ReasoningFieldDelta[] {
        const deltas: ReasoningFieldDelta[] = [];
        for (const field of fields) {
            const cells = keys.map(key => {
                const row = valuesByKey.get(this.keyId(key)) ?? {};
                return { recordId: this.keyId(key), value: this.toStringValue(row[field.Name]) };
            });
            if (this.allEmpty(cells) || !this.differs(cells)) {
                continue;
            }
            deltas.push({
                FieldName: field.Name,
                Values: cells.map(c => ({ RecordID: c.recordId, Value: c.value }))
            });
        }
        return deltas;
    }

    /** True when no cell carries a value. */
    protected allEmpty(cells: { value: string | null }[]): boolean {
        return cells.every(c => c.value === null || c.value === '');
    }

    /** True when at least one cell differs from the first (reference) cell. */
    protected differs(cells: { value: string | null }[]): boolean {
        const ref = cells.length > 0 ? cells[0].value : null;
        return cells.some(c => !this.stringsEqual(c.value, ref));
    }

    /** The URL-segment string id for a key (used for correlation + reasoner addressing). */
    protected keyId(key: CompositeKey): string {
        return key.Values();
    }

    /** Stringify a loaded value for the prompt; null/undefined → null. */
    protected toStringValue(value: FieldValue | undefined): string | null {
        if (value === null || value === undefined) {
            return null;
        }
        return String(value);
    }

    /** Case-insensitive trimmed equality of two stringified values. */
    protected stringsEqual(a: string | null, b: string | null): boolean {
        if (a === null) {
            return b === null;
        }
        if (b === null) {
            return false;
        }
        return a.trim().toLowerCase() === b.trim().toLowerCase();
    }

    /** Case-insensitive trimmed equality used for PK row matching. */
    protected valuesEqual(a: FieldValue, b: FieldValue): boolean {
        if (a === null || a === undefined) {
            return b === null || b === undefined;
        }
        if (b === null || b === undefined) {
            return false;
        }
        return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
    }
}
