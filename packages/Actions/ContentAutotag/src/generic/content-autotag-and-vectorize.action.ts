import { ActionParam, ActionResultSimple, BaseAction, RunActionParams } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { VectorizeEntityAction } from "../../../CoreActions/src";
import { AutotagLocalFileSystem, AutotagRSSFeed, AutotagWebsite } from "../../../../ContentAutotagging/src";
import { EntityVectorSyncer } from "@memberjunction/ai-vector-sync";
import { EntityDocumentEntity } from "@memberjunction/core-entities";
import { LogStatus } from "@memberjunction/core";

/**
 * 
 * Params:
 *  * Autotag: Bit, if set to true, will autotag the content.
 *  * Vectorize: Bit, if set to true, will vectorize the content. 
 *  * EntityNames: Comma separated list of entity names to vectorize.
*/
@RegisterClass(BaseAction, "Autotag And Vectorize Content")
export class AutotagAndVectorizeContentAction extends VectorizeEntityAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const autotagParam: ActionParam | undefined = params.Params.find(p => p.Name === 'Autotag');
        const vectorizeParam: ActionParam | undefined = params.Params.find(p => p.Name === 'Vectorize');

        if(!autotagParam || !vectorizeParam){
            throw new Error('Autotag and Vectorize params are required.');
        }

        if (autotagParam.Value === 'true') {
            const FileAutotag = new AutotagLocalFileSystem()
            await FileAutotag.Autotag(params.ContextUser)
            const RSSAutotag = new AutotagRSSFeed()
            await RSSAutotag.Autotag(params.ContextUser)
            const WebsiteAutotag = new AutotagWebsite()
            await WebsiteAutotag.Autotag(params.ContextUser)
        }

        if (vectorizeParam.Value === 'true') {
            return await super.InternalRunAction(params);
        }

        return {
            Success: true,
            ResultCode: "SUCCESS"
        };
    }
}

export function LoadAutotagAndVectorizeContentAction(){
    // this function is a stub that is used to force the bundler to include the above class in the final bundle and not tree shake them out
}