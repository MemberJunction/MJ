import {BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { VectorizeEntityAction } from "@memberjunction/core-actions";
import { AutotagLocalFileSystem, AutotagRSSFeed, AutotagWebsite, AutotagBaseEngine } from '@memberjunction/content-autotagging';
import { ActionParam, ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { LogError, LogStatus } from "@memberjunction/core";

/**
 * 
 * Params:
 *  * Autotag: Bit, if set to true, will autotag the content.
 *  * Vectorize: Bit, if set to true, will vectorize the content. 
 *  * EntityNames: Comma separated list of entity names to vectorize.
*/
@RegisterClass(BaseAction, "__AutotagAndVectorizeContent")
export class AutotagAndVectorizeContentAction extends VectorizeEntityAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const autotagParam: ActionParam | undefined = params.Params.find(p => p.Name === 'Autotag');
        const vectorizeParam: ActionParam | undefined = params.Params.find(p => p.Name === 'Vectorize');

        if(!autotagParam || !vectorizeParam){
            throw new Error('Autotag and Vectorize params are required.');
        }

        try {

            if (autotagParam.Value === 1) {
                // Initialize the autotagging engine (loads cached metadata)
                await AutotagBaseEngine.Instance.Config(false, params.ContextUser);

                // Run each source type, catching errors per-provider so one failure doesn't stop the pipeline
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

            if (vectorizeParam.Value === 1) {
                const vectorize = await super.InternalRunAction(params);

                console.log('Vectorization complete.')
            }

            return {
                Success: true,
                ResultCode: "SUCCESS"
            };
        }
        catch (error) {
            return {
                Success: false,
                Message: error as any,
                ResultCode: "FAILED"
            };
        }
    }
}