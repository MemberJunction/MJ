import { RegisterClass } from "@memberjunction/global";
import { DataModifierParams } from "../models/DataModifier.types";
import { MessageRecipient } from "@memberjunction/communication-types";
import { UserInfo } from "@memberjunction/core";

@RegisterClass(DataModifier, 'DataModifier')
export class DataModifier {
    public async GetMessageRecipient(data: DataModifierParams, currentUser?: UserInfo): Promise<MessageRecipient | null> {
        return null;
    }

    protected capitalizeFirstLetter(text: string): string {
        const firstLetter: string = text.charAt(0).toUpperCase();
        const rest: string = text.slice(1).toLowerCase();  
        return  firstLetter + rest;
    }
}

export function LoadDataModifier(): void {
}