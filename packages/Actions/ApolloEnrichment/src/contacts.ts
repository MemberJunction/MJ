import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import * as Config from './config';
import { BaseEntity, LogError, LogStatus, Metadata, RunView, RunViewResult, UserInfo, CompositeKey } from "@memberjunction/core";
import axios, { AxiosResponse } from "axios";
import { ApolloBulkPeopleRequest, ApolloBulkPeopleResponse, ProcessPersonRecordGroupParams, SearchPeopleResponsePerson } from "./generic/apollo.types";
import { ActionParam, ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";

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

    private readonly ExcludeTitles: string[] = ['member', 'student member', 'student','volunteer'];

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Validate API configuration
            const configValidation = this.validateConfiguration();
            if (!configValidation.success) {
                return configValidation.error!;
            }

            // Extract and validate parameters
            const paramValidation = this.extractAndValidateParameters(params);
            if (!paramValidation.success) {
                return paramValidation.error!;
            }

            const { actionParams, historyMappings } = paramValidation.data!;

            // Process all contact records
            return await this.processAllContactRecords(actionParams, historyMappings, params.ContextUser);
        } catch (error) {
            LogError('Unexpected error in ApolloContactsEnrichmentAction', undefined, error);
            return {
                Success: false,
                Message: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                ResultCode: "FAILED"
            };
        }
    }

    private validateConfiguration(): { success: boolean; error?: ActionResultSimple } {
        if (!Config.ApolloAPIKey) {
            return {
                success: false,
                error: {
                    Success: false,
                    Message: 'Apollo.io API key not found in configuration',
                    ResultCode: "CONFIGURATION_ERROR"
                }
            };
        }
        return { success: true };
    }

    private extractAndValidateParameters(params: RunActionParams): { 
        success: boolean; 
        data?: { actionParams: ContactEnrichmentParams; historyMappings: HistoryMappings }; 
        error?: ActionResultSimple 
    } {
        // Extract required parameters
        const entityNameParam = this.getRequiredParam(params, 'EntityName');
        const emailFieldParam = this.getRequiredParam(params, 'EmailField');
        const firstNameFieldParam = this.getRequiredParam(params, 'FirstNameField');
        const lastNameFieldParam = this.getRequiredParam(params, 'LastNameField');
        const accountNameFieldParam = this.getRequiredParam(params, 'AccountNameField');
        const enrichedAtFieldParam = this.getRequiredParam(params, 'EnrichedAtField');
        const filterParam = this.getRequiredParam(params, 'FilterParam');

        // Check for any missing required parameters
        const missingParams = [];
        if (!entityNameParam) missingParams.push('EntityName');
        if (!emailFieldParam) missingParams.push('EmailField');
        if (!firstNameFieldParam) missingParams.push('FirstNameField');
        if (!lastNameFieldParam) missingParams.push('LastNameField');
        if (!accountNameFieldParam) missingParams.push('AccountNameField');
        if (!enrichedAtFieldParam) missingParams.push('EnrichedAtField');
        if (!filterParam) missingParams.push('FilterParam');

        if (missingParams.length > 0) {
            return {
                success: false,
                error: {
                    Success: false,
                    Message: `Missing required parameters: ${missingParams.join(', ')}`,
                    ResultCode: "VALIDATION_ERROR"
                }
            };
        }

        // Extract optional parameters
        const domainParam = this.getOptionalParam(params, 'domainParam');
        const linkedinParam = this.getOptionalParam(params, 'linkedinParam');

        // Extract history mappings
        const educationHistoryMappings = this.parseHistoryMappings(params, 'EducationHistoryFieldMappings');
        const employmentHistoryMappings = this.parseHistoryMappings(params, 'EmploymentHistoryFieldMappings');

        const actionParams: ContactEnrichmentParams = {
            entityName: entityNameParam.Value,
            emailField: emailFieldParam.Value,
            firstNameField: firstNameFieldParam.Value,
            lastNameField: lastNameFieldParam.Value,
            accountNameField: accountNameFieldParam.Value,
            enrichedAtField: enrichedAtFieldParam.Value,
            filter: filterParam.Value,
            domainField: domainParam?.Value,
            linkedInField: linkedinParam?.Value
        };

        const historyMappings: HistoryMappings = {
            education: educationHistoryMappings,
            employment: employmentHistoryMappings
        };

        return { success: true, data: { actionParams, historyMappings } };
    }

    private async processAllContactRecords(
        actionParams: ContactEnrichmentParams, 
        historyMappings: HistoryMappings, 
        contextUser: UserInfo
    ): Promise<ActionResultSimple> {
        let pageNumber = 0;
        let hasMore = true;
        const md = new Metadata();

        while (hasMore) {
            LogStatus(`Fetching page ${pageNumber + 1} of records...`);

            const pageResult = await this.processContactRecordsPage(
                actionParams, 
                historyMappings, 
                pageNumber, 
                md, 
                contextUser
            );

            if (!pageResult.success) {
                return pageResult.error!;
            }

            hasMore = pageResult.hasMore;
            pageNumber++;
        }

        return {
            Success: true,
            Message: "ApolloContactsEnrichment executed successfully.",
            ResultCode: "SUCCESS"
        };
    }

    private async processContactRecordsPage(
        actionParams: ContactEnrichmentParams,
        historyMappings: HistoryMappings,
        pageNumber: number,
        md: Metadata,
        contextUser: UserInfo
    ): Promise<{ success: boolean; hasMore: boolean; error?: ActionResultSimple }> {
        const pageConfig = {
            EntityName: actionParams.entityName,
            PageNumber: pageNumber,
            PageSize: 500,
            Filter: actionParams.filter
        };

        const results = await this.PageRecordsByEntityName<Record<string, any>>(pageConfig, contextUser);
        if (!results) {
            return {
                success: false,
                hasMore: false,
                error: {
                    Success: false,
                    Message: "Error querying entity records",
                    ResultCode: "FAILED"
                }
            };
        }

        LogStatus(`Fetched ${results.length} records with max page size of ${pageConfig.PageSize}`);

        // Process records in concurrent groups
        await this.processRecordGroups(results, actionParams, historyMappings, md, contextUser);

        const hasMore = results.length >= pageConfig.PageSize;
        return { success: true, hasMore };
    }

    private async processRecordGroups(
        results: Record<string, any>[],
        actionParams: ContactEnrichmentParams,
        historyMappings: HistoryMappings,
        md: Metadata,
        contextUser: UserInfo
    ): Promise<void> {
        const tasks = [];

        for (let i = 0; i < results.length; i += Config.GroupSize) {
            const processParams: ProcessPersonRecordGroupParams = {
                Records: results,
                Startrow: i,
                GroupLength: Config.GroupSize,
                Md: md,
                CurrentUser: contextUser,
                EmailField: actionParams.emailField,
                FirstNameField: actionParams.firstNameField,
                LastNameField: actionParams.lastNameField,
                AccountNameField: actionParams.accountNameField,
                EntityName: actionParams.entityName,
                EnrichedAtField: actionParams.enrichedAtField,
                DomainField: actionParams.domainField,
                LinkedInField: actionParams.linkedInField,

                EmploymentHistoryEntityName: historyMappings.employment.EmploymentHistoryEntityName,
                EmploymentHistoryContactIDFieldName: historyMappings.employment.EmploymentHistoryContactIDFieldName,
                EmploymentHistoryOrganizationFieldName: historyMappings.employment.EmploymentHistoryOrganizationFieldName,
                EmploymentHistoryTitleFieldName: historyMappings.employment.EmploymentHistoryTitleFieldName,
                
                EducationHistoryEntityName: historyMappings.education.EducationHistoryEntityName,
                EducationHistoryContactIDFieldName: historyMappings.education.EducationtHistoryContactIDFieldName,
                EducationHistoryInstitutionFieldName: historyMappings.education.EducationtHistoryInstitutionFieldName,
                EducationHistoryDegreeFieldName: historyMappings.education.EducationtHistoryDegreeFieldName
            };

            const task = this.ProcessPersonRecordGroup(processParams);
            tasks.push(task);
        
            if (tasks.length === Config.ConcurrentGroups || i + Config.GroupSize >= results.length) {
                await Promise.all(tasks);
                tasks.length = 0;
            }
        }
    }
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

            const ApolloParams: ApolloBulkPeopleRequest = {
                api_key: Config.ApolloAPIKey,
                reveal_personal_emails: true,
                details: params.Records.slice(params.Startrow, params.Startrow + params.GroupLength).map((record: any) => {
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
                const result: ApolloBulkPeopleResponse = response.data;
                let bSuccess: boolean = true;
                if (result && result.missing_records <= ApolloParams.details.length) {
                    if (result.status.trim().toLowerCase() === 'success' ) {
                        // iterate through the matches array
                        for(const [index, match] of result.matches.entries()){
                            if(!match){
                                LogStatus('No match found for record at index ' + params.Startrow + index);
                                continue;
                            }

                            const email: string = match.email;

                            if(email && email.trim().length > 0){
                                // update the contact record
                                let entityRecord: Record<string, any> = params.Records[index + params.Startrow];
                                
                                if(!entityRecord){
                                    LogError('Error updating contact record with enriched data, entity record not found', undefined, entityRecord);
                                    bSuccess = false;
                                    continue;
                                }
                                
                                const contactEntity: BaseEntity = await md.GetEntityObject<BaseEntity>(params.EntityName, CompositeKey.FromID(entityRecord.ID), params.CurrentUser);

                                contactEntity.SetMany(entityRecord, true);
                                contactEntity.Set(params.EmailField, match.email);
                                contactEntity.Set(params.EnrichedAtField, new Date());
                                
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
                    historyEntity.Set('EndedAt', employment.end_date);
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
                        educationEntity.Set('EndedAt', employment.end_date);
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
                    const errorMessage: string = typeof apolloError.response.data === 'string' 
                        ? apolloError.response.data 
                        : JSON.stringify(apolloError.response.data);
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