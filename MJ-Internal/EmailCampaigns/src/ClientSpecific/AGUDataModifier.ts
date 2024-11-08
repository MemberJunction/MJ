import { RunView, UserInfo } from "@memberjunction/core";
import { DataModifier } from "../classes/DataModifier";
import { RegisterClass } from "@memberjunction/global";

@RegisterClass(DataModifier, 'AGUDataModifier')
export class AGUDataModifier implements DataModifier {
    public async GetMessageRecipient(data: Record<string, any>, currentUser?: UserInfo): Promise<any> {
        const rv: RunView = new RunView();

        const rvPresenterResult = await rv.RunView({

        });
    }
}