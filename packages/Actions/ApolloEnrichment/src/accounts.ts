import { ActionResultSimple, BaseAction, RunActionParams } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";

@RegisterClass(BaseAction, "Apollo Enrichment - Accounts")
export class ApolloAccountsEnrichment extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        return {
            Success: true,
            Message: "ApolloAccountsEnrichment executed successfully.",
            ResultCode: "SUCCESS"
        };
    }
}