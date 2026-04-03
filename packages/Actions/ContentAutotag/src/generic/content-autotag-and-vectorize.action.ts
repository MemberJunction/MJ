import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { AutotagLocalFileSystem, AutotagRSSFeed, AutotagWebsite, AutotagBaseEngine, AutotagProgressCallback } from '@memberjunction/content-autotagging';
import { ActionParam, ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { LogError, LogStatus, RunView } from "@memberjunction/core";
import { MJContentItemEntity } from "@memberjunction/core-entities";

/**
 * Params:
 *  * Autotag: Bit, if set to 1, will autotag content from all source types.
 *  * Vectorize: Bit, if set to 1, will embed tagged content items directly into the vector index.
 */
@RegisterClass(BaseAction, "__AutotagAndVectorizeContent")
export class AutotagAndVectorizeContentAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const autotagParam: ActionParam | undefined = params.Params.find(p => p.Name === 'Autotag');
        const vectorizeParam: ActionParam | undefined = params.Params.find(p => p.Name === 'Vectorize');

        if (!autotagParam || !vectorizeParam) {
            throw new Error('Autotag and Vectorize params are required.');
        }

        // Extract optional progress callback from params (injected by resolver)
        const progressParam = params.Params.find(p => p.Name === '__progressCallback');
        const onProgress = progressParam?.Value as AutotagProgressCallback | undefined;

        try {
            // Initialize the autotagging engine (loads cached metadata)
            await AutotagBaseEngine.Instance.Config(false, params.ContextUser);

            // Run autotagging and vectorization in parallel when both are enabled
            const promises: Promise<void>[] = [];
            if (autotagParam.Value === 1) {
                promises.push(this.runAutotagProviders(params, onProgress));
            }
            if (vectorizeParam.Value === 1) {
                promises.push(this.runDirectVectorization(params));
            }
            await Promise.all(promises);

            return { Success: true, ResultCode: "SUCCESS" };
        } catch (error) {
            return {
                Success: false,
                Message: error instanceof Error ? error.message : String(error),
                ResultCode: "FAILED"
            };
        }
    }

    /** Run each autotag source type, catching per-provider errors */
    private async runAutotagProviders(params: RunActionParams, onProgress?: AutotagProgressCallback): Promise<void> {
        const providers = [
            { name: 'LocalFileSystem', instance: new AutotagLocalFileSystem() },
            { name: 'RSSFeed', instance: new AutotagRSSFeed() },
            { name: 'Website', instance: new AutotagWebsite() },
        ];

        for (const provider of providers) {
            try {
                await provider.instance.Autotag(params.ContextUser, onProgress);
                LogStatus(`Autotag provider ${provider.name} completed successfully`);
            } catch (providerError) {
                // "No content sources found" is expected when a source type has no configured sources — log as info, not error
                const msg = providerError instanceof Error ? providerError.message : String(providerError);
                if (msg.includes('No content sources found')) {
                    LogStatus(`Autotag provider ${provider.name}: no sources configured, skipping`);
                } else {
                    LogError(`Autotag provider ${provider.name} failed: ${msg}`);
                }
            }
        }

        LogStatus('Autotagging complete.');
    }

    /** Embed all content items directly into the vector index */
    private async runDirectVectorization(params: RunActionParams): Promise<void> {
        const rv = new RunView();
        const result = await rv.RunView<MJContentItemEntity>({
            EntityName: 'MJ: Content Items',
            ResultType: 'entity_object'
        }, params.ContextUser);

        if (!result.Success) {
            LogError('VectorizeContentItems: failed to load content items');
            return;
        }

        const items = result.Results;
        LogStatus(`VectorizeContentItems: ${items.length} content items loaded for vectorization`);

        const stats = await AutotagBaseEngine.Instance.VectorizeContentItems(items, params.ContextUser);
        LogStatus(`VectorizeContentItems: ${stats.vectorized} vectorized, ${stats.skipped} skipped`);
    }
}
