import * as Config from './Config';
import { CampaignHander } from "./classes/CampaignHandler";
import { UserInfo } from "@memberjunction/core";
import { SQLServerProviderConfigData, UserCache, setupSQLServerClient } from "@memberjunction/sqlserver-dataprovider";
import { AppDataSource } from './db';
import { LoadAGUDataModifier } from "./Clients/AGU/AGUDataModifier";
import { LoadProvider } from "@memberjunction/communication-sendgrid";
import { LoadMessageBuilder } from "./classes/MessageBuilder";
import { LoadAGUMessageBuilder } from "./Clients/AGU/AGUMessageBuilder";
import { LoadRexRecommendationsProvider } from "@memberjunction/ai-recommendations-rex";

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
    /*
    await ch.SendEmails({
        ListID: '8E59846B-9298-EF11-88CF-002248306D26',
        ListBatchSize: 5,
        MaxListRecords: 5,
        RecommendationRunID: '7AE7B91E-8E9C-EF11-88CF-002248306D26',
        CurrentUser: user
    });
    */

    await ch.GetRecommendations({
        ListID: '8E59846B-9298-EF11-88CF-002248306D26',
        CurrentUser: user,
        ContextData: {
            EntityDocumentID: '38D60434-948D-EF11-8473-002248306CAC'
        }
    });
}


Run().then(() => { 
    console.log('Emails sent!');
    process.exit(0);
}).catch((error) => {   
    console.error('Error sending emails:', error);
    process.exit(1);
});
