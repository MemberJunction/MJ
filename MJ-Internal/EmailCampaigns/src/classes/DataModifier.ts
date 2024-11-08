import { RegisterClass } from "@memberjunction/global";
import { ModifyDataParams } from "../models/DataModifier.types";
import { MessageRecipient } from "@memberjunction/communication-types";

@RegisterClass(DataModifier, 'DataModifier')
export class DataModifier {
    public async GetMessageRecipient(data: ModifyDataParams): Promise<MessageRecipient[]> {
        return [];
    }
}