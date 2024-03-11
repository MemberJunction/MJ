import * as fs from 'fs';
import { BaseLLM } from "@memberjunction/ai";
import { PineconeDatabase } from "@memberjunction/ai-vectors-pinecone";
import { UserInfo, RunView } from "@memberjunction/core";
import { SQLServerDataProvider, SQLServerProviderConfigData, setupSQLServerClient, UserCache } from "@memberjunction/sqlserver-dataprovider";
import { IProcedureResult, Request } from 'mssql';
import SQLConnectionPool from '../db/db';
import { currentUserEmail } from '../config';
import AppDataSource from '../db/dbAI';

export class VectorSyncBase {
    _provider: SQLServerDataProvider;
    _userInfo: UserInfo;
    _runView: RunView;

    _startTime: Date; 
    _endTime: Date;

    _pineconeDB: PineconeDatabase;
    _embedding: BaseLLM;
    _languageModel: BaseLLM;

    protected async setupDBConnection(): Promise<void> {
        await SQLConnectionPool.connect();
        this._provider = await this.setupAndGetSQLServerProvider();
        console.log("current user:", this._provider.CurrentUser);
        console.log("user cache", UserCache.Instance.Users);
        this._userInfo = this.getDefaultUser(this._provider);
        this._runView = new RunView();
    }

    protected setupAndGetSQLServerProvider = async (): Promise<SQLServerDataProvider> => {
        const config = new SQLServerProviderConfigData(AppDataSource, currentUserEmail);
        return await setupSQLServerClient(config);
    }

    protected getDefaultUser(provider: SQLServerDataProvider): UserInfo {
        return new UserInfo(provider as any, 
            { Email: currentUserEmail,
                UserRoles: [
                    { UserID: 24, RoleName: "Developer", CreatedAt: new Date(), UpdatedAt: new Date(), User: "Jonathan Stfelix" },
                    {UserID: 24, RoleName: "UI", CreatedAt: new Date(), UpdatedAt: new Date(), User: "Jonathan Stfelix" }
                ] 
            });
    }

    protected async timer(ms: number): Promise<unknown> {
        return new Promise(res => setTimeout(res, ms));
    }

    protected async executeStoredProcedure<T>(storedProcedure: string, params: any): Promise<IProcedureResult<T>> {
        try {
            const request = SQLConnectionPool.request();
            this.mapObjectPropertiesToRequest(params, request);
            return request.execute<T>(storedProcedure);
        }
        catch(error){
            console.log(error);
            return null;
        }
    }

    /**
    * Collect Data for Procedure
    * @param obj
    * @param r
    * @returns data
    */
    protected mapObjectPropertiesToRequest = (obj: any, r: Request) => {
        // Generic iteration over object properties and map to input() of request
        // Doing this generically makes it way simpler over time to handle new
        // properties that are added to various types
        Object.keys(obj).map((key: string) => {
        r.input(key, obj[key]);
        });
    };

    protected parseStringTemplate(str: string, obj: any): string {
        //Split string into non-argument textual parts
        let parts = str.split(/\$\{(?!\d)[\wæøåÆØÅ]*\}/);
    
        //Split string into property names. Empty array if match fails.
        let args = str.match(/[^{\}]+(?=})/g) || [];
    
        //Map parameters from obj by property name. Solution is limited by shallow one level mapping. 
        //Undefined values are substituted with an empty string, but other falsy values are accepted.
        let parameters = args.map(argument => obj[argument] || (obj[argument] === undefined ? "" : obj[argument]));
        return String.raw({ raw: parts }, ...parameters);
    }

    protected start(): void {
        this._startTime = new Date();
    }

    protected end(): void {
        this._endTime = new Date();
    }

    protected timeDiff(): number {
        let timeDiff = this._endTime.valueOf() - this._startTime.valueOf(); //in ms
        // strip the ms
        timeDiff /= 1000;
      
        // get seconds 
        var seconds = Math.round(timeDiff);
        return seconds;
    }

    protected saveJSONData(data: any, path: string): void {
        fs.writeFileSync(path, JSON.stringify(data, null, 2));
    }

    protected isEmpty(obj: object) {
        for (const prop in obj) {
          if (Object.hasOwn(obj, prop)) {
            return false;
          }
        }
      
        return true;
    }
}