/**
 * @file ContentPipelineStartup.ts
 * Registers the `Pipeline Stage` Record Process work type, and the built-in stages and readers, at
 * server boot.
 *
 * Without this, a Record Process with `WorkType = 'Pipeline Stage'` fails with "unsupported
 * WorkType", and `BasePipelineStage.Resolve` returns null for every stage name:
 * {@link RegisterPipelineWorkType} only makes the processor available, and the stage classes are
 * only registered as a side effect of importing them — which a bundler is free to drop, since they
 * are never referenced directly.
 *
 * The same applies to the RecordProcess.RunNow override, which must load AFTER MJ's own to win
 * dispatch — hence the explicit side-effect import here.
 */

import { IMetadataProvider, IStartupSink, LogStatusEx, RegisterForStartup, UserInfo } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';
import { RegisterPipelineWorkType } from './PipelineStageRegistration.js';
import { LoadContentPipelineStages } from './stages/index.js';
import { LoadContentPipelineReaders } from './readers/index.js';

@RegisterForStartup({
    description: 'Content pipeline: Pipeline Stage work type, built-in stages and readers',
})
export class ContentPipelineStartup extends BaseSingleton<ContentPipelineStartup> implements IStartupSink {
    public static get Instance(): ContentPipelineStartup {
        return super.getInstance<ContentPipelineStartup>();
    }

    /**
     * Registers the work type and forces the built-in classes into the bundle. Idempotent (the
     * registry is last-wins); needs no user or provider.
     */
    public async HandleStartup(_contextUser?: UserInfo, _provider?: IMetadataProvider): Promise<void> {
        LoadContentPipelineStages();
        LoadContentPipelineReaders();
        RegisterPipelineWorkType();
        LogStatusEx({
            message: '[ContentPipelineStartup] Registered the Pipeline Stage work type and the built-in stages.',
            verboseOnly: true,
        });
    }
}
