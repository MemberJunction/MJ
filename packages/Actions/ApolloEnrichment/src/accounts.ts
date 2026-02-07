import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import * as Config from './config';
import { BaseEntity, LogError, LogStatus, Metadata, RunView, UserInfo, CompositeKey } from "@memberjunction/core";
import axios, { AxiosResponse } from "axios";
import { AccountEntityFields, AccountTechnologyEntityFields, ContactEducationHistoryEntityFields, ContactEntityFields, OrganizationEnrichmentOrganization, ProcessSingleDomainParams, SearchPeopleResponse, SearchPeopleResponsePerson, TechnologyCategoryEntityFields, TechnologyMap } from "./generic/apollo.types";
import { ActionParam, ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";

/**
 * Configuration parameters for account enrichment action
 * Defines the field mappings and optional entity configurations for enrichment
 */
interface AccountEnrichmentParams {
    accountEntityFields: AccountEntityFields;
    accountTechnologyEntityFields?: AccountTechnologyEntityFields | null;
    technologyCategoryEntityFields?: TechnologyCategoryEntityFields | null;
    contactEntityFields?: ContactEntityFields | null;
    contactEducationHistoryEntityFields?: ContactEducationHistoryEntityFields | null;
}

/**
 * Action that enriches account records using Apollo.io's organization and people data
 * 
 * This action performs comprehensive account enrichment by:
 * 1. Enriching organization data (address, phone, social profiles, etc.)
 * 2. Creating technology stack records for the organization
 * 3. Finding and enriching contacts associated with the organization
 * 4. Creating employment/education history for contacts
 * 
 * @example
 * ```typescript
 * // Basic account enrichment
 * await runAction({
 *   ActionName: 'ApolloEnrichmentAccountsAction',
 *   Params: [{
 *     Name: 'AccountEntityFieldMappings',
 *     Value: JSON.stringify({
 *       EntityName: 'Accounts',
 *       Filter: 'Domain IS NOT NULL AND EnrichedAt IS NULL',
 *       DomainField: 'Domain',
 *       AccountIDField: 'ID',
 *       EnrichedAtField: 'EnrichedAt'
 *     })
 *   }]
 * });
 * 
 * // Full enrichment with contacts and technologies
 * await runAction({
 *   ActionName: 'ApolloEnrichmentAccountsAction',
 *   Params: [{
 *     Name: 'AccountEntityFieldMappings',
 *     Value: JSON.stringify(accountConfig)
 *   }, {
 *     Name: 'ContactEntityFieldMappings',
 *     Value: JSON.stringify(contactConfig)
 *   }, {
 *     Name: 'AccountTechnologyEntityFieldMappings',
 *     Value: JSON.stringify(technologyConfig)
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "ApolloEnrichmentAccountsAction")
export class ApolloEnrichmentAccountsAction extends BaseAction {
    /**
     * Job titles to exclude when creating contact records
     * These are typically not decision-makers or relevant contacts
     */
    private readonly ExcludeTitles: string[] = ['member', 'student member', 'student', 'volunteer'];

    /**
     * Main entry point for the Apollo account enrichment action
     * 
     * @param params - The action parameters containing:
     *   - AccountEntityFieldMappings: Required JSON configuration for account entity field mappings
     *   - ContactEntityFieldMappings: Optional JSON configuration for contact entity field mappings
     *   - AccountTechnologyEntityFieldMappings: Optional JSON configuration for technology tracking
     *   - TechnologyCategoryEntityFieldMappings: Optional JSON configuration for technology categories
     *   - ContactEducationHistoryEntityFieldMappings: Optional JSON configuration for education history
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

            const actionParams = paramValidation.data!;

            // Process all account records
            return await this.processAllAccountRecords(actionParams, params.ContextUser, 1);
        } catch (error) {
            LogError('Unexpected error in ApolloAccountsEnrichmentAction', undefined, error);
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
     * 
     * @param params - The action parameters containing JSON configurations
     * @returns Object with success flag, validated parameters, or error details
     */
    private extractAndValidateParameters(params: RunActionParams): { 
        success: boolean; 
        data?: AccountEnrichmentParams; 
        error?: ActionResultSimple 
    } {
        const accountEntityFieldsParam = this.getRequiredParam(params, 'AccountEntityFieldMappings');
        if (!accountEntityFieldsParam) {
            return {
                success: false,
                error: {
                    Success: false,
                    Message: 'Missing required parameter: AccountEntityFieldMappings',
                    ResultCode: "VALIDATION_ERROR"
                }
            };
        }

        let accountEntityFields: AccountEntityFields;
        try {
            accountEntityFields = this.parseJSONParam(accountEntityFieldsParam.Value);
            if (!accountEntityFields) {
                throw new Error('Parsed AccountEntityFieldMappings is empty');
            }
        } catch (error) {
            return {
                success: false,
                error: {
                    Success: false,
                    Message: 'Invalid AccountEntityFieldMappings parameter: must be valid JSON or object',
                    ResultCode: "VALIDATION_ERROR"
                }
            };
        }

        // Extract optional parameters
        const accountTechnologyEntityFields = this.parseOptionalJSONParam<AccountTechnologyEntityFields>(params, 'AccountTechnologyEntityFieldMappings');
        const technologyCategoryEntityFields = this.parseOptionalJSONParam<TechnologyCategoryEntityFields>(params, 'TechnologyCategoryEntityFieldMappings');
        const contactEntityFields = this.parseOptionalJSONParam<ContactEntityFields>(params, 'ContactEntityFieldMappings');
        const contactEducationHistoryEntityFields = this.parseOptionalJSONParam<ContactEducationHistoryEntityFields>(params, 'ContactEducationHistoryEntityFieldMappings');

        return {
            success: true,
            data: {
                accountEntityFields,
                accountTechnologyEntityFields,
                technologyCategoryEntityFields,
                contactEntityFields,
                contactEducationHistoryEntityFields
            }
        };
    }

    /**
     * Gets a required parameter from the action parameters
     * @param params - The action parameters
     * @param paramName - Name of the required parameter
     * @returns The parameter if found, null otherwise
     */
    private getRequiredParam(params: RunActionParams, paramName: string): ActionParam | null {
        const param = params.Params.find(p => p.Name === paramName);
        return param || null;
    }

    /**
     * Parses an optional JSON parameter with error handling
     * @param params - The action parameters
     * @param paramName - Name of the optional JSON parameter
     * @returns Parsed object of type T or null if not provided/invalid
     */
    private parseOptionalJSONParam<T>(params: RunActionParams, paramName: string): T | null {
        const param = params.Params.find(p => p.Name === paramName);
        if (!param || !param.Value) {
            return null;
        }
        
        try {
            return this.parseJSONParam(param.Value) || null;
        } catch (error) {
            LogError(`Error parsing ${paramName}`, undefined, error);
            return null;
        }
    }

    /**
     * Parses a parameter value that may be a JSON string or already parsed object
     * Handles the case where action parameters ending with JSON can be either strings or objects
     * 
     * @param value - The parameter value to parse (string or object)
     * @returns Parsed object of type T
     * @throws Error if value cannot be parsed as JSON (when it's a string)
     */
    private parseJSONParam<T = any>(value: any): T {
        // If value is already an object (not a string), return it directly
        if (typeof value === 'object' && value !== null) {
            return value;
        }
        
        // If value is a string, try to parse it as JSON
        if (typeof value === 'string') {
            return JSON.parse(value);
        }
        
        // For other types, try to convert to string first then parse
        return JSON.parse(String(value));
    }

    /**
     * Recursively processes all account records that match the filter criteria
     * Uses batching and concurrency control to handle large datasets efficiently
     * 
     * @param actionParams - Validated action parameters with entity field mappings
     * @param contextUser - User context for data access and security
     * @param executionCount - Current execution count to prevent infinite recursion (max 5)
     * @returns Promise indicating overall success/failure of the batch
     */
    private async processAllAccountRecords(
        actionParams: AccountEnrichmentParams, 
        contextUser: UserInfo,
        executionCount: number = 1
    ): Promise<ActionResultSimple> {
        const md = new Metadata();
        const rv = new RunView();

        // Initial query to get accounts to process
        const runViewResult = await rv.RunView({
            EntityName: actionParams.accountEntityFields.EntityName,
            ExtraFilter: actionParams.accountEntityFields.Filter,
        }, contextUser);

        if (!runViewResult.Success) {
            return {
                Success: false,
                Message: runViewResult.ErrorMessage,
                ResultCode: "FAILED"
            };
        }

        const results = runViewResult.Results;
        const resultLength = results.length;

        if (resultLength === 0) {
            LogStatus('+++ Completed domain enrichment, no records left to process.');
            return {
                Success: true,
                Message: "ApolloAccountsEnrichment executed successfully.",
                ResultCode: "SUCCESS"
            };
        }

        // Check execution limit to prevent infinite recursion
        if (executionCount >= 5) {
            LogStatus(`+++ Reached maximum execution limit (${executionCount}), stopping to prevent infinite recursion.`);
            return {
                Success: true,
                Message: `ApolloAccountsEnrichment stopped after ${executionCount} executions to prevent infinite recursion. ${resultLength} records may remain unprocessed.`,
                ResultCode: "SUCCESS"
            };
        }

        // Process accounts in concurrent groups
        await this.processAccountGroups(results, actionParams, md, contextUser);

        // Check if there are more records to process by running the query again
        LogStatus(`--- Checking for remaining records... (execution ${executionCount + 1}/5)`);
        return await this.processAllAccountRecords(actionParams, contextUser, executionCount + 1);
    }

    /**
     * Processes account records in concurrent groups to optimize performance
     * Respects the configured concurrency limit to avoid overwhelming APIs
     * 
     * @param results - Array of account records to process
     * @param actionParams - Configuration parameters for enrichment
     * @param md - Metadata instance for entity operations
     * @param contextUser - User context for data access
     */
    private async processAccountGroups(
        results: any[],
        actionParams: AccountEnrichmentParams,
        md: Metadata,
        contextUser: UserInfo
    ): Promise<void> {
        const tasks = [];
        const resultLength = results.length;

        for (const [index, record] of results.entries()) {
            const processParams: ProcessSingleDomainParams = {
                Record: record,
                AccountEntity: actionParams.accountEntityFields,
                AccountTechnologyEntity: actionParams.accountTechnologyEntityFields || null,
                TechnologyCategoryEntity: actionParams.technologyCategoryEntityFields || null,
                ContactEntity: actionParams.contactEntityFields || null,
                ContactEducationHistoryEntity: actionParams.contactEducationHistoryEntityFields || null
            };

            const task = this.ProcessSingleDomain(processParams, index, resultLength, md, contextUser);
            tasks.push(task);

            if (tasks.length === Config.ConcurrentGroups || index + 1 >= resultLength) {
                await Promise.all(tasks);
                tasks.length = 0;
            }
        }
    }

    /**
     * Processes a single domain for both organization and people enrichment
     * This is the main orchestration method for enriching one account
     * 
     * @param params - Domain processing parameters with entity configurations
     * @param startRow - Current row number for progress tracking
     * @param totalRows - Total number of rows for progress tracking
     * @param md - Metadata instance for entity operations
     * @param currentUser - User context for data access
     * @returns Promise<boolean> indicating success/failure of domain processing
     */
    protected async ProcessSingleDomain(params: ProcessSingleDomainParams, startRow: number, totalRows: number, md: Metadata, currentUser: UserInfo): Promise<boolean> {
        const record = params.Record;
        const accountID = record[params.AccountEntity.AccountIDField];
        const domain = record[params.AccountEntity.DomainField];

        const enrichOrganizationResult = await this.enrichOrganization(params, startRow, totalRows, md, currentUser);
        const createAndEnrichPeopleResult = await this.createAndEnrichPeople(params, accountID, domain, startRow, md, currentUser);
        
        return enrichOrganizationResult && createAndEnrichPeopleResult;
    }

    /**
     * Enriches organization data using Apollo.io's organization enrichment endpoint
     * Updates account record with company information and triggers technology processing
     * 
     * @param params - Domain processing parameters
     * @param startRow - Current row for progress tracking
     * @param totalRows - Total rows for progress tracking
     * @param md - Metadata instance for entity operations
     * @param currentUser - User context for data access
     * @returns Promise<boolean> indicating success/failure
     */
    private async enrichOrganization(params: ProcessSingleDomainParams, startRow: number, totalRows: number, md: Metadata, currentUser: UserInfo): Promise<boolean> {
        try {
            const record = params.Record;
            const orgQueryString = {
                api_key: Config.ApolloAPIKey,
                domain: record[params.AccountEntity.DomainField]
            };
    
            const headers = {
                'Cache-Control': 'no-cache',
                'Content-Type': 'application/json' 
            };

            // Get the organization enrichment data
            const orgResponse = await this.WrapApolloCall('get', 'organizations/enrich', null, { params: orgQueryString, headers: headers });
            
            if (!orgResponse || orgResponse.status !== 200) {
                return false;
            }

            const result = orgResponse.data;
            let bSuccess = true;
            
            if (result && result.organization) {
                bSuccess = await this.updateAccountWithOrganizationData(result.organization, params, record, md, currentUser);
                
                if (params.AccountTechnologyEntity && bSuccess) {
                    const accountID = record[params.AccountEntity.AccountIDField];
                    bSuccess = bSuccess && await this.CreateAccountTechnologyRecords(params, accountID, result.organization.current_technologies, md, currentUser);
                }
            } else {
                // No match found, but still update enriched timestamp
                LogStatus(`  > No matches found for this domain: ${params.Record[params.AccountEntity.DomainField]}`);
                bSuccess = await this.updateAccountEnrichedTimestamp(params, record, md, currentUser);
            }

            return bSuccess;
        } catch (error) {
            LogError('Error enriching organization', undefined, error);
            return false;
        }
    }

    /**
     * Updates an account entity with enriched organization data from Apollo.io
     * Maps Apollo organization fields to the configured account entity fields
     * 
     * @param organization - Apollo organization data
     * @param params - Processing parameters with field mappings
     * @param record - Current account record data
     * @param md - Metadata instance for entity operations
     * @param currentUser - User context for data access
     * @returns Promise<boolean> indicating save success/failure
     */
    private async updateAccountWithOrganizationData(
        organization: OrganizationEnrichmentOrganization,
        params: ProcessSingleDomainParams,
        record: Record<string, any>,
        md: Metadata,
        currentUser: UserInfo
    ): Promise<boolean> {
        try {
            const accountEntity = await md.GetEntityObject(params.AccountEntity.EntityName, CompositeKey.FromID(record.ID), currentUser);

            // Set organization data fields
            this.setFieldIfExists(accountEntity, params.AccountEntity.AddressField, organization.street_address);
            this.setFieldIfExists(accountEntity, params.AccountEntity.CityField, organization.city);
            this.setFieldIfExists(accountEntity, params.AccountEntity.StateProvinceField, organization.state);
            this.setFieldIfExists(accountEntity, params.AccountEntity.PostalCodeField, organization.postal_code);
            this.setFieldIfExists(accountEntity, params.AccountEntity.DescriptionField, organization.short_description);
            this.setFieldIfExists(accountEntity, params.AccountEntity.PhoneNumberField, organization.phone);
            this.setFieldIfExists(accountEntity, params.AccountEntity.CountryField, organization.country);
            this.setFieldIfExists(accountEntity, params.AccountEntity.LinkedInField, organization.linkedin_url);
            this.setFieldIfExists(accountEntity, params.AccountEntity.LogoURLField, organization.logo_url);
            this.setFieldIfExists(accountEntity, params.AccountEntity.FacebookField, organization.facebook_url);
            this.setFieldIfExists(accountEntity, params.AccountEntity.TwitterField, organization.twitter_url);
            this.setFieldIfExists(accountEntity, params.AccountEntity.EnrichedAtField, new Date());

            const saveResult = await accountEntity.Save();
            if (!saveResult) {
                LogError('Error updating account record with enriched data', undefined, accountEntity.LatestResult);
            }

            return saveResult;
        } catch (error) {
            LogError('Error updating account with organization data', undefined, error);
            return false;
        }
    }

    /**
     * Updates the enrichment timestamp on an account even when no data was found
     * Prevents repeated attempts to enrich accounts with no Apollo data
     * 
     * @param params - Processing parameters with field mappings
     * @param record - Current account record data
     * @param md - Metadata instance for entity operations
     * @param currentUser - User context for data access
     * @returns Promise<boolean> indicating save success/failure
     */
    private async updateAccountEnrichedTimestamp(
        params: ProcessSingleDomainParams,
        record: Record<string, any>,
        md: Metadata,
        currentUser: UserInfo
    ): Promise<boolean> {
        try {
            const accountEntity = await md.GetEntityObject<BaseEntity>('Accounts', CompositeKey.FromID(record.ID), currentUser);
            accountEntity.Set(params.AccountEntity.EnrichedAtField, new Date());
            
            const saveResult = await accountEntity.Save();
            if (!saveResult) {
                LogError('Error updating account record with enriched timestamp', undefined, accountEntity.LatestResult);
            }
            
            return saveResult;
        } catch (error) {
            LogError('Error updating account enriched timestamp', undefined, error);
            return false;
        }
    }

    /**
     * Safely sets a field on an entity if the field name is defined and value is not null
     * Prevents errors from undefined field mappings
     * 
     * @param entity - Target entity to update
     * @param fieldName - Name of the field (can be undefined)
     * @param value - Value to set (checked for null/undefined)
     */
    private setFieldIfExists(entity: BaseEntity, fieldName: string | undefined, value: any): void {
        if (fieldName && value != null) {
            entity.Set(fieldName, value);
        }
    }

    /**
     * Creates or updates technology records associated with an account
     * Manages the relationship between accounts and their technology stack
     * Marks old technologies as ended if no longer detected
     * 
     * @param params - Processing parameters with technology entity configuration
     * @param accountID - ID of the account to associate technologies with
     * @param technologies - Array of technology data from Apollo
     * @param md - Metadata instance for entity operations
     * @param currentUser - User context for data access
     * @returns Promise<boolean> indicating overall success/failure
     */
    protected async CreateAccountTechnologyRecords(params: ProcessSingleDomainParams, accountID: string | number, technologies: TechnologyMap[], md: Metadata, currentUser: UserInfo): Promise<boolean> {
        if (!params.AccountTechnologyEntity || !technologies || technologies.length === 0) {
            return true;
        }

        try {
            let bSuccess = true;
            const ATEntity = params.AccountTechnologyEntity;

            if (ATEntity.TechnologyIDField && ATEntity.TechnologyField && ATEntity.CategoryField) {
                const rv = new RunView();
                
                const runViewResult = await rv.RunView({
                    EntityName: ATEntity.EntityName,
                    ExtraFilter: `${ATEntity.AccountIDField} = ${accountID}`
                }, currentUser);

                if (!runViewResult.Success) {
                    LogError('Error querying for existing Account Technologies', undefined, runViewResult.ErrorMessage);
                    return false;
                }

                // Process each technology
                for (const technology of technologies) {
                    const categoryId = await this.getOrCreateTechnologyCategoryId(params, technology.category, md, currentUser);
                    const existingRow = runViewResult.Results.find((r: any) => 
                        r[ATEntity.CategoryField]?.trim().toLowerCase() === technology.category.trim().toLowerCase() && 
                        r[ATEntity.TechnologyField]?.trim().toLowerCase() === technology.name.trim().toLowerCase()
                    );

                    if (!existingRow) {
                        // Create new technology record
                        const at = await md.GetEntityObject(ATEntity.EntityName, currentUser);
                        at.NewRecord();
                        at.Set(ATEntity.AccountIDField, accountID);
                        at.Set(ATEntity.TechnologyIDField, await this.getOrCreateTechnologyId(technology.name, categoryId, md, currentUser));
                        bSuccess = bSuccess && await at.Save();
                    } else {
                        existingRow.matchFound = true;
                    }
                }

                // Mark unmatched technologies as ended
                for (const record of runViewResult.Results) {
                    if (!record.matchFound) {
                        const entity = await md.GetEntityObject<BaseEntity>(ATEntity.EntityName, CompositeKey.FromID(record.ID), currentUser);
                        entity.Set(ATEntity.EndedUseAtField, new Date());
                        
                        const saveResult = await entity.Save();

                        if (!saveResult) {
                            LogError('Error updating Account Technology record', undefined, entity.LatestResult);
                        }
                        bSuccess = bSuccess && saveResult;
                    }
                }
            }

            return bSuccess;
        } catch (error) {
            LogError('Error creating account technology records', undefined, error);
            return false;
        }
    }

    /**
     * Gets or creates a technology category record by name
     * Ensures technology categories exist before creating technology records
     * 
     * @param params - Processing parameters with category entity configuration
     * @param categoryName - Name of the technology category
     * @param md - Metadata instance for entity operations
     * @param currentUser - User context for data access
     * @returns Promise<number> - ID of the category (0 if error)
     */
    private async getOrCreateTechnologyCategoryId(params: ProcessSingleDomainParams, categoryName: string, md: Metadata, currentUser: UserInfo): Promise<number> {
        const TCEntity = params.TechnologyCategoryEntity;
        if (!TCEntity) {
            return 0;
        }
        
        try {
            const rv = new RunView();
            const runViewResult = await rv.RunView({
                EntityName: TCEntity.EntityName,
                ExtraFilter: `${TCEntity.NameField} = '${this.EscapeSingleQuotes(categoryName)}'`
            }, currentUser);

            if (!runViewResult.Success) {
                LogError('Error querying for existing Technology Categories', undefined, runViewResult.ErrorMessage);
                return 0;
            }

            if (runViewResult.Results.length > 0) {
                return runViewResult.Results[0].ID;
            }

            // Create new record
            const entity = await md.GetEntityObject<BaseEntity>(TCEntity.EntityName, currentUser);
            entity.NewRecord();
            entity.Set(TCEntity.NameField, categoryName);
            
            const saveResult = await entity.Save();
            if (!saveResult) {
                LogError('Error creating new Technology Category record', undefined, entity.LatestResult);
                return 0;
            }

            return entity.Get(TCEntity.IDField);
        } catch (error) {
            LogError('Error getting or creating technology category', undefined, error);
            return 0;
        }
    }

    /**
     * Gets or creates a technology record by name and category
     * Maintains referential integrity between technologies and categories
     * 
     * @param name - Name of the technology
     * @param categoryId - ID of the technology category
     * @param md - Metadata instance for entity operations
     * @param currentUser - User context for data access
     * @returns Promise<number> - ID of the technology (0 if error)
     */
    private async getOrCreateTechnologyId(name: string, categoryId: number, md: Metadata, currentUser: UserInfo): Promise<number> {
        try {
            const rv = new RunView();
            const runViewResult = await rv.RunView({
                EntityName: 'Technologies',
                ExtraFilter: `Name = '${this.EscapeSingleQuotes(name)}' AND CategoryID = ${categoryId}`
            }, currentUser);

            if (!runViewResult.Success) {
                LogError('Error querying for existing Technologies', undefined, runViewResult.ErrorMessage);
                return 0;
            }

            if (runViewResult.Results.length > 0) {
                return runViewResult.Results[0].ID;
            }

            // Create new technology record
            const technologyEntity = await md.GetEntityObject<BaseEntity>('Technologies', currentUser);
            technologyEntity.NewRecord();
            technologyEntity.Set('Name', name);
            technologyEntity.Set('CategoryID', categoryId);
            
            const saveResult = await technologyEntity.Save();
            if (!saveResult) {
                LogError('Error creating new Technology record', undefined, technologyEntity.LatestResult);
                return 0;
            }

            return technologyEntity.Get('ID');
        } catch (error) {
            LogError('Error getting or creating technology', undefined, error);
            return 0;
        }
    }

    /**
     * Searches for and enriches people associated with an organization's domain
     * Uses Apollo's people search to find contacts at the organization
     * Handles pagination to retrieve all available contacts (up to configured limit)
     * 
     * @param params - Processing parameters with contact entity configuration
     * @param accountID - ID of the account to associate contacts with
     * @param domain - Organization domain to search for people
     * @param startRow - Current row for progress tracking
     * @param md - Metadata instance for entity operations
     * @param currentUser - User context for data access
     * @returns Promise<boolean> indicating success/failure of people processing
     */
    private async createAndEnrichPeople(params: ProcessSingleDomainParams, accountID: string | number, domain: string, startRow: number, md: Metadata, currentUser: UserInfo): Promise<boolean> {
        if (!params.ContactEntity) {
            return true; // No contact processing needed
        }

        try {
            const APIparams = {
                api_key: Config.ApolloAPIKey,
                reveal_personal_emails: true,
                q_organization_domains: domain,
                page: 1
            };

            const headers = {
                'Cache-Control': 'no-cache',
                'Content-Type': 'application/json' 
            }; 

            const response = await this.WrapApolloCall('post', 'mixed_people/search', APIparams, { headers: headers });

            if (!response || response.status !== 200) {
                LogError(`Error fetching data from Apollo.io: ${response?.statusText}`);
                return false;
            }

            const data: SearchPeopleResponse = response.data;
            const allPeople: SearchPeopleResponsePerson[] = data.people;

            // Fetch additional pages
            for (let i = 1; i < data.pagination.total_pages && i < (Config.MaxPeopleToEnrichPerOrg / 10); i++) {
                APIparams.page = i + 1;
                const nextResponse = await this.WrapApolloCall('post', 'mixed_people/search', APIparams, { headers: headers });
                
                if (nextResponse.status !== 200) {
                    console.error(`Error fetching data from Apollo.io: ${nextResponse.statusText}`);
                    return false;
                }
                
                const nextResult: SearchPeopleResponse = nextResponse.data;
                allPeople.push(...nextResult.people);
            }

            if (allPeople.length === 0) {
                LogStatus(`No people found for this domain: ${domain}`);
                return true;
            }

            // Process all people
            let bSuccess = true;
            for (let i = 0; i < allPeople.length; i++) {
                const person = allPeople[i];
                
                if (this.shouldSkipPerson(person, domain)) {
                    continue;
                }

                bSuccess = bSuccess && await this.createAndEnrichContact(params, accountID, person, md, currentUser, i, allPeople.length);
            }

            return bSuccess;
        } catch (error) {
            LogError('Error creating and enriching people', undefined, error);
            return false;
        }
    }

    /**
     * Determines if a person should be skipped during contact creation
     * Filters out people with missing data or excluded job titles
     * 
     * @param person - Person data from Apollo search response
     * @param domain - Expected domain for email validation
     * @returns boolean - true if person should be skipped
     */
    private shouldSkipPerson(person: SearchPeopleResponsePerson, domain: string): boolean {
        // Check for missing required data
        if (!person.last_name || !person.email || person.email.split('@')[1] !== domain) {
            LogStatus(`Skipping person: ${person.first_name} ${person.last_name} because email is missing or does not match domain`);
            return true;
        }

        // Check for excluded titles
        if (this.IsExcludedTitle(person.title)) {
            LogStatus(`Skipping person: ${person.first_name} ${person.last_name} because title is excluded`);
            return true;
        }

        return false;
    }

    /**
     * Creates or updates a contact record with enriched data from Apollo
     * Handles contact deduplication and data validation
     * 
     * @param params - Processing parameters with contact entity configuration
     * @param accountID - ID of the account to associate contact with
     * @param person - Person data from Apollo search response
     * @param md - Metadata instance for entity operations
     * @param currentUser - User context for data access
     * @param sequence - Current contact number for progress tracking
     * @param total - Total contacts for progress tracking
     * @returns Promise<boolean> indicating success/failure
     */
    private async createAndEnrichContact(params: ProcessSingleDomainParams, accountID: string | number, person: SearchPeopleResponsePerson, md: Metadata, currentUser: UserInfo, sequence: number, total: number): Promise<boolean> {
        const CEntity = params.ContactEntity;
        if (!CEntity) {
            return false;
        }
        
        try {
            LogStatus(`Enriching contact for person: ${person.first_name} ${person.last_name}, accountID: ${accountID} (${sequence} of ${total})`);
            
            const contact = await this.getOrCreateContact(params, accountID, person, md, currentUser);
            if (!contact) {
                return false;
            }
    
            // Update contact with enriched data
            this.updateContactFields(contact, person, CEntity);

            const saveResult = await contact.Save();
            if (!saveResult) {
                LogError('Error updating contact record with enriched data', undefined, contact.LatestResult);
                return false;
            }

            // Update employment and education history if configured
            if (params.ContactEducationHistoryEntity) {
                return await this.createUpdateContactEmploymentAndEducationHistory(params, contact.Get("ID"), person, md, currentUser);
            }

            return true;
        } catch (error) {
            LogError('Error creating and enriching contact', undefined, error);
            return false;
        }
    }

    /**
     * Updates contact entity fields with person data from Apollo
     * Maps Apollo person fields to the configured contact entity fields
     * 
     * @param contact - Contact entity to update
     * @param person - Person data from Apollo
     * @param CEntity - Contact entity field name mappings
     */
    private updateContactFields(contact: BaseEntity, person: SearchPeopleResponsePerson, CEntity: ContactEntityFields): void {
        contact.Set(CEntity.FirstNameField, person.first_name);
        contact.Set(CEntity.LastNameField, person.last_name);
        contact.Set(CEntity.TitleField, person.title);
        
        if (person.email) {
            contact.Set(CEntity.EmailField, person.email);
        }

        this.setFieldIfExists(contact, CEntity.FacebookField, person.facebook_url);
        this.setFieldIfExists(contact, CEntity.LinkedInField, person.linkedin_url);
        this.setFieldIfExists(contact, CEntity.TwitterField, person.twitter_url);
        this.setFieldIfExists(contact, CEntity.ProfilePictureURLField, person.photo_url);
        contact.Set(CEntity.EnrichedAtField, new Date());
    }

    /**
     * Gets an existing contact or creates a new one with conflict detection
     * Prevents duplicate contacts across different accounts
     * Supports matching by email or name combination
     * 
     * @param params - Processing parameters with contact entity configuration
     * @param accountID - ID of the account to associate contact with
     * @param person - Person data from Apollo
     * @param md - Metadata instance for entity operations
     * @param currentUser - User context for data access
     * @returns Promise<BaseEntity | null> - Contact entity or null if conflict/error
     */
    private async getOrCreateContact(params: ProcessSingleDomainParams, accountID: number | string, person: SearchPeopleResponsePerson, md: Metadata, currentUser: UserInfo): Promise<BaseEntity | null> {
        const CEntity = params.ContactEntity;
        if (!CEntity) {
            return null;
        }

        try {
            const rv = new RunView();
            
            // Check if contact exists with different account
            const conflictResult = await rv.RunView({
                EntityName: CEntity.EntityName,
                ExtraFilter: `${CEntity.EmailField} = '${this.EscapeSingleQuotes(person.email)}' AND ${CEntity.AccountIDField} <> ${accountID}`
            }, currentUser);

            if (!conflictResult.Success) {
                LogError('Error querying for existing Contacts', undefined, conflictResult.ErrorMessage);
                return null;
            }

            if (conflictResult.Results.length > 0) {
                const existing = conflictResult.Results[0];
                LogError(`*** SKIPPING new contact record for ${person.first_name} ${person.last_name} because they are already associated with AccountID: ${existing.AccountID} - ContactID: ${existing.ID}`);
                return null;
            }

            // Check if contact exists for this account
            const existingResult = await rv.RunView({
                EntityName: CEntity.EntityName,
                ExtraFilter: `(${CEntity.EmailField} = '${this.EscapeSingleQuotes(person.email)}' OR (${CEntity.FirstNameField} = '${this.EscapeSingleQuotes(person.first_name)}' AND ${CEntity.LastNameField} = '${this.EscapeSingleQuotes(person.last_name)}')) AND ${CEntity.AccountIDField} = ${accountID}` 
            }, currentUser);

            if (!existingResult.Success) {
                LogError('Error querying for existing Contacts', undefined, existingResult.ErrorMessage);
                return null;
            }

            let contactEntity: BaseEntity | null = null;
            
            if (existingResult.Results.length > 0) {
                // Update existing contact
                contactEntity = await md.GetEntityObject<BaseEntity>(CEntity.EntityName, existingResult.Results[0].ID, currentUser);
                contactEntity.Set(CEntity.EmailField, person.email);
            } else {
                // Create new contact
                LogStatus(`   > Creating new contact record for ${person.first_name} ${person.last_name}`);
                contactEntity = await md.GetEntityObject<BaseEntity>(CEntity.EntityName, currentUser);
                contactEntity.NewRecord();
                contactEntity.Set(CEntity.EmailField, person.email);
                contactEntity.Set(CEntity.AccountIDField, accountID);
                contactEntity.Set(CEntity.ActivityCountField, 0);
                contactEntity.Set(CEntity.EmailSourceField, Config.EmailSourceName);
            }

            return contactEntity;
        } catch (error) {
            LogError('Error getting or creating contact', undefined, error);
            return null;
        }
    }

    /**
     * Creates or updates employment and education history records for a contact
     * Processes Apollo employment history data to create education records
     * 
     * @param params - Processing parameters with education entity configuration
     * @param contactID - ID of the contact to create history for
     * @param person - Person data containing employment history
     * @param md - Metadata instance for entity operations
     * @param currentUser - User context for data access
     * @returns Promise<boolean> indicating success/failure
     */
    private async createUpdateContactEmploymentAndEducationHistory(params: ProcessSingleDomainParams, contactID: number | string, person: SearchPeopleResponsePerson, md: Metadata, currentUser: UserInfo): Promise<boolean> {
        const CEntity = params.ContactEducationHistoryEntity;
        if (!CEntity || !person.employment_history) {
            return true;
        }

        try {
            let bSuccess = true;
            const rv = new RunView();

            for (const history of person.employment_history) {
                if (history.degree && history.degree.length > 0) {
                    const EHRunViewResult = await rv.RunView({
                        EntityName: CEntity.EntityName,
                        ExtraFilter: `${CEntity.ContactIDField} = ${contactID} AND ${CEntity.InstitutionField} = '${this.EscapeSingleQuotes(history.organization_name)}' AND ${CEntity.DegreeField} = '${this.EscapeSingleQuotes(history.degree)}'`
                    }, currentUser);

                    if (!EHRunViewResult.Success) {
                        LogError('Error querying for existing Employment History', undefined, EHRunViewResult.ErrorMessage);
                        bSuccess = false;
                        continue;
                    }

                    let historyEntity: BaseEntity | null = null;
                    
                    if (EHRunViewResult.Results.length > 0) {
                        historyEntity = await md.GetEntityObject<BaseEntity>(CEntity.EntityName, CompositeKey.FromID(EHRunViewResult.Results[0].ID), currentUser);
                    } else {
                        historyEntity = await md.GetEntityObject<BaseEntity>(CEntity.EntityName, currentUser);
                        historyEntity.NewRecord();
                        historyEntity.Set(CEntity.ContactIDField, contactID);
                    }

                    // Set history data
                    historyEntity.Set(CEntity.InstitutionField, history.organization_name);
                    historyEntity.Set(CEntity.DegreeField, history.degree);
                    historyEntity.Set(CEntity.GradeLevelField, !isNaN(history.grade_level as any) ? parseInt(history.grade_level) : 0);
                    
                    if (this.IsValidDate(history.start_date)) {
                        historyEntity.Set(CEntity.StartDateField, new Date(history.start_date));
                    }

                    if (this.IsValidDate(history.end_date)) {
                        historyEntity.Set(CEntity.EndDateField, new Date(history.end_date));
                    }

                    historyEntity.Set(CEntity.IsCurrentField, history.current);
                    
                    const saveResult = await historyEntity.Save();
                    if (!saveResult) {
                        LogError('Error saving Employment History record', undefined, historyEntity.LatestResult);
                        bSuccess = false;
                    }
                }
            }

            return bSuccess;
        } catch (error) {
            LogError('Error creating/updating contact employment and education history', undefined, error);
            return false;
        }
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
     * Checks if a job title should be excluded from contact creation
     * Filters out non-business contacts like students and volunteers
     * 
     * @param title - Job title to check
     * @returns boolean - true if title should be excluded
     */
    protected IsExcludedTitle(title: string): boolean {
        if (!title) {
            return false;
        }
        return this.ExcludeTitles.includes(title.toLowerCase());
    }

    /**
     * Escapes single quotes in strings for SQL query safety
     * Prevents SQL injection in dynamic filter construction
     * 
     * @param str - String to escape
     * @returns string - Escaped string with doubled single quotes
     */
    protected EscapeSingleQuotes(str: string): string {
        if (str) {
            return str.replace(/'/g, "''");
        }
        return '';
    } 
    
    /**
     * Wraps Apollo.io API calls with retry logic for rate limiting
     * Handles 429 (Too Many Requests) responses with exponential backoff
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
    
    /**
     * Utility method for creating delays in async operations
     * Used for rate limit backoff and API throttling
     * 
     * @param ms - Number of milliseconds to wait
     * @returns Promise that resolves after the specified delay
     */
    private async Timeout(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }  
}