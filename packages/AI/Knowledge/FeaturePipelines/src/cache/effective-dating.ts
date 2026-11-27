/**
 * @fileoverview The effective-dating rules of a Feature Value write (PR 5 §5.2.1, D5-27): when a value takes effect,
 * the one open-row identity the filtered unique indexes, the write and the reader share, and the decision a write makes
 * against the identity's open row. Pure; no database access.
 * @module @memberjunction/feature-pipelines
 */
import type { MJFeatureValueEntity } from '@memberjunction/core-entities';
import { NormalizeUUID } from '@memberjunction/global';
import { RecordIDs } from '@memberjunction/record-set-processor-base';
import type { TypedFeatureValue } from './FeatureValueCacheService.js';

/** The columns a Feature Value's open-row identity is read from. */
export type FeatureValueIdentityColumns = Pick<MJFeatureValueEntity,
    'RecordProcessID' | 'MLModelScoringBindingID' | 'EntityID' | 'RecordID' | 'FeatureName' | 'PipelineVersion' | 'Source'>;

/** What a write does with one output against its identity's open row. */
export type FeatureValueDecision = 'unchanged' | 'close-and-open' | 'open';

/** The effective-dating rules of a Feature Value write. Every method is static and takes plain data. */
export class FeatureValueEffectiveDating {
    /**
     * The instant a value takes effect: the instant its input took its current value when the caller knows it
     * (`inputAsOf`), else the computation time. A value is never back-dated before its input existed.
     */
    public static EffectiveAsOf(inputAsOf: Date | null, computedAt: Date): Date {
        return inputAsOf || computedAt;
    }

    /**
     * The one open-row identity of a value (D5-27), as the filtered unique indexes key it: a `Pipeline` value is
     * (Record Process, entity, record, feature, pipeline version), a `Human` value (Record Process, scoring binding,
     * entity, record, feature). The pin's prompt version hash, model and parameters hash are attributes of the version,
     * not of the value, so a value a fallback model answered is still the same identity. IDs are normalised, the record
     * id and feature name compared as SQL Server's default collation does.
     */
    public static OpenIdentity(row: FeatureValueIdentityColumns): string {
        const id = (v: string | null): string => (v ? NormalizeUUID(v) : '');
        const common = [id(row.EntityID), RecordIDs.Key(row.RecordID), row.FeatureName.toLowerCase()];
        if (row.Source === 'Human') {
            return ['Human', id(row.RecordProcessID), id(row.MLModelScoringBindingID), ...common].join('|');
        }
        return [row.Source, id(row.RecordProcessID), ...common, row.PipelineVersion === null ? '' : String(row.PipelineVersion)].join('|');
    }

    /**
     * What a write does against `open`, the locked open row of the output's identity: none → `open`; the same input
     * hash and typed value → `unchanged` (nothing is written); anything else → `close-and-open` (the open row ends where
     * the new one starts).
     */
    public static Decide(open: MJFeatureValueEntity | undefined, typed: TypedFeatureValue, inputHash: string | null): FeatureValueDecision {
        if (!open) {
            return 'open';
        }
        const sameInput = (open.InputHash || null) === (inputHash || null);
        return sameInput && FeatureValueEffectiveDating.SameTypedValue(open, typed) ? 'unchanged' : 'close-and-open';
    }

    /** Whether a row holds exactly this typed value (dates by instant). */
    public static SameTypedValue(row: TypedFeatureValue, v: TypedFeatureValue): boolean {
        const time = (d: Date | string | null | undefined): number | null => (d ? new Date(d).getTime() : null);
        return (row.ValueText ?? null) === v.ValueText && (row.ValueNumeric ?? null) === v.ValueNumeric
            && (row.ValueBoolean ?? null) === v.ValueBoolean && time(row.ValueDate) === time(v.ValueDate)
            && (row.ValueJSON ?? null) === v.ValueJSON;
    }
}
