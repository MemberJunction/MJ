import { ActionResultSimple, BaseAction, RunActionParams } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";

@RegisterClass(BaseAction, "Apollo Enrichment - Contacts")
export class ApolloContactsEnrichment extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        return {
            Success: true,
            Message: "ApolloContactsEnrichment executed successfully.",
            ResultCode: "SUCCESS"
        };
    }
}