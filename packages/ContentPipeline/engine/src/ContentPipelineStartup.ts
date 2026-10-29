/**
 * @fileoverview Registers the `Pipeline Stage` work type and the built-in stages and extractors at server boot.
 * The stage and extractor classes register only as an import side effect, which a bundler may drop, so they
 * are loaded explicitly here.
 *
 * @module @memberjunction/content-pipeline
 */

import { IMetadataProvider, IStartupSink, LogStatusEx, RegisterForStartup, UserInfo } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';
import { CredentialAccessDriver } from './AccessResolver.js';
import { ManagedPromptClassifier } from './ManagedPromptClassifier.js';
import { RegisterPipelineWorkType } from './PipelineStageRegistration.js';
import { LoadContentPipelineStages } from './stages/index.js';
import { LoadContentPipelineExtractors } from './extractors/index.js';

@RegisterForStartup({
    description: 'Content pipeline: Pipeline Stage work type, built-in stages and extractors',
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
        LoadContentPipelineExtractors();
        void CredentialAccessDriver;
        void ManagedPromptClassifier;
        RegisterPipelineWorkType();
        LogStatusEx({
            message: '[ContentPipelineStartup] Registered the Pipeline Stage work type and the built-in stages.',
            verboseOnly: true,
        });
    }
}
