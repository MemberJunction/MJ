/**
 * @fileoverview {@link NoOpStage} — does nothing but report progress. Proves the processor, tracker and
 * commit path end to end with no real stage involved.
 *
 * @module @memberjunction/content-pipeline
 */

import { RegisterClass } from '@memberjunction/global';
import {
    BasePipelineStage,
    Outcome,
    StageContext,
    StageOutcome,
    WorkingRecord,
    WorkingRecordEntity,
} from '@memberjunction/content-pipeline-base';

/** The registered name. */
export const NO_OP_STAGE = 'NoOp';

@RegisterClass(BasePipelineStage, NO_OP_STAGE)
export class NoOpStage extends BasePipelineStage {
    public readonly Name = NO_OP_STAGE;
    public readonly Entity: WorkingRecordEntity = 'Content Item';
    public readonly StatusField = 'ExtractionStatus';

    public async Run(record: WorkingRecord, context: StageContext): Promise<StageOutcome> {
        context.ReportProgress(`NoOp on ${record.Identity.Key}`);
        record.SetExtension(NO_OP_STAGE, 'ranAt', new Date().toISOString());
        return Outcome.Complete();
    }
}
