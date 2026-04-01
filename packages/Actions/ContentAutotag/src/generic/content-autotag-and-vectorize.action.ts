import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { AutotagLocalFileSystem, AutotagRSSFeed, AutotagWebsite, AutotagBaseEngine } from '@memberjunction/content-autotagging';
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

        try {
            // Initialize the autotagging engine (loads cached metadata)
            await AutotagBaseEngine.Instance.Config(false, params.ContextUser);

            if (autotagParam.Value === 1) {
                await this.runAutotagProviders(params);
            }

            if (vectorizeParam.Value === 1) {
                await this.runDirectVectorization(params);
            }

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
    private async runAutotagProviders(params: RunActionParams): Promise<void> {
        const providers = [
            { name: 'LocalFileSystem', instance: new AutotagLocalFileSystem() },
            { name: 'RSSFeed', instance: new AutotagRSSFeed() },
            { name: 'Website', instance: new AutotagWebsite() },
        ];

        for (const provider of providers) {
            try {
                await provider.instance.Autotag(params.ContextUser);
                LogStatus(`Autotag provider ${provider.name} completed successfully`);
            } catch (providerError) {
                LogError(`Autotag provider ${provider.name} failed: ${providerError instanceof Error ? providerError.message : String(providerError)}`);
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
