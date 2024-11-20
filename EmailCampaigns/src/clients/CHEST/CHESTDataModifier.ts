import { LogError, RunView, UserInfo } from "@memberjunction/core";
import { DataModifier } from "../../classes/DataModifier";
import { RegisterClass } from "@memberjunction/global";
import { MessageRecipient } from "@memberjunction/communication-types";
import { DataModifierParams } from "../../models/DataModifier.types";

@RegisterClass(DataModifier, 'CHESTDataModifier')
export class CHESTDataModifier extends DataModifier {
    public async GetMessageRecipient(data: DataModifierParams, currentUser?: UserInfo): Promise<MessageRecipient | null> {
        const rv: RunView = new RunView();

        let contextData: Record<string, any> = {
            Person: data.SourceRecord,
            Product: data.PRODUCTs[0],
        };

        const messageRecipient: MessageRecipient = {
            To: data.SourceRecord.EMAIL,
            FullName: data.SourceRecord.FULL_NAME,
            ContextData: contextData
        };

        return messageRecipient;
    }
}

export function LoadCHESTDataModifier(): void {

}