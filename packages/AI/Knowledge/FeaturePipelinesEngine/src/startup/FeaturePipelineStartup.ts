/**
 * @fileoverview Registers the `'Infer'` processor in `RecordProcessorRegistry` on startup and on
 * module load so `RecordProcessExecutor` can build `InferProcessor` instances without importing
 * Feature Pipeline specifics directly.
 * @module @memberjunction/feature-pipelines-engine
 */

import { IMetadataProvider, IStartupSink, LogStatusEx, RegisterForStartup, UserInfo } from '@memberjunction/core';
import type { MJRecordProcessEntity } from '@memberjunction/core-entities';
import { BaseSingleton } from '@memberjunction/global';
import { RecordProcessorRegistry, type RecordProcessorBuildContext } from '@memberjunction/record-set-processor-base';
import { InferProcessor } from '../processors/InferProcessor';

/**
 * Registers the `'Infer'` work-type factory in {@link RecordProcessorRegistry}.
 * Idempotent: safe to call at module load time and from {@link FeaturePipelineStartup.HandleStartup}.
 */
export function RegisterInferRecordProcessor(): void {
    RecordProcessorRegistry.Instance.Register('Infer', (context: RecordProcessorBuildContext) => {
        const rp = context.RecordProcess as MJRecordProcessEntity | undefined;
        if (!rp) {
            throw new Error(
                `Record Process '${context.RecordProcessName || context.RecordProcessID || 'unknown'}': ` +
                `WorkType=Infer requires the loaded MJRecordProcessEntity on RecordProcessorBuildContext.RecordProcess`,
            );
        }
        return InferProcessor.FromRecordProcess(rp, context.Provider);
    });
}

@RegisterForStartup({
    description: 'Feature Pipeline Infer processor registration',
})
export class FeaturePipelineStartup extends BaseSingleton<FeaturePipelineStartup> implements IStartupSink {
    public static get Instance(): FeaturePipelineStartup {
        return super.getInstance<FeaturePipelineStartup>();
    }

    protected constructor() {
        super();
    }

    public async HandleStartup(_contextUser?: UserInfo, _provider?: IMetadataProvider): Promise<void> {
        RegisterInferRecordProcessor();
        LogStatusEx({
            message: '[FeaturePipelineStartup] Registered Infer processor for Record Set Processing.',
            verboseOnly: true,
        });
    }
}
