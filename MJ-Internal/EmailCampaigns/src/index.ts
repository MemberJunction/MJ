import { CampaignHander } from "./classes/CampaignHandler";
import { UserInfo } from "@memberjunction/core";
import { SQLServerProviderConfigData, UserCache, setupSQLServerClient } from "@memberjunction/sqlserver-dataprovider";
import { AppDataSource } from './db';
import { LoadAGUDataModifier } from "./ClientSpecific/AGUDataModifier";
import { LoadProvider } from "@memberjunction/communication-sendgrid";
import { LoadMessageBuilder } from "./classes/MessageBuilder";
import { LoadAGUMessageBuilder } from "./ClientSpecific/MessageBuilders/AGUMessageBuilder";
import * as Config from './Config';

LoadMessageBuilder();
LoadAGUMessageBuilder();

LoadAGUDataModifier();
LoadAGUDataModifier();
LoadProvider();

async function Run(): Promise<void> {

    const config = new SQLServerProviderConfigData(AppDataSource, Config.CurrentUserEmail, Config.mjCoreSchema, 5000);
    const userCache: UserCache = new UserCache();

    await AppDataSource.initialize();
    await setupSQLServerClient(config);
    await userCache.Refresh(AppDataSource);

    const user: UserInfo | undefined = userCache.Users.find(u => u.Email === Config.CurrentUserEmail);
    if(!user){
        throw new Error(`Error: could not find user with email ${Config.CurrentUserEmail}`);
    }

    const ch: CampaignHander = new CampaignHander();
    await ch.Config(user);
    await ch.SendEmails({
        ListID: '8E59846B-9298-EF11-88CF-002248306D26',
        ListBatchSize: 5,
        MaxListRecords: 20,
        RecommendationRunID: '7AE7B91E-8E9C-EF11-88CF-002248306D26',
        CurrentUser: user
    });
}


Run().then(() => { 
    console.log('Emails sent!');
    process.exit(0);
}).catch((error) => {   
    console.error('Error sending emails:', error);
    process.exit(1);
});
