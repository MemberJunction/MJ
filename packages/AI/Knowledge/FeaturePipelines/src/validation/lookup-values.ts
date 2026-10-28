/**
 * @fileoverview Loads the rows a lookup constraint allows, so a Feature Pipeline both checks an answer against them
 * and renders them into the prompt (the taxonomy comes from rows, not from template text).
 * @module @memberjunction/feature-pipelines
 */
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
import { OrdinalCompare } from '@memberjunction/global';
import type { ResolvedConstraint } from '../spec/value-constraint.js';

/** One allowed value of a lookup: the matched column and the text shown to the model. */
export interface LookupValueRow {
    /** The match column's value (what the model must answer). */
    Match: string;
    /** The display columns joined with " — "; null when they are all empty. */
    Display: string | null;
}

/** A lookup constraint's allowed values: loading them and attaching them to a resolved constraint. */
export class LookupConstraintValues {
    /** Field names are spliced into the view's field list, so they must be plain identifiers. */
    private static readonly IDENTIFIER = /^[A-Za-z0-9_]+$/;

    /**
     * Reads the lookup entity's allowed values (every row matching the optional Filter), skipping rows with an empty
     * match column, in a stable order (the list is hashed and rendered into the prompt).
     * @param resolved - the output's lookup constraint as `ResolveConstraint` resolved it
     * @throws Error when no entity resolved, a field is not a plain identifier, or the read fails.
     */
    public static async Load(resolved: ResolvedConstraint, provider: IMetadataProvider, contextUser: UserInfo): Promise<LookupValueRow[]> {
        const entity = resolved.RelatedEntityName;
        if (!entity) {
            throw new Error('A lookup constraint needs Entity, or a target field with a foreign key, to load its allowed values.');
        }
        const matchField = resolved.LookupMatchField || 'Name';
        const displayFields = resolved.DisplayFields || [];
        LookupConstraintValues.AssertIdentifiers([matchField, ...displayFields], entity);
        // `unknown` on purpose: the lookup entity and its columns are named by the spec at run time, so a row has no static type
        const res = await RunView.FromMetadataProvider(provider).RunView<Record<string, unknown>>({
            EntityName: entity,
            ExtraFilter: resolved.Filter,
            OrderBy: matchField,
            Fields: [matchField, ...displayFields],
            ResultType: 'simple',
            IgnoreMaxRows: true,
        }, contextUser);
        if (!res.Success) {
            throw new Error(`Loading the allowed values of '${entity}' failed: ${res.ErrorMessage}`);
        }
        return LookupConstraintValues.InStableOrder((res.Results || []).flatMap((row) => LookupConstraintValues.ToValueRow(row, matchField, displayFields)));
    }

    /**
     * The rows sorted by match value with an ordinal comparison: a database's collation may order them differently
     * (or not at all), and the ordinal order is the same on every provider.
     */
    public static InStableOrder(rows: LookupValueRow[]): LookupValueRow[] {
        return [...rows].sort((a, b) => OrdinalCompare(a.Match, b.Match));
    }

    /** A resolved lookup constraint carrying its allowed values and their display text. */
    public static Apply(resolved: ResolvedConstraint, rows: LookupValueRow[]): ResolvedConstraint {
        const displays: Record<string, string> = {};
        for (const r of rows) {
            if (r.Display) {
                displays[r.Match] = r.Display;
            }
        }
        return { ...resolved, AllowedValues: rows.map((r) => r.Match), ValueDisplays: Object.keys(displays).length > 0 ? displays : undefined };
    }

    /** One view row as an allowed value; none when its match column is empty. `row` is a runtime-shaped simple row (see {@link Load}). */
    protected static ToValueRow(row: Record<string, unknown>, matchField: string, displayFields: string[]): LookupValueRow[] {
        const match = row[matchField];
        if (match === null || match === undefined || String(match).trim() === '') {
            return [];
        }
        const parts = displayFields.map((f) => row[f])
            .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
            .map((v) => String(v));
        return [{ Match: String(match), Display: parts.length > 0 ? parts.join(' — ') : null }];
    }

    /** @throws Error naming the first field that is not a plain identifier. */
    protected static AssertIdentifiers(fields: string[], entity: string): void {
        const bad = fields.find((f) => !LookupConstraintValues.IDENTIFIER.test(f));
        if (bad !== undefined) {
            throw new Error(`Invalid field name '${bad}' in the lookup constraint on '${entity}'.`);
        }
    }
}
