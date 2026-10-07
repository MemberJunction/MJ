/**
 * @fileoverview {@link NoOpStage} — a stage that does nothing, used to prove the platform
 * integration before any real complexity lands on it.
 *
 * Phase F1's exit criterion: run this against a real `Record Process` row and confirm the work type
 * resolves, the processor is built, records are hydrated, and commits land — all before a stage with
 * real behaviour exists to confuse a failure.
 *
 * @module @memberjunction/content-pipeline
 */

import { RegisterClass } from '@memberjunction/global';
import {
    BasePipelineStage,
    Outcome,
    StageContext,
    StageDeclaration,
    StageOutcome,
    WorkingRecord,
    WorkingRecordEntity,
} from '@memberjunction/content-pipeline-base';

/** The registered name. */
export const NO_OP_STAGE = 'NoOp';

/**
 * Completes every record without changing anything.
 *
 * It does write one extension key, so a chained test can prove that a stage's output reaches the
 * next stage in memory — but nothing that would persist.
 */
@RegisterClass(BasePipelineStage, NO_OP_STAGE)
export class NoOpStage extends BasePipelineStage {
    public readonly Name = NO_OP_STAGE;
    public readonly Entity: WorkingRecordEntity = 'Content Item';
    public readonly StatusField = 'ExtractionStatus';

    public override get Declaration(): StageDeclaration {
        return {
            Reads: [],
            Writes: [],
            ReadsExtensions: [],
            WritesExtensions: [`${NO_OP_STAGE}.ranAt`],
        };
    }

    public async Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome> {
        if (context.Signal.aborted) {
            return Outcome.Retry('cancelled before the no-op stage started');
        }
        context.ReportProgress(`NoOp on ${record.Identity.Key}`);
        record.SetExtension(NO_OP_STAGE, 'ranAt', new Date().toISOString());
        return Outcome.Complete();
    }
}
