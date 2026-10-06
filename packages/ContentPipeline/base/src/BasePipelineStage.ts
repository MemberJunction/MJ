/**
 * @fileoverview {@link BasePipelineStage} — the class a stage extends, and the registry key it is
 * discovered by.
 *
 * @module @memberjunction/content-pipeline-base
 */

import { MJGlobal } from '@memberjunction/global';
import { StageContext, StageOutcome } from './Stage.types.js';
import { WorkingRecord } from './WorkingRecord.js';
import { WellKnownField, WorkingRecordEntity } from './WorkingRecord.types.js';

/**
 * What a stage declares it touches.
 *
 * Nothing acts on this declaration today. It costs little and answers, without reading source, the
 * question this design exists to make answerable: what does inserting or removing this stage
 * actually touch.
 */
export interface StageDeclaration {
    /** Well-known fields the stage reads. */
    Reads: readonly WellKnownField[];
    /** Well-known fields the stage writes. */
    Writes: readonly WellKnownField[];
    /** Extension keys the stage reads, as `namespace.key`. */
    ReadsExtensions: readonly string[];
    /** Extension keys the stage writes, as `namespace.key`. */
    WritesExtensions: readonly string[];
}

/**
 * One record's result inside a batch finalize, paired with the record it belongs to.
 */
export interface FinalizeResult {
    /** The record this outcome is for, identified by {@link WorkingRecord.Identity}'s key. */
    Key: string;
    /** How that record finished. */
    Outcome: StageOutcome;
}

/**
 * A registered unit of pipeline work: one working record in, one out.
 *
 * Stages are discovered by name through MJ's class factory, so the processor has no compiled-in
 * knowledge of which stages exist. Adding one means writing a class and registering it; it never
 * means editing a fixed list.
 *
 * **Cold start is the normal case.** In production a stage is always handed a record hydrated from
 * storage moments ago, with no other stage having run in the same call. A stage must therefore
 * produce correct output from whatever is actually present, and treat the absence of an optional
 * field as a legitimate input rather than an error.
 *
 * @example
 * ```ts
 * @RegisterClass(BasePipelineStage, 'Extract')
 * export class ExtractStage extends BasePipelineStage {
 *     public readonly Name = 'Extract';
 *     public readonly Entity: WorkingRecordEntity = 'Content Item';
 *     public readonly StatusField = 'ExtractionStatus';
 *
 *     public async Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome> {
 *         ...
 *     }
 * }
 * ```
 */
export abstract class BasePipelineStage {
    /** The registered name. Must match the key passed to `@RegisterClass`. */
    public abstract readonly Name: string;

    /** Which entity this stage runs over. */
    public abstract readonly Entity: WorkingRecordEntity;

    /**
     * The column on {@link Entity} that says whether a record is ready for this stage — e.g.
     * `ExtractionStatus`. The committer advances it, and a Record Process row's readiness filter
     * reads it.
     */
    public abstract readonly StatusField: string;

    /**
     * The value {@link StatusField} takes when this stage succeeds.
     *
     * Almost every stage means 'Complete' by success, but the value belongs to the column, not to
     * the pipeline: `DeleteStatus` is a two-value soft-delete marker whose success is 'Deleted',
     * and writing 'Complete' into it violates its CHECK constraint. Stages whose status column has
     * its own vocabulary override this.
     */
    public get CompleteStatus(): string {
        return 'Complete';
    }

    /** What this stage reads and writes. Defaults to declaring nothing. */
    public get Declaration(): StageDeclaration {
        return { Reads: [], Writes: [], ReadsExtensions: [], WritesExtensions: [] };
    }

    /**
     * Do this stage's work on one record.
     *
     * Return an outcome rather than throwing where the distinction matters; a thrown
     * {@link TransientStageError} or {@link FatalStageError} is understood too, and any other throw
     * is treated as fatal.
     */
    public abstract Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome>;

    /**
     * Optional bulk step for a stage whose underlying operation is far cheaper in bulk — calling an
     * external model once for fifty texts, writing fifty vectors in one call.
     *
     * When a stage implements this, per-record {@link Run} work stays light: hydrate, validate, and
     * gather what the bulk call needs. `Finalize` then receives everything a page produced and
     * returns a final outcome per record.
     *
     * Declaring a finalize is a property of the stage; whether it is used is decided by the run. A
     * batch-capable stage that is not last in a chained test runs per-record, because a test needs
     * the same correctness rather than the bulk efficiency.
     */
    public Finalize?(records: readonly WorkingRecord[], context: StageContext): Promise<FinalizeResult[]>;

    /**
     * Resolve a registered stage by name.
     *
     * Uses `TryCreateInstance` rather than `CreateInstance` deliberately. `CreateInstance` does not
     * return null for an unregistered key — it falls back to `new BasePipelineStage()`, a hollow
     * object whose abstract `Name` / `Entity` / `Run` are undefined. A typo in a Record Process
     * row's stage list would then produce a stage that silently does nothing, and the failure would
     * not surface until something called it. The same trap is documented on `BaseSegmenter.Resolve`.
     *
     * @returns The stage, or `null` when nothing is registered under that name.
     */
    public static Resolve(name: string): BasePipelineStage | null {
        if (!name || name.trim().length === 0) {
            return null;
        }
        const result = MJGlobal.Instance.ClassFactory.TryCreateInstance<BasePipelineStage>(
            BasePipelineStage,
            name.trim(),
        );
        return result.Resolved ? result.Instance : null;
    }
}
