import { BaseAction } from "@memberjunction/actions";
import { MJGlobal, RegisterClass } from "@memberjunction/global";
import { AutotagBase, AutotagBaseEngine, AutotagProgressCallback } from '@memberjunction/content-autotagging';
import { ActionParam, ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { LogError, LogStatus, RunView } from "@memberjunction/core";
import { MJContentItemEntity } from "@memberjunction/core-entities";

/**
 * Params:
 *  * Autotag: Bit, if set to 1, will autotag content from all source types.
 *  * Vectorize: Bit, if set to 1, will embed tagged content items directly into the vector index.
 *
 * Uses plugin architecture: iterates all ContentSourceType records and resolves
 * providers dynamically via ClassFactory using the DriverClass field.
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
                promises.push(this.RunAutotagProviders(params, onProgress));
            }
            if (vectorizeParam.Value === 1) {
                promises.push(this.RunDirectVectorization(params));
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

    /**
     * Dynamically resolves and runs all autotag providers using ClassFactory.
     * Iterates all ContentSourceType records that have a DriverClass set,
     * instantiates the provider via ClassFactory, and runs autotagging for
     * any sources configured for that type.
     */
    private async RunAutotagProviders(params: RunActionParams, onProgress?: AutotagProgressCallback): Promise<void> {
        const engine = AutotagBaseEngine.Instance;
        const sourceTypes = engine.ContentSourceTypes;

        for (const sourceType of sourceTypes) {
            if (!sourceType.DriverClass) {
                LogStatus(`Content source type "${sourceType.Name}" has no DriverClass, skipping`);
                continue;
            }

            // Check if any sources are configured for this type before instantiating
            const sources = await engine.GetAllContentSourcesSafe(params.ContextUser, sourceType.ID);
            if (sources.length === 0) {
                LogStatus(`Content source type "${sourceType.Name}": no sources configured, skipping`);
                continue;
            }

            const provider = MJGlobal.Instance.ClassFactory.CreateInstance<AutotagBase>(
                AutotagBase,
                sourceType.DriverClass
            );
            if (!provider) {
                LogError(`No provider registered for DriverClass "${sourceType.DriverClass}" (source type: ${sourceType.Name}). Ensure the provider class has @RegisterClass(AutotagBase, '${sourceType.DriverClass}').`);
                continue;
            }

            try {
                await provider.Autotag(params.ContextUser, onProgress);
                LogStatus(`Autotag provider "${sourceType.Name}" (${sourceType.DriverClass}) completed successfully`);
            } catch (providerError) {
                const msg = providerError instanceof Error ? providerError.message : String(providerError);
                LogError(`Autotag provider "${sourceType.Name}" (${sourceType.DriverClass}) failed: ${msg}`);
            }
        }

        LogStatus('Autotagging complete.');
    }

    /** Embed all content items directly into the vector index */
    private async RunDirectVectorization(params: RunActionParams): Promise<void> {
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
