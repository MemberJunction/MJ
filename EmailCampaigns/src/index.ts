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
import { LoadCHESTVectorRelatedDataHandler } from './clients/CHEST/CHESTVectorRelatedDataHandler';
import { LoadCHESTMessageBuilder } from './clients/CHEST/CHESTMessageBuilder';
import { LoadCHESTDataModifier } from './clients/CHEST/CHESTDataModifier';
import {LoadOpenAILLM} from '@memberjunction/ai-openai';

LoadMessageBuilder();
LoadAGUMessageBuilder();

LoadAGUDataModifier();
LoadAGUDataModifier();
LoadProvider();

LoadRexRecommendationsProvider();
LoadCHESTVectorRelatedDataHandler();
LoadCHESTMessageBuilder();
LoadCHESTDataModifier();

LoadOpenAILLM();

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
    const filter: string = `[MEMBER_TERMINATE_DATE] IS NULL
  AND SUBSTRING(CONVERT(VARCHAR,[MEMBER_EXPIRE_DATE],112),1,6) BETWEEN 202412 and 202502
  AND EDW_SNOWFLAKE_DATA_DELETE_FLAG= 'false'
  AND MEMBER_AUTO_RENEW_FLAG='false'`;
    await ch.CreateList({
        ListName: "Chest Contacts",
        EntityName: "VW_CONTACTs",
        Filter: filter,
        BatchSize: 25,
        CurrentUser: user
    });
    */

    /*
    await ch.VectorizeRecords({
        entityID: '168AF8CE-BEEF-4B9E-892C-71D69DED7A09',
        entityDocumentID: '8FD31D21-19A2-EF11-88CD-6045BD325BD0',
        batchCount: 100,
        options: {},
        listID: '716F9EF6-E6A6-EF11-88D0-002248450A5B',
        dataHandlerClassName: 'VectorRelatedDataHandlerBase'
    }, user);
    */

    /*/
    await ch.UpdateTemplateContent({
        FilePath: "C:/Development/MemberJunction/EmailCampaigns/html/CHEST.htm",
        TemplateContentID: 'C6CEC0D1-50A1-EF11-88CD-6045BD325BD0',
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

    
    await ch.SendEmails({
        ListID: '8E59846B-9298-EF11-88CF-002248306D26',
        //ListID: '716F9EF6-E6A6-EF11-88D0-002248450A5B', //CHEST
        ListBatchSize: 3,
        MaxListRecords: 3,
        StartingOffset: 6,
        RecommendationRunIDs: [
            //'AB4D8ECA-6AA7-EF11-88D0-002248450A5B' //CHEST
            'DCBCB17F-CDA2-EF11-88CF-002248306D26' //AGU
        ],

        CurrentUser: user,
        TestEmail: "linda@memberjunction.com"
        //TestEmail: "jonathan@memberjunction.com"
        //TestEmail: 'info@sidecarglobal.com'
        //TestEmail: 'jstfelix.02@gmail.com'
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
        FilePath: "C:/Development/MemberJunction/EmailCampaigns/html/CHEST.htm",
        TemplateContentID: 'C6CEC0D1-50A1-EF11-88CD-6045BD325BD0',
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
