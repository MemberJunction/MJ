import { ActionParam, ActionResultSimple, BaseAction, RunActionParams } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import * as Config from './config';
import { BaseEntity, LogError, LogStatus, Metadata, RunView, UserInfo } from "@memberjunction/core";
import axios, { AxiosResponse } from "axios";
import { ApollowBulkPeopleRequest, ApollowBulkPeopleResponse, ProcessPersonRecordGroupParams } from "./generic/apollo.types";

// ApolloEnrichContact this Action would use the www.apollo.io enrichment service and enrich a "contact" type of record. The parameters to this Action would be:
// EntityName - entity in question that contacts "contact" types of records
// EmailField - string - field name in the target entity that contains the email to be used for lookups
// FirstNameField - string 
// LastNameField - string
// AccountNameField - string
// EnrichmentFieldMapping - JSON - this JSON string would contain mappings for the wide array of enrichment outputs. The idea is that the outputs could include a wide array of things and this would map any of the scalar values that Apollo.io provides back to entity field names in the target entity
// EducationHistoryEntityName - string - optional - this would contain the name of the entity that will be used to stored the retrieved education history for each contact
// EmploymentHistoryEntityName - string - optional - would contain the name of the entity that will be used to store the retrieved employment history for each contact
// ApolloEnrichAccount - same idea and pattern as above, but would be for Account style entities
// Would appreciate feedback on (a) the approach to how we package this stuff and (b) the approach to params noted above.

@RegisterClass(BaseAction, "Apollo Enrichment - Accounts")
export class ApolloAccountsEnrichmentAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {

        const entityNameParam: ActionParam | undefined = params.Params.find(p => p.Name === 'EntityName');
        const EmailFieldParam: ActionParam | undefined = params.Params.find(p => p.Name === 'EmailField');
        const FirstNameFieldParam: ActionParam | undefined = params.Params.find(p => p.Name === 'FirstNameField');
        const LastNameFieldParam: ActionParam | undefined = params.Params.find(p => p.Name === 'LastNameField');
        const AccountNameFieldParam: ActionParam | undefined = params.Params.find(p => p.Name === 'AccountNameField');
        const EnrichmentFieldMappingParam: ActionParam | undefined = params.Params.find(p => p.Name === 'EnrichmentFieldMapping');
        const EducationHistoryEntityNameParam: ActionParam | undefined = params.Params.find(p => p.Name === 'EducationHistoryEntityName');
        const EmploymentHistoryEntityNameParam: ActionParam | undefined = params.Params.find(p => p.Name === 'EmploymentHistoryEntityName');
        const ApolloEnrichAccountParam: ActionParam | undefined = params.Params.find(p => p.Name === 'ApolloEnrichAccount');


        if(!entityNameParam){
            throw new Error("EntityName parameter not found");
        }

        if(!EmailFieldParam){
            throw new Error("EmailField parameter not found");
        }

        if(!FirstNameFieldParam){
            throw new Error("FirstNameField parameter not found");
        }

        if(!LastNameFieldParam){
            throw new Error("LastNameField parameter not found");
        }

        if(!AccountNameFieldParam){
            throw new Error("AccountNameField parameter not found");
        }

        const md: Metadata = new Metadata();
        const rv: RunView = new RunView();

        const runViewResult = await rv.RunView({
            EntityName: entityNameParam.Value,
            ExtraFilter: `(${EmailFieldParam.Value} IS NULL)`,
        }, params.ContextUser);

        if(!runViewResult.Success){
            return {
                Success: false,
                Message: runViewResult.ErrorMessage,
                ResultCode: "FAILED"
            };
        }

        const results: any[] = runViewResult.Results;
        const resultLength: number = runViewResult.Results.length;

        const tasks = [];  // to hold promises
        for (let i = 0; i < results.length; i += Config.GroupSize) {
            // push the promise into tasks array without awaiting
            let processParams: ProcessPersonRecordGroupParams = {
                Records: results,
                Startrow: i,
                GroupLength: Config.GroupSize,
                Md: md,
                CurrentUser: params.ContextUser,
                EmailField: EmailFieldParam.Value,
                FirstNameField: FirstNameFieldParam.Value,
                LastNameField: LastNameFieldParam.Value,
                AccountNameField: AccountNameFieldParam.Value,
                EntityName: entityNameParam.Value
            }
            const task = this.ProcessPersonRecordGroup(processParams);
            tasks.push(task);
        
            if (tasks.length === Config.ConcurrentGroups || i + 1 >= results.length) {
                // if we started n tasks or reached the end of the result array, await all started tasks
                await Promise.all(tasks);
        
                // clear tasks
                tasks.length = 0;
            }
        }

        return {
            Success: true,
            Message: "ApolloAccountsEnrichment executed successfully.",
            ResultCode: "SUCCESS"
        };
    }

    protected async ProcessPersonRecordGroup(params: ProcessPersonRecordGroupParams): Promise<boolean> {
        try {
            if(!process.env.APOLLO_API_KEY){
                throw new Error('Apollo.io API key not found');
            }

            const md: Metadata = params.Md;

            const ApolloParams: ApollowBulkPeopleRequest = {
                api_key: process.env.APOLLO_API_KEY,
                reveal_personal_emails: true,
                details: params.Records.splice(params.Startrow, params.GroupLength).map((record: any) => {
                    const first_name: string = record[params.FirstNameField];
                    const last_name: string = record[params.LastNameField];
                    const detail = {first_name, last_name};
                    return detail;
                })   
            };
    
            const headers = {
                'Cache-Control': 'no-cache',
                'Content-Type': 'application/json'
            };
    
            const response = await this.WrapApolloCall('post', 'people/bulk_match', ApolloParams,  { headers: headers });
    
            if (response.status === 200) {
                // here we want to iterate through all the results and update the contacts with the enriched data if
                // the API returned a match
                const result: ApollowBulkPeopleResponse = response.data;
                let bSuccess: boolean = true;
                if (result && result.missing_records < ApolloParams.details.length) {
                    if (result.status.trim().toLowerCase() === 'success' ) {
                        // iterate through the matches array
                        const contactEntity: BaseEntity = await md.GetEntityObject<BaseEntity>(params.EntityName, params.CurrentUser);
                        for(const [index, match] of result.matches.entries()){
                            const email: string = match.email;
                            if(email && email.trim().length > 0){
                                // update the contact record
                                let entityRecord: Record<string, any> = params.Records[index + params.Startrow];
                                contactEntity.SetMany(entityRecord);
                                contactEntity.Set(params.EmailField, match.email);
                                bSuccess = bSuccess && (await contactEntity.Save());

                                if(!bSuccess){
                                    LogError('Error updating contact record with enriched data', undefined, contactEntity.LatestResult);
                                }
                            }
                        }

                        return bSuccess;
                    }
                }
                else {
                    // missing records == details.length means no matches were found
                    console.log('No matches found for this group of records ' + params.Startrow + ' to ' + (params.Startrow + params.GroupLength));
                }
            }
            return false;
        } catch (error: any) {
            console.error('Error occurred:', error);
            if (error && error.code && error.code === 429) 
                throw error; // we want this exception to bubble up so we can catch it and stop the process
            else
                return false;
        }
    }

    protected EscapeSingleQuotes(str: string) {
        if (str){
            return str.replace(/'/g, "''");
        }

        return '';
    } 
    
    protected async WrapApolloCall(method: 'get' | 'post', endpoint: string, data: any, config: any, retryAttempts: number = 1): Promise<AxiosResponse> {
        try {
            const url = `${Config.ApolloAPIEndpoint}/${endpoint}`;  
            
            let response: AxiosResponse = method === 'get' ? await axios.get(url, config) : await axios.post(url, data, config);
            if (response.status === 429) {
                if (retryAttempts > 0) {
                    LogStatus('   >>> Too many requests to Apollo.io API, waiting 1 minute and trying again...')
                    await this.Timeout(60000); // wait 1 minute
                    return await this.WrapApolloCall(method, endpoint, data, config, retryAttempts - 1);
                }
                else{
                    throw {message: 'Too many requests to Apollo.io API', code: 429};
                }
            }

            return response;    
        }
        catch (apolloError: any) {
            // axios could throw an exception for a 429 instead of a response, so we need to handle that here
            if (apolloError && apolloError.response && apolloError.response.status === 429) {
                if (retryAttempts > 0) {
                    LogStatus('   >>> Too many requests to Apollo.io API, waiting 1 minute and trying again...')
                    await this.Timeout(60000); // wait 1 minute
                    return await this.WrapApolloCall(method, endpoint, data, config, retryAttempts - 1);
                }
                else {
                    throw {message: 'Too many requests to Apollo.io API', code: 429};
                }
            }
            else {
                throw apolloError;
            }
        }
    }
    
    private async Timeout(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }  
}

export function LoadApolloAccountsEnrichmentAction() {
}