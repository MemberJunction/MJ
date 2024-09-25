import { ActionParam, ActionResultSimple, BaseAction, RunActionParams } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import * as Config from './config';
import { BaseEntity, EntityField, EntityFieldInfo, EntityInfo, LogError, LogStatus, Metadata, RunView, RunViewResult, UserInfo } from "@memberjunction/core";
import axios, { AxiosResponse } from "axios";
import { ApollowBulkPeopleRequest, ApollowBulkPeopleResponse, ProcessPersonRecordGroupParams, SearchPeopleResponsePerson } from "./generic/apollo.types";

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

@RegisterClass(BaseAction, "Apollo Enrichment - Contacts")
export class ApolloContactsEnrichmentAction extends BaseAction {

    ExcludeTitles: string[] = ['member', 'student member', 'student','volunteer'];

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        if(!Config.ApolloAPIKey){
            throw new Error('Apollo.io API key not found');
        }

        const entityNameParam: ActionParam | undefined = params.Params.find(p => p.Name === 'EntityName');
        const emailFieldParam: ActionParam | undefined = params.Params.find(p => p.Name === 'EmailField');
        const firstNameFieldParam: ActionParam | undefined = params.Params.find(p => p.Name === 'FirstNameField');
        const lastNameFieldParam: ActionParam | undefined = params.Params.find(p => p.Name === 'LastNameField');
        const accountNameFieldParam: ActionParam | undefined = params.Params.find(p => p.Name === 'FilterParam');
        const enrichedAtFieldParam: ActionParam | undefined = params.Params.find(p => p.Name === 'EnrichedAtField');
        const filterParam: ActionParam | undefined = params.Params.find(p => p.Name === 'FilterParam');
        const domainParam: ActionParam | undefined = params.Params.find(p => p.Name === 'domainParam');
        const linkedinParam: ActionParam | undefined = params.Params.find(p => p.Name === 'linkedinParam');
        

        const EnrichmentFieldMappingParam: ActionParam | undefined = params.Params.find(p => p.Name === 'EnrichmentFieldMappings');
        const EducationHistoryEntityNameParam: ActionParam | undefined = params.Params.find(p => p.Name === 'EducationHistoryFieldMappings');
        const EmploymentHistoryEntityNameParam: ActionParam | undefined = params.Params.find(p => p.Name === 'EmploymentHistoryFieldMappings');

        const educationHistoryFieldMappings: Record<string, string> = EducationHistoryEntityNameParam ? EducationHistoryEntityNameParam.Value : {};
        const employmentHistoryFieldMappings: Record<string, string> = EmploymentHistoryEntityNameParam ? EmploymentHistoryEntityNameParam.Value : {};

        if(!entityNameParam){
            throw new Error("EntityName parameter not found");
        }

        if(!emailFieldParam){
            throw new Error("EmailField parameter not found");
        }

        if(!firstNameFieldParam){
            throw new Error("FirstNameField parameter not found");
        }

        if(!lastNameFieldParam){
            throw new Error("LastNameField parameter not found");
        }

        if(!accountNameFieldParam){
            throw new Error("AccountNameField parameter not found");
        }

        if(!enrichedAtFieldParam){
            throw new Error("EnrichedAtField parameter not found");
        }

        if(!filterParam){
            throw new Error("filter parameter not found");
        }

        const md: Metadata = new Metadata();
        const rv: RunView = new RunView();

        const runViewResult = await rv.RunView({
            EntityName: entityNameParam.Value,
            ExtraFilter: filterParam.Value,
        }, params.ContextUser);

        if(!runViewResult.Success){
            return {
                Success: false,
                Message: runViewResult.ErrorMessage,
                ResultCode: "FAILED"
            };
        }

        //need a reference to the length because the ProcessPersonRecordGroup function
        //mutates the results array
        let resultLength: number = 0;
        let pageNumber: number = 0;
        let hasMore: boolean = true;

        while(hasMore){
            LogStatus(`Fetching page ${pageNumber + 1} of records...`);

            let config = {
                EntityName: entityNameParam.Value,
                PageNumber: pageNumber,
                PageSize: 500,
                Filter: `ID IN (select RecordID from __mj.vwListDetails WHERE ListID = '4C04EEF4-7970-EF11-BDFD-00224879D6C4')
                        AND ID NOT IN (SELECT DISTINCT PersonID from ATD.PersonEmploymentHistory)`
            };

            const results: Record<string, any>[] | null = await this.PageRecordsByEntityName<Record<string, any>>(config, params.ContextUser);
            if(!results){
                return {
                    Success: false,
                    Message: "Error querying entity records",
                    ResultCode: "FAILED"
                };
            }

            LogStatus(`Fetched ${results.length} records with max page size of ${config.PageSize}`);
            resultLength = results.length;
            const tasks = [];  // to hold promises

            for (let i = 0; i < results.length; i += Config.GroupSize) {

                // push the promise into tasks array without awaiting
                let processParams: ProcessPersonRecordGroupParams = {
                    Records: results,
                    Startrow: i,
                    GroupLength: Config.GroupSize,
                    Md: md,
                    CurrentUser: params.ContextUser,
                    EmailField: emailFieldParam.Value,
                    FirstNameField: firstNameFieldParam.Value,
                    LastNameField: lastNameFieldParam.Value,
                    AccountNameField: accountNameFieldParam.Value,
                    EntityName: entityNameParam.Value,
                    EnrichedAtField: enrichedAtFieldParam.Value,
                    DomainField: domainParam?.Value,
                    LinkedInField: linkedinParam?.Value,

                    EmploymentHistoryEntityName: employmentHistoryFieldMappings.EmploymentHistoryEntityName,
                    EmploymentHistoryContactIDFieldName: employmentHistoryFieldMappings.EmploymentHistoryContactIDFieldName,
                    EmploymentHistoryOrganizationFieldName: employmentHistoryFieldMappings.EmploymentHistoryOrganizationFieldName,
                    EmploymentHistoryTitleFieldName: employmentHistoryFieldMappings.EmploymentHistoryTitleFieldName,
                    
                    EducationHistoryEntityName: educationHistoryFieldMappings.EducationHistoryEntityName,
                    EducationHistoryContactIDFieldName: educationHistoryFieldMappings.EducationtHistoryContactIDFieldName,
                    EducationHistoryInstitutionFieldName: educationHistoryFieldMappings.EducationtHistoryInstitutionFieldName,
                    EducationHistoryDegreeFieldName: educationHistoryFieldMappings.EducationtHistoryDegreeFieldName
                };

                const task = this.ProcessPersonRecordGroup(processParams);
                tasks.push(task);
            
                if (tasks.length === Config.ConcurrentGroups || i + 1 >= results.length) {
                    // if we started n tasks or reached the end of the result array, await all started tasks
                    await Promise.all(tasks);
            
                    // clear tasks
                    tasks.length = 0;
                }
            }

            if (resultLength < config.PageSize) {
                console.log(results.length, config.PageSize);
                LogStatus(`No more records to process after this page. Total pages: ${pageNumber + 1}`);
                hasMore = false;
                break;
            }

            pageNumber++;
        }

        return {
            Success: true,
            Message: "ApolloAccountsEnrichment executed successfully.",
            ResultCode: "SUCCESS"
        };
    }

    protected async PageRecordsByEntityName<T>(params: PageRecordsParams, currentUser: UserInfo): Promise<T[] | null> {

        const rv: RunView = new RunView();
        const rvResult: RunViewResult<T> = await rv.RunView<T>({
            EntityName: params.EntityName,
            MaxRows: params.PageSize,
            StartRow: Math.max(0, (params.PageNumber - 1) * params.PageSize),
            ExtraFilter: params.Filter
        }, currentUser);
    
        if (!rvResult.Success) {
            LogError('Error querying entity: ', undefined, rvResult.ErrorMessage);
            return null;
        }
    
        return rvResult.Results;
    }

    protected async ProcessPersonRecordGroup(params: ProcessPersonRecordGroupParams): Promise<boolean> {
        try {
            const md: Metadata = params.Md;

            const ApolloParams: ApollowBulkPeopleRequest = {
                api_key: Config.ApolloAPIKey,
                reveal_personal_emails: true,
                details: params.Records.splice(params.Startrow, params.GroupLength).map((record: any) => {
                    const first_name: string = record[params.FirstNameField];
                    const last_name: string = record[params.LastNameField];
                    const email: string = record[params.EmailField];
                    let domain: string | undefined = params.DomainField ? record[params.DomainField] : undefined;
                    const detail = {first_name, last_name, email, domain};
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
                if (result && result.missing_records <= ApolloParams.details.length) {
                    if (result.status.trim().toLowerCase() === 'success' ) {
                        // iterate through the matches array
                        for(const [index, match] of result.matches.entries()){
                            if(!match){
                                LogStatus('No match found for record at index ' + params.Startrow + index);
                                continue;
                            }

                            const contactEntity: BaseEntity = await md.GetEntityObject<BaseEntity>(params.EntityName, params.CurrentUser);
                            const email: string = match.email;

                            if(email && email.trim().length > 0){
                                // update the contact record
                                let entityRecord: Record<string, any> = params.Records[index + params.Startrow];

                                if(!entityRecord){
                                    LogError('Error updating contact record with enriched data, entity record not found', undefined, entityRecord);
                                    continue;
                                }

                                contactEntity.SetMany(entityRecord, true);
                                //contactEntity.Set(params.EmailField, match.email);
                                contactEntity.Set(params.EnrichedAtField, new Date());

                                if(match.organization){
                                    contactEntity.Set(params.AccountNameField, match.organization.name);
                                }
                                
                                if(params.LinkedInField){
                                    contactEntity.Set(params.LinkedInField, match.linkedin_url);
                                }

                                if(match.organization && match.organization.name){
                                    contactEntity.Set(params.AccountNameField, match.organization.name);
                                }

                                bSuccess = bSuccess && (await contactEntity.Save());

                                if(!bSuccess){
                                    LogError('Error updating contact record with enriched data', undefined, contactEntity.LatestResult);
                                }

                                /*
                                if(match.organization_id){
                                    LogStatus(`Found organization: ${match.organization?.name}`);
                                    await this.UpsertContactEmploymentAndEducationHistoryByOrganizationID(match.organization_id, params);
                                }
                                else {
                                    LogStatus('No organization ID found in match');
                                }
                                */

                                if(match.employment_history && params.EmploymentHistoryEntityName){
                                    LogStatus('Upserting contact employment and education history...');
                                    await this.UpsertContactEmploymentAndEducationHistory(match, contactEntity, params);
                                }
                            }
                            else{
                                LogStatus("Match does not contain an email");
                            }
                        }

                        if(bSuccess){
                            console.log('Successfully processed group ' + params.Startrow + ' to ' + (params.Startrow + params.GroupLength));
                        }
                        else{
                            LogStatus('Processed group ' + params.Startrow + ' to ' + (params.Startrow + params.GroupLength) + 'but with errors');
                        }

                        return bSuccess;
                    }
                    else{
                        LogStatus('Apollo.io API response did not return a success status');
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

    protected async UpsertContactEmploymentAndEducationHistoryByOrganizationID(domain: string, params: ProcessPersonRecordGroupParams): Promise<void> {
        try{
            const api_params = {
                api_key: process.env.APOLLO_API_KEY,
                reveal_personal_emails: true,
                q_organization_domains: domain,
                page: 1
            }
    
            const headers = {
                'Cache-Control': 'no-cache',
                'Content-Type': 'application/json' 
            };
    
            const response = await this.WrapApolloCall('post', 'mixed_people/search', api_params, { headers: headers });

            if(response.status !== 200){
                console.error(`Error fetching mixed_people data from Apollo.io: ${response.statusText}`);
                return;
            }

            // here we want to iterate through all the results and update the contacts with the enriched data if
            // the API returned a match
            const result = response.data
            const allPeople = result.people;

            for (let i = 1; i < result.pagination.total_pages && i < (Config.MaxPeopleToEnrichPerOrg / 10); i++) {
                // get additional pages
                api_params.page = i + 1;
                LogStatus(`Fetching page ${i + 1} of ${result.pagination.total_pages} people for domain: ${domain}`);
                const nextResponse = await this.WrapApolloCall('post', 'mixed_people/search', api_params, { headers: headers });
                if (nextResponse.status !== 200) {
                    console.error(`Error fetching mixed_people data from Apollo.io: ${nextResponse.statusText}`);
                    return;
                }
                else {
                    // here we want to iterate through all the results and update the contacts with the enriched data if
                    // the API returned a match
                    const nextResult = nextResponse.data
                    allPeople.push(...nextResult.people);
                }
            }

            if (allPeople && allPeople.length > 0) {
                let i: number = 0;
                for (let p of allPeople) {
                    // first, check to make sure that the person has an email and the domain matches the 
                    // account domain, we don't want people who's primary email doesn't match the domain
                    if (!p.last_name || p.last_name.trim().length === 0 ||
                        !p.email || p.email.trim().length === 0 || p.email.split('@')[1] !== domain) {
                        // skip this person
                        console.log('      * Skipping person: ' + p.first_name + ' ' + p.last_name + ' because email is missing or does not match domain')
                    }
                    else if (this.IsExcludedTitle(p.title)){
                        console.log('      * Skipping person: ' + p.first_name + ' ' + p.last_name + ' because ' + p.title + ' is an excluded title')
                    }  
                    else {
                        const rv: RunView = new RunView();
                        const rvContactResults: RunViewResult = await rv.RunView({
                            EntityName: params.EntityName,
                            ExtraFilter: `${params.EmailField} = '${p.email}' AND ${params.FirstNameField} = '${p.first_name}'`
                        }, params.CurrentUser);

                        if (!rvContactResults.Success) {
                            LogError('Error querying contact entity: ', undefined, rvContactResults.ErrorMessage);
                            i++;
                            continue;
                        }

                        if(rvContactResults.Results.length === 0){
                            console.log('      * Skipping person: ' + p.first_name + ' ' + p.last_name + ' because no matching contact record was found')
                            i++;
                            continue;
                        }

                        const contactEntity: BaseEntity = await params.Md.GetEntityObject<BaseEntity>(params.EntityName, params.CurrentUser);
                        contactEntity.SetMany(rvContactResults.Results[0]);
                        await this.UpsertContactEmploymentAndEducationHistory(p, contactEntity, params);
                    }

                    i++;
                }
            }
            else {
                // missing records == details.length means no matches were found
                console.log('No matches found for this domain: ' + domain);
            }
        }
        catch(ex){
            LogError('Error upserting contact education and employment history by organization ID: ', undefined, ex);
        }
    }

    protected async UpsertContactEmploymentAndEducationHistory(contact: SearchPeopleResponsePerson, contactEntity: BaseEntity, params: ProcessPersonRecordGroupParams): Promise<void> {
        try{
            // loop through the person.employment_history array and create/update the employment history records
            if(!contact || !contact.employment_history || !params.EmploymentHistoryEntityName || !params.EmploymentHistoryContactIDFieldName || !params.EmploymentHistoryOrganizationFieldName || !params.EmploymentHistoryTitleFieldName){
                LogStatus('Unable to upsert contact employment history: missing one or many required parameters');
                return;
            }

            const quotes = contactEntity.FirstPrimaryKey.NeedsQuotes ? "'" : "";
            const rv: RunView = new RunView();

            for(const employment of contact.employment_history){
                const contactID: unknown = contactEntity.Get("ID");
                const rvResults: RunViewResult = await rv.RunView({
                    EntityName: params.EmploymentHistoryEntityName,
                    ExtraFilter: `${params.EmploymentHistoryContactIDFieldName} = ${quotes}${contactID}${quotes} 
                    AND ${params.EmploymentHistoryOrganizationFieldName} = '${this.EscapeSingleQuotes(employment.organization_name)}'
                    AND Title = '${this.EscapeSingleQuotes(employment.title)}'`,
                }, params.CurrentUser);

                if(!rvResults.Success){
                    LogError('Error querying employment history entity: ', undefined, rvResults.ErrorMessage);
                    continue;
                }

                const results: Record<string, any>[] = rvResults.Results;
                const historyEntity: BaseEntity = await params.Md.GetEntityObject<BaseEntity>(params.EmploymentHistoryEntityName, params.CurrentUser);
                if(results.length > 0){
                    // update the existing record
                    historyEntity.SetMany(results[0]);
                }
                else {
                    historyEntity.NewRecord();
                    historyEntity.Set(params.EmploymentHistoryContactIDFieldName, contactID);
                    historyEntity.Set("CreatedAt", new Date());
                }

                historyEntity.Set(params.EmploymentHistoryOrganizationFieldName, this.EscapeSingleQuotes(employment.organization_name).substring(0, 50));
                historyEntity.Set(params.EmploymentHistoryTitleFieldName, this.EscapeSingleQuotes(employment.title));

                if(this.IsValidDate(employment.start_date)){
                    historyEntity.Set('StartedAt', employment.start_date);
                }

                if(this.IsValidDate(employment.end_date)){
                    historyEntity.Set('EndedAt', employment.start_date);
                }

                historyEntity.Set("UpdatedAt", new Date());
                historyEntity.Set("IsCurrent", employment.current);

                const saveResult = await historyEntity.Save();
                if(!saveResult){
                    LogError('Error upserting contact employment history', undefined, historyEntity.LatestResult);
                }

                if(employment.degree){
                    if(!params.EducationHistoryEntityName || !params.EducationHistoryContactIDFieldName || !params.EducationHistoryInstitutionFieldName || !params.EducationHistoryDegreeFieldName){
                        LogStatus('Unable to upsert contact education history, missing one or many required parameters');
                        continue;
                    }

                    const rvEducationResults: RunViewResult = await rv.RunView({
                        EntityName: params.EducationHistoryEntityName,
                        ExtraFilter: `${params.EducationHistoryContactIDFieldName} = ${quotes}${contactID}${quotes}
                        AND ${params.EducationHistoryInstitutionFieldName} = '${this.EscapeSingleQuotes(employment.organization_name)}'
                        AND ${params.EducationHistoryDegreeFieldName} = '${this.EscapeSingleQuotes(employment.degree)}'`,
                    }, params.CurrentUser);

                    if(!rvEducationResults.Success){
                        LogError('Error querying education history entity: ', undefined, rvEducationResults.ErrorMessage);
                        continue;
                    }

                    const educationResults: Record<string, any>[] = rvEducationResults.Results;
                    const educationEntity: BaseEntity = await params.Md.GetEntityObject<BaseEntity>(params.EducationHistoryEntityName, params.CurrentUser);
                    if(educationResults.length > 0){
                        // update the existing record
                        educationEntity.SetMany(educationResults[0]);
                    }
                    else {
                        educationEntity.NewRecord();
                        educationEntity.Set(params.EducationHistoryContactIDFieldName, contactID);
                        educationEntity.Set("CreatedAt", new Date());
                    }

                    educationEntity.Set(params.EducationHistoryInstitutionFieldName, this.EscapeSingleQuotes(employment.organization_name));
                    educationEntity.Set(params.EducationHistoryDegreeFieldName, this.EscapeSingleQuotes(employment.degree));
                    
                    //TODO - add this to mapping
                    educationEntity.Set("GradeLevel", employment.grade_level);
                    educationEntity.Set("UpdatedAt", new Date());
                    
                    if(this.IsValidDate(employment.start_date)){
                        educationEntity.Set('StartedAt', employment.start_date);
                    }
    
                    if(this.IsValidDate(employment.end_date)){
                        educationEntity.Set('EndedAt', employment.start_date);
                    }

                    const saveResult = await educationEntity.Save();
                    if(!saveResult){
                        LogError('Error upserting contact education history: ', undefined, educationEntity.LatestResult);
                    }
                }

            }
        }
        catch(ex){
            LogError('Error upserting contact education and employment history: ', undefined, ex);
        }
    }

    protected EscapeSingleQuotes(str: string) {
        if (str){
            return str.replace(/'/g, "''");
        }

        return '';
    }

    protected IsValidDate(dateString: string): boolean {
        if (dateString && dateString.length > 0) {
            const date = new Date(dateString);
            return date instanceof Date && !isNaN(date.getTime());    
        }

        return false;
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
                let waitTime: number = 60000; // default to 1 minute
                //this is a rough guesstimate, check the response headers for more accurate info
                if(apolloError.response.data){
                    const errorMessage: string = apolloError.response.data
                    if(errorMessage.includes('times per hour')){
                        LogStatus("   >>> Hourly rate limit reached")
                        //we reached out hourly rate limit, so wait an hour 
                        waitTime = 3600000; // wait 1 hour
                    }
                }
                if (retryAttempts > 0) {
                    LogStatus(`   >>> Too many requests to Apollo.io API, waiting ${waitTime / 60000} minute(s) and trying again...`)
                    await this.Timeout(waitTime); // wait 1 minute
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

    protected IsExcludedTitle(title: string): boolean {
        if(!title){
            return false;
        }

        return this.ExcludeTitles.includes(title.trim().toLowerCase());
    }
}

export function LoadApolloContactsEnrichmentAction() {
}

type PageRecordsParams = {
    EntityName: string;
    PageNumber: number;
    PageSize: number;
    Filter?: string;
};