import { LogError, RunView, UserInfo } from "@memberjunction/core";
import { DataModifier } from "../../classes/DataModifier";
import { RegisterClass } from "@memberjunction/global";
import { MessageRecipient } from "@memberjunction/communication-types";
import { DataModifierParams } from "../../models/DataModifier.types";

@RegisterClass(DataModifier, 'AGUDataModifier')
export class AGUDataModifier extends DataModifier {
    public async GetMessageRecipient(data: DataModifierParams, currentUser?: UserInfo): Promise<MessageRecipient | null> {
        const rv: RunView = new RunView();

        let contextData: Record<string, any> = {
            Persons: [],
            Abstracts: [],
        };

        if(data.Contents){
            contextData.Abstracts = data.Contents;
        }

        if(data.Contributors) {
            const contributors: Contributor[] = data.Contributors;

            //we have most of the data we need in the contributors list, but we're missing 
            //the profile link for each person. We'll fetch that data from another view
            const customerIDs: string = contributors.map((contributor: Contributor) => `'${contributor.CustomerID}'`).join(',');
            const rvPresenterResult = await rv.RunView<Presenter>({
                EntityName: 'Presenter _2024_Emails',
                ExtraFilter: `Customer_ID IN (${customerIDs})`
            }, currentUser);

            if(!rvPresenterResult.Success) {
                LogError(`Error fetching 2024 presenter data: ${rvPresenterResult.ErrorMessage}`);
            }

            if(rvPresenterResult.Results.length != contributors.length) {
                console.warn(`Mismatch between number of contributors and number of presenter records. Expected ${contributors.length}, got ${rvPresenterResult.Results.length} for source record: ${data.SourceRecord.ID}`);
            }

            for(const presenter of rvPresenterResult.Results) {
                const contributor: Contributor | undefined = contributors.find((contributor: Contributor) => contributor.CustomerID === presenter.Customer_ID);
                if(!contributor) {
                    LogError(`No contributor found with customerID: ${presenter.Customer_ID}`);
                    continue;
                }

                const personInfo: Record<string, any> = {...contributor};
                personInfo["ProfileLink"] = presenter.Profile_Link;
                contextData.Persons.push(personInfo);
            }
        }

        const rvSourcePersonResult = await rv.RunView<Presenter>({
            EntityName: 'Presenter _2024_Emails',
            ExtraFilter: `Customer_ID = '${data.SourceRecord.CustomerID}'`
        }, currentUser);

        if(!rvSourcePersonResult.Success) {
            LogError(`Error fetching 2024 presenter data for source record: ${rvSourcePersonResult.ErrorMessage}`);
            return null;
        }

        if(rvSourcePersonResult.Results.length === 0) {
            LogError(`No 2024 presenter data found for source record: ${data.SourceRecord.ID}`);
            return null;
        }

        const sourcePerson: Presenter = rvSourcePersonResult.Results[0];

        const messageRecipient: MessageRecipient = {
            To: sourcePerson.Email,
            FullName: data.SourceRecord.Name,
            ContextData: contextData
        };

        return messageRecipient;
    }
}

export function LoadAGUDataModifier(): void {

}

type Contributor = {
    ID: number,
    CustomerID: string,
    Name: string,
    Organization: string,
    JobTitle: string,
    DoNotDisplay: boolean,
    EmbeddingID: string,
    UpdateVector: boolean,
    isError: boolean
};

type Presenter = {
    ID: number,
    Customer_ID: string,
    First_Name: string,
    Last_Name: string,
    Email: string,
    Profile_Link: string
};