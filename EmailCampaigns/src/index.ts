import * as Config from './Config';
import { UserInfo } from "@memberjunction/core";
import { LoadProvider } from "@memberjunction/communication-sendgrid";
import { LoadRexRecommendationsProvider } from "@memberjunction/ai-recommendations-rex";
import { SQLServerProviderConfigData, UserCache, setupSQLServerClient } from "@memberjunction/sqlserver-dataprovider";
import { LoadAGUDataModifier } from "./clients/AGU/AGUDataModifier";
import { LoadAGUMessageBuilder } from "./clients/AGU/AGUMessageBuilder";
import { CampaignHander } from "./classes/CampaignHandler";
import { LoadMessageBuilder } from "./classes/MessageBuilder";
import { AppDataSource } from './db';

LoadMessageBuilder();
LoadAGUMessageBuilder();

LoadAGUDataModifier();
LoadAGUDataModifier();
LoadProvider();

LoadRexRecommendationsProvider();

async function Init(): Promise<UserInfo> {
    const config = new SQLServerProviderConfigData(AppDataSource, Config.CurrentUserEmail, Config.mjCoreSchema, 5000);
    const userCache: UserCache = new UserCache();

    await AppDataSource.initialize();
    await setupSQLServerClient(config);
    await userCache.Refresh(AppDataSource);

    const user: UserInfo | undefined = userCache.Users.find(u => u.Email === Config.CurrentUserEmail);
    if(!user){
        throw new Error(`Error: could not find user with email ${Config.CurrentUserEmail}`);
    }

    return user;
}

async function Run(): Promise<void> {
    const user: UserInfo = await Init();
    const ch: CampaignHander = new CampaignHander();

    await ch.Config(user);

    await ch.SendEmails({
        ListID: '8E59846B-9298-EF11-88CF-002248306D26',
        ListBatchSize: 1,
        MaxListRecords: 1,
        
        RecommendationRunIDs: [
            '850BACBF-B8A2-EF11-88CF-002248306D26',
             'DCBCB17F-CDA2-EF11-88CF-002248306D26'
        ],
        CurrentUser: user,
        TestEmail: "linda@memberjunction.com"
        //TestEmail: "jonathan@memberjunction.com"
    });

    /*
    await ch.GetRecommendations({
        ListID: '8E59846B-9298-EF11-88CF-002248306D26',
        CurrentUser: user,
        CreateErrorList: true,
        ContextData: {
            EntityDocumentID: '38D60434-948D-EF11-8473-002248306CAC',
            type: 'person',
            filters: [
                {
                    type: "person",
                    max_results: 15
                },
                {
                    type: "course",
                    max_results: 15
                }
            ]
        }
    });
    */

    /*
    await ch.CreateEntityDocumentTemplate({
        TemplateName: "Test",
        TemplateType: "HTML",
        EntityName: "Users",
        TemplateParamName: "User",
        CurrentUser: user
    });
    */

    /*
    await ch.CreateEntityDocument({
        EntityDocumentName: "Test",
        EntityName: "Users",
        TemplateID: "931E2AAC-0AA2-EF11-88CF-002248306D26",
        CurrentUser: user
    });
    */

    /*
    await ch.UpdateTemplateContent({
        FilePath: "C:/Users/Ridleh/Downloads/AGUTemplate.htm",
        TemplateContentID: 'F9BFDDA2-7491-EF11-88CF-002248306D26',
        CurrentUser: user
    });
    */
}


Run().then(() => { 
    console.log('All done!');
    process.exit(0);
}).catch((error) => {   
    console.error('An error occured:', error);
    process.exit(1);
});
