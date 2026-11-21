/**
 * @fileoverview Resolves a Feature Pipeline's output constraints the one way both the runner and the builder's
 * preview use, so the preview shows the constraint block the model is sent.
 * @module @memberjunction/feature-pipelines
 */
import { ResolveConstraint, type DataFeatureOutput, type EntityMetadataStub, type FieldMetadataStub } from '../spec/data-feature-spec.js';
import { OutputTargets } from '../spec/output-target.js';
import type { ResolvedConstraint } from '../spec/value-constraint.js';
import { LookupConstraintValues, type LookupValueRow } from './lookup-values.js';

/** Loads a lookup constraint's allowed rows (the runner reads them through the run's provider; the builder caches them). */
export type LookupRowsLoader = (resolved: ResolvedConstraint) => Promise<LookupValueRow[]>;

/** Every output's resolved constraint, by output name (null for an output without a constraint). */
export type ResolvedOutputConstraints = Map<string, ResolvedConstraint | null>;

/** Output constraints resolved against the target entity's fields, and lookups' allowed rows attached. */
export class OutputConstraintResolver {
    /**
     * Each output's constraint resolved against its target field (a field-target output with a constraint only; field
     * names compared case-insensitively): an enum's field value list and a lookup's entity and match field. No rows are
     * loaded, so a lookup has no `AllowedValues` yet. Synchronous: a preview can render this at once.
     * @param entity - the pipeline's entity; undefined resolves every constraint from the spec alone
     */
    public static ResolveFromFields(outputs: DataFeatureOutput[], entity: EntityMetadataStub | undefined): ResolvedOutputConstraints {
        return new Map(outputs.map((output) => [output.Name, ResolveConstraint(output, OutputConstraintResolver.FieldOf(output, entity))] as const));
    }

    /**
     * {@link ResolveFromFields}, with each lookup's allowed rows loaded by `loadRows` (in parallel) and attached
     * ({@link LookupConstraintValues.Apply}). This is the map the runner renders and validates with.
     * @throws whatever `loadRows` throws for a lookup
     */
    public static async Resolve(outputs: DataFeatureOutput[], entity: EntityMetadataStub | undefined, loadRows: LookupRowsLoader): Promise<ResolvedOutputConstraints> {
        const fromFields = OutputConstraintResolver.ResolveFromFields(outputs, entity);
        const entries = await Promise.all(outputs.map(async (output) => {
            const resolved = fromFields.get(output.Name) || null;
            if (!resolved || output.Constraint?.Type !== 'lookup') {
                return [output.Name, resolved] as const;
            }
            return [output.Name, LookupConstraintValues.Apply(resolved, await loadRows(resolved))] as const;
        }));
        return new Map(entries);
    }

    /** The target field a constrained field-target output resolves against; undefined for any other output. */
    protected static FieldOf(output: DataFeatureOutput, entity: EntityMetadataStub | undefined): FieldMetadataStub | undefined {
        if (!output.Constraint || !OutputTargets.HasWriteTarget(output) || output.Target.Mode !== 'field' || !entity) {
            return undefined;
        }
        const wanted = output.Target.EntityFieldName.toLowerCase();
        return entity.Fields.find((f) => f.Name.toLowerCase() === wanted);
    }
}
