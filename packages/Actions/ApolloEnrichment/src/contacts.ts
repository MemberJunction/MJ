import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import * as Config from './config';
import { BaseEntity, LogError, LogStatus, Metadata, RunView, RunViewResult, UserInfo, CompositeKey } from "@memberjunction/core";
import axios, { AxiosResponse } from "axios";
import { ApolloBulkPeopleRequest, ApolloBulkPeopleResponse, ProcessPersonRecordGroupParams, SearchPeopleResponsePerson } from "./generic/apollo.types";
import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";

/**
 * Configuration parameters for contact enrichment action
 * Defines the entity and field mappings for contact enrichment
 */
interface ContactEnrichmentParams {
    EntityName: string;
    EmailField: string;
    FirstNameField: string;
    LastNameField: string;
    TitleField: string;
    EnrichedAtField: string;
    Filter: string;
    ProfilePictureURLField?: string;
    AccountNameField?: string;
    DomainField?: string;
    LinkedInField?: string;
    TwitterField?: string;
    FacebookField?: string;
}

/**
 * Mappings for employment and education history entity fields
 * Used to create related history records for enriched contacts
 */
interface HistoryMappings {
    education: Record<string, string>;
    employment: Record<string, string>;
}

/**
 * Parameters for paginated record retrieval
 * Used to process large datasets in manageable chunks
 */
type PageRecordsParams = {
    EntityName: string;
    PageNumber: number;
    PageSize: number;
    Filter?: string;
};

/**
 * Action that enriches contact records using Apollo.io's people matching and search APIs
 * 
 * This action performs contact enrichment by:
 * 1. Bulk matching existing contacts against Apollo's database
 * 2. Updating contact records with enriched social profiles and company data
 * 3. Creating employment and education history records
 * 4. Processing contacts in configurable batch sizes for optimal performance
 * 
 * @example
 * ```typescript
 * // Basic contact enrichment
 * await runAction({
 *   ActionName: 'ApolloEnrichmentContactsAction',
 *   Params: [{
 *     Name: 'EntityName',
 *     Value: 'Contacts'
 *   }, {
 *     Name: 'EmailField',
 *     Value: 'Email'
 *   }, {
 *     Name: 'FirstNameField',
 *     Value: 'FirstName'
 *   }, {
 *     Name: 'LastNameField',
 *     Value: 'LastName'
 *   }, {
 *     Name: 'TitleField',
 *     Value: 'Title'
 *   }, {
 *     Name: 'EnrichedAtField',
 *     Value: 'EnrichedAt'
 *   }, {
 *     Name: 'Filter',
 *     Value: 'Email IS NOT NULL AND EnrichedAt IS NULL'
 *   }]
 * });
 * 
 * // Full enrichment with history tracking
 * await runAction({
 *   ActionName: 'ApolloEnrichmentContactsAction',
 *   Params: [
 *     // ... basic params ...
 *     {
 *       Name: 'EmploymentHistoryFieldMappings',
 *       Value: JSON.stringify({
 *         EmploymentHistoryEntityName: 'Contact Employment Histories',
 *         EmploymentHistoryContactIDFieldName: 'ContactID',
 *         EmploymentHistoryOrganizationFieldName: 'Organization',
 *         EmploymentHistoryTitleFieldName: 'Title'
 *       })
 *     }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "ApolloEnrichmentContactsAction")
export class ApolloEnrichmentContactsAction extends BaseAction {
    /**
     * Job titles to exclude when processing contacts
     * These are typically not business decision-makers
     */
    private readonly ExcludeTitles: string[] = ['member', 'student member', 'student','volunteer'];

    /**
     * Main entry point for the Apollo contact enrichment action
     * 
     * @param params - The action parameters containing:
     *   - EntityName: Required - Name of the contact entity to enrich
     *   - EmailField: Required - Field name containing email addresses
     *   - FirstNameField: Required - Field name containing first names
     *   - LastNameField: Required - Field name containing last names
     *   - TitleField: Required - Field name containing job titles
     *   - EnrichedAtField: Required - Field to track enrichment timestamp
     *   - Filter: Required - SQL filter to select contacts for enrichment
     *   - ProfilePictureURLField: Optional - Field for profile picture URLs
     *   - AccountNameField: Optional - Field for company/account names
     *   - DomainField: Optional - Field for email domains
     *   - LinkedInField: Optional - Field for LinkedIn profile URLs
     *   - TwitterField: Optional - Field for Twitter profile URLs
     *   - FacebookField: Optional - Field for Facebook profile URLs
     *   - EmploymentHistoryFieldMappings: Optional - JSON mapping for employment history entity
     *   - EducationHistoryFieldMappings: Optional - JSON mapping for education history entity
     * 
     * @returns Promise<ActionResultSimple> indicating success/failure and any error messages
     */
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

    /**
     * Validates that the Apollo.io API key is configured properly
     * @returns Validation result with success flag and potential error details
     */
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

    /**
     * Extracts and validates all action parameters from the request
     * Processes both required and optional parameters for contact enrichment
     * 
     * @param params - The action parameters containing entity and field configurations
     * @returns Object with success flag, validated parameters, or error details
     */
    private extractAndValidateParameters(params: RunActionParams): { 
        success: boolean; 
        data?: { actionParams: ContactEnrichmentParams; historyMappings: HistoryMappings }; 
        error?: ActionResultSimple 
    } {
        // Extract required parameters
        const entityName = this.getParamValue(params, 'EntityName');
        const emailField = this.getParamValue(params, 'EmailField');
        const firstNameField = this.getParamValue(params, 'FirstNameField');
        const lastNameField = this.getParamValue(params, 'LastNameField');
        const titleField = this.getParamValue(params, 'TitleField');
        const enrichedAtField = this.getParamValue(params, 'EnrichedAtField');
        const filter = this.getParamValue(params, 'Filter');

        // Check for any missing required parameters
        const missingParams = [];
        if (!entityName) missingParams.push('EntityName');
        if (!emailField) missingParams.push('EmailField');
        if (!firstNameField) missingParams.push('FirstNameField');
        if (!lastNameField) missingParams.push('LastNameField');
        if (!titleField) missingParams.push('TitleField');
        if (!enrichedAtField) missingParams.push('EnrichedAtField');
        if (!filter) missingParams.push('Filter');

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
        const profilePictureURLField = this.getParamValue(params, 'ProfilePictureURLField');
        const accountNameField = this.getParamValue(params, 'AccountNameField');
        const domainField = this.getParamValue(params, 'DomainField');
        const linkedInField = this.getParamValue(params, 'LinkedInField');
        const twitterField = this.getParamValue(params, 'TwitterField');
        const facebookField = this.getParamValue(params, 'FacebookField');

        // Extract history mappings
        const educationHistoryMappings = this.parseHistoryMappings(params, 'EducationHistoryFieldMappings');
        const employmentHistoryMappings = this.parseHistoryMappings(params, 'EmploymentHistoryFieldMappings');

        const actionParams: ContactEnrichmentParams = {
            EntityName: entityName,
            EmailField: emailField,
            FirstNameField: firstNameField,
            LastNameField: lastNameField,
            TitleField: titleField,
            EnrichedAtField: enrichedAtField,
            Filter: filter,
            ProfilePictureURLField: profilePictureURLField,
            AccountNameField: accountNameField,
            DomainField: domainField,
            LinkedInField: linkedInField,
            TwitterField: twitterField,
            FacebookField: facebookField
        };

        const historyMappings: HistoryMappings = {
            education: educationHistoryMappings,
            employment: employmentHistoryMappings
        };

        return { success: true, data: { actionParams, historyMappings } };
    }

    /**
     * Extract parameter value by name (case-insensitive)
     * Handles special case where 'null' string should be treated as null value
     * 
     * @param params - The action parameters
     * @param paramName - Name of the parameter to extract
     * @returns Parameter value or null if not found or explicitly 'null'
     */
    protected getParamValue(params: RunActionParams, paramName: string): any {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (param && param.Value && param.Value === 'null') {
            return null;
        }
        else {
            return param?.Value;
        }
    }

    /**
     * Parses JSON field mappings for employment/education history entities
     * Used to configure how history records should be created and updated
     * 
     * @param params - The action parameters
     * @param paramName - Name of the history mapping parameter
     * @returns Parsed field mappings or empty object if invalid/missing
     */
    private parseHistoryMappings(params: RunActionParams, paramName: string): Record<string, string> {
        const param = params.Params.find(p => p.Name === paramName);
        if (!param || !param.Value) {
            return {};
        }
        
        // If it's already an object, use it directly
        if (typeof param.Value === 'object' && param.Value !== null) {
            return param.Value as Record<string, string>;
        }
        
        // If it's a string, try to parse it as JSON
        if (typeof param.Value === 'string') {
            try {
                return JSON.parse(param.Value) || {};
            } catch (error) {
                LogError(`Error parsing ${paramName}`, undefined, error);
                return {};
            }
        }
        
        return {};
    }

    /**
     * Processes all contact records using paginated queries
     * Continues processing until all matching records have been enriched
     * 
     * @param actionParams - Configuration parameters for contact enrichment
     * @param historyMappings - Field mappings for employment/education history
     * @param contextUser - User context for data access and security
     * @returns Promise indicating overall success/failure of the enrichment
     */
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

    /**
     * Processes a single page of contact records for enrichment
     * Retrieves records using pagination and processes them in concurrent groups
     * 
     * @param actionParams - Configuration parameters for contact enrichment
     * @param historyMappings - Field mappings for employment/education history
     * @param pageNumber - Current page number (zero-based)
     * @param md - Metadata instance for entity operations
     * @param contextUser - User context for data access
     * @returns Object indicating success, whether more pages exist, and any errors
     */
    private async processContactRecordsPage(
        actionParams: ContactEnrichmentParams,
        historyMappings: HistoryMappings,
        pageNumber: number,
        md: Metadata,
        contextUser: UserInfo
    ): Promise<{ success: boolean; hasMore: boolean; error?: ActionResultSimple }> {
        const pageConfig = {
            EntityName: actionParams.EntityName,
            PageNumber: pageNumber,
            PageSize: 500,
            Filter: actionParams.Filter
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

    /**
     * Processes contact records in concurrent groups for optimal performance
     * Respects configured group size and concurrency limits
     * 
     * @param results - Array of contact records to process
     * @param actionParams - Configuration parameters for enrichment
     * @param historyMappings - Field mappings for history entities
     * @param md - Metadata instance for entity operations
     * @param contextUser - User context for data access
     */
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
                EmailField: actionParams.EmailField,
                FirstNameField: actionParams.FirstNameField,
                LastNameField: actionParams.LastNameField,
                TitleField: actionParams.TitleField,
                EntityName: actionParams.EntityName,
                EnrichedAtField: actionParams.EnrichedAtField,
                ProfilePictureURLField: actionParams.ProfilePictureURLField,
                AccountNameField: actionParams.AccountNameField,
                DomainField: actionParams.DomainField,
                LinkedInField: actionParams.LinkedInField,
                TwitterField: actionParams.TwitterField,
                FacebookField: actionParams.FacebookField,
                EmploymentHistoryEntityName: historyMappings.employment.EntityName,
                EmploymentHistoryContactIDFieldName: historyMappings.employment.ContactIDFieldName,
                EmploymentHistoryOrganizationFieldName: historyMappings.employment.OrganizationFieldName,
                EmploymentHistoryTitleFieldName: historyMappings.employment.TitleFieldName,
                EducationHistoryEntityName: historyMappings.education.EntityName,
                EducationHistoryContactIDFieldName: historyMappings.education.ContactIDFieldName,
                EducationHistoryInstitutionFieldName: historyMappings.education.InstitutionFieldName,
                EducationHistoryDegreeFieldName: historyMappings.education.DegreeFieldName
            };

            const task = this.ProcessPersonRecordGroup(processParams);
            tasks.push(task);
        
            if (tasks.length === Config.ConcurrentGroups || i + Config.GroupSize >= results.length) {
                await Promise.all(tasks);
                tasks.length = 0;
            }
        }
    }

    /**
     * Retrieves a page of records from a specified entity using RunView
     * Supports pagination with configurable page size and filtering
     * 
     * @param params - Parameters defining entity, page, and filter criteria
     * @param currentUser - User context for data access
     * @returns Array of records or null if query failed
     */
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

    /**
     * Processes a group of contact records using Apollo's bulk people matching API
     * Enriches contacts with social profiles, company data, and employment history
     * 
     * @param params - Group processing parameters with contact data and entity mappings
     * @returns Promise<boolean> indicating success/failure of the group processing
     */
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

                                contactEntity.Set(params.EmailField, match.email);
                                contactEntity.Set(params.EnrichedAtField, new Date());

                                if (params.TitleField && match.title) {
                                    contactEntity.Set(params.TitleField, match.title);
                                }
  
                                if (params.AccountNameField && match.organization && match.organization.name) {    
                                    contactEntity.Set(params.AccountNameField, match.organization.name);
                                }
                            
                                if (params.ProfilePictureURLField && match.photo_url) {
                                    contactEntity.Set(params.ProfilePictureURLField, match.photo_url);
                                }

                                if(params.LinkedInField && match.linkedin_url){
                                    contactEntity.Set(params.LinkedInField, match.linkedin_url);
                                }

                                if (params.TwitterField && match.twitter_url) {  
                                    contactEntity.Set(params.TwitterField, match.twitter_url);
                                }                                    
                                    
                                if (params.FacebookField && match.facebook_url) {  
                                    contactEntity.Set(params.FacebookField, match.facebook_url);
                                }     

                                bSuccess = bSuccess && (await contactEntity.Save());

                                if(!bSuccess){
                                    LogError('Error updating contact record with enriched data', undefined, contactEntity.LatestResult);
                                }

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

    /**
     * Enriches contacts by searching for people at a specific organization domain
     * Uses Apollo's people search to find contacts and update their employment/education history
     * 
     * @param domain - Organization domain to search for people
     * @param params - Processing parameters with entity configurations
     */
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

    /**
     * Creates or updates employment and education history records for a contact
     * Processes Apollo employment history data to create both employment and education records
     * 
     * @param contact - Apollo person data containing employment history
     * @param contactEntity - Contact entity to create history for
     * @param params - Processing parameters with history entity configurations
     */
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
                let historyEntity: BaseEntity | null = null;
                
                if(results.length > 0) {
                    // update the existing record
                    historyEntity = await params.Md.GetEntityObject<BaseEntity>(params.EmploymentHistoryEntityName, CompositeKey.FromID(results[0].ID), params.CurrentUser);
                }
                else {
                    historyEntity = await params.Md.GetEntityObject<BaseEntity>(params.EmploymentHistoryEntityName, params.CurrentUser);
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
                    let educationEntity: BaseEntity | null = null;
                    
                    if(educationResults.length > 0){
                        // update the existing record
                        educationEntity = await params.Md.GetEntityObject<BaseEntity>(params.EducationHistoryEntityName, CompositeKey.FromID(educationResults[0].ID), params.CurrentUser);
                    }
                    else {
                        educationEntity= await params.Md.GetEntityObject<BaseEntity>(params.EducationHistoryEntityName, params.CurrentUser);
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

    /**
     * Escapes single quotes in strings for SQL query safety
     * Prevents SQL injection in dynamic filter construction
     * 
     * @param str - String to escape
     * @returns Escaped string with doubled single quotes
     */
    protected EscapeSingleQuotes(str: string) {
        if (str){
            return str.replace(/'/g, "''");
        }

        return '';
    }

    /**
     * Validates if a date string represents a valid date
     * Used for employment/education history date validation
     * 
     * @param dateString - Date string to validate
     * @returns boolean - true if valid date
     */
    protected IsValidDate(dateString: string): boolean {
        if (dateString && dateString.length > 0) {
            const date = new Date(dateString);
            return date instanceof Date && !isNaN(date.getTime());    
        }

        return false;
    }
    
    /**
     * Wraps Apollo.io API calls with intelligent retry logic for rate limiting
     * Handles both per-minute and hourly rate limits with appropriate backoff
     * 
     * @param method - HTTP method ('get' or 'post')
     * @param endpoint - Apollo API endpoint path
     * @param data - Request payload for POST requests
     * @param config - Axios configuration object
     * @param retryAttempts - Number of retry attempts remaining (default: 1)
     * @returns Promise<AxiosResponse> - Apollo API response
     * @throws Error if rate limit exceeded or other API errors
     */
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
    
    /**
     * Utility method for creating delays in async operations
     * Used for rate limit backoff and API throttling
     * 
     * @param ms - Number of milliseconds to wait
     * @returns Promise that resolves after the specified delay
     */
    private async Timeout(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Checks if a job title should be excluded from contact processing
     * Filters out non-business contacts like students and volunteers
     * 
     * @param title - Job title to check
     * @returns boolean - true if title should be excluded
     */
    protected IsExcludedTitle(title: string): boolean {
        if(!title){
            return false;
        }

        return this.ExcludeTitles.includes(title.trim().toLowerCase());
    }
}