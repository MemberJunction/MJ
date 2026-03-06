import {BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { VectorizeEntityAction } from "@memberjunction/core-actions";
import { AutotagLocalFileSystem, AutotagRSSFeed, AutotagWebsite } from '@memberjunction/content-autotagging';
import { ActionParam, ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";

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
                const FileAutotag = new AutotagLocalFileSystem()
                await FileAutotag.Autotag(params.ContextUser)
                const RSSAutotag = new AutotagRSSFeed()
                await RSSAutotag.Autotag(params.ContextUser)
                const WebsiteAutotag = new AutotagWebsite()
                await WebsiteAutotag.Autotag(params.ContextUser)

                console.log('Autotagging complete.')
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