/**
 * @fileoverview {@link BasePipelineStage} — the class a stage extends, resolved by name through MJ's class factory.
 *
 * @module @memberjunction/content-pipeline-base
 */

import { MJGlobal } from '@memberjunction/global';
import { StageContext, StageOutcome } from './Stage.types.js';
import { WorkingRecord } from './WorkingRecord.js';
import { WellKnownField, WorkingRecordEntity } from './WorkingRecord.types.js';

/** What a stage reads and writes. Advisory: nothing enforces it. */
export interface StageDeclaration {
    Reads: readonly WellKnownField[];
    Writes: readonly WellKnownField[];
    /** Extension keys, as `namespace.key`. */
    ReadsExtensions: readonly string[];
    WritesExtensions: readonly string[];
}

/** One record's result from a batch {@link BasePipelineStage.Finalize}. */
export interface FinalizeResult {
    /** The record's {@link WorkingRecord.Identity} key. */
    Key: string;
    Outcome: StageOutcome;
}

/**
 * A registered unit of pipeline work: one working record in, one outcome out. Adding a stage is writing a
 * class and registering it — never editing a list.
 *
 * Cold start is the normal case: in production a stage gets a record hydrated moments ago, with no other
 * stage having run in the same call, so a missing optional field is a legitimate input.
 *
 * @example
 * ```ts
 * @RegisterClass(BasePipelineStage, 'Extract')
 * export class ExtractStage extends BasePipelineStage {
 *     public readonly Name = 'Extract';
 *     public readonly Entity: WorkingRecordEntity = 'Content Item';
 *     public readonly StatusField = 'ExtractionStatus';
 *     public async Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome> { ... }
 * }
 * ```
 */
export abstract class BasePipelineStage {
    /** The registered name; must match the `@RegisterClass` key. */
    public abstract readonly Name: string;

    /** The entity this stage runs over. */
    public abstract readonly Entity: WorkingRecordEntity;

    /**
     * The status column the committer advances and a Record Process's filter reads (e.g. `ExtractionStatus`).
     * `null` for Discover, which walks every source selected by the Record Process filter rather than advancing a status.
     */
    public abstract readonly StatusField: string | null;

    /** The value {@link StatusField} takes on success. The vocabulary belongs to the column (`DeleteStatus` uses 'Deleted'). */
    public get CompleteStatus(): string {
        return 'Complete';
    }

    /** The value for a Skipped or finally Failed outcome, or `null` to leave the column alone. */
    public StatusForOutcome(outcome: 'Skipped' | 'Failed'): string | null {
        return outcome;
    }

    public get Declaration(): StageDeclaration {
        return { Reads: [], Writes: [], ReadsExtensions: [], WritesExtensions: [] };
    }

    /**
     * Do this stage's work on one record. Return an outcome; a thrown {@link TransientStageError} or
     * {@link FatalStageError} is understood too, and any other throw is treated as fatal.
     */
    public abstract Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome>;

    /**
     * Optional bulk step for work far cheaper in bulk (one embedding call for fifty texts). `Run` then only
     * gathers; `Finalize` gets the page's records and returns one outcome each. Used only when the stage is
     * last in the run's list.
     */
    public Finalize?(records: readonly WorkingRecord[], context: StageContext): Promise<FinalizeResult[]>;

    /**
     * Resolve a registered stage, or `null`. Uses `TryCreateInstance` because `CreateInstance` falls back to a
     * hollow base instance on an unknown key, which would make a typo in a Record Process silently do nothing.
     */
    public static Resolve(name: string): BasePipelineStage | null {
        if (!name || name.trim().length === 0) {
            return null;
        }
        const result = MJGlobal.Instance.ClassFactory.TryCreateInstance<BasePipelineStage>(BasePipelineStage, name.trim());
        return result.Resolved ? result.Instance : null;
    }
}
