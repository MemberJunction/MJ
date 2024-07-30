import { ActionParam, ActionResultSimple, BaseAction, RunActionParams } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import * as Config from './config';
import { BaseEntity, LogError, LogStatus, Metadata, RunView, UserInfo } from "@memberjunction/core";
import axios, { AxiosResponse } from "axios";
import { AccountEntityFieldNames, AccountTechnologyEntityFieldNames, ContactEducationHistoryEntityFieldNames, ContactEntityFieldNames, OrganizationEnrichmentOrgainzation, ProcessSingleDomainParams, SearchPeopleResponse, SearchPeopleResponsePerson, TechnologyCategoryEntityFieldNames, TechnologyMap } from "./generic/apollo.types";

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
    private ExcludeTitles: string[] = ['member', 'student member', 'student', 'volunteer'];

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        if(!Config.ApolloAPIKey){
            throw new Error('Apollo.io API key not found');
        }

        const accountEntityFieldNamesParam: ActionParam | undefined = params.Params.find(p => p.Name === 'AccountEntityFieldNameJSON');
        const accountTechnologyEntityFieldNamesParam: ActionParam | undefined = params.Params.find(p => p.Name === 'AccountTechnologyEntityFieldNameJSON');
        const technologyCategoryEntityFieldNamesParam: ActionParam | undefined = params.Params.find(p => p.Name === 'TechnologyCategoryEntityFieldNameJSON');
        const ContactEntityFieldNamesParam: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEntityFieldNameJSON');
        const ContactEducationHistoryEntityFieldNamesParam: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEducationHistoryEntityFieldNameJSON');

        let accountEntityFieldNames: AccountEntityFieldNames | null = null;
        let accountTechnologyEntityFieldNames: AccountTechnologyEntityFieldNames | null = null;
        let technologyCategoryEntityFieldNames: TechnologyCategoryEntityFieldNames | null = null;
        let ContactEntityFieldNames: ContactEntityFieldNames | null = null;
        let ContactEducationHistoryEntityFieldNames: ContactEducationHistoryEntityFieldNames | null = null;

        if(!accountEntityFieldNamesParam){
            throw new Error('AccountEntityFieldNames parameter not found');
        }

        if(accountEntityFieldNamesParam && accountEntityFieldNamesParam.Value){
            accountEntityFieldNames = JSON.parse(accountEntityFieldNamesParam.Value);
            if(accountEntityFieldNames){
                throw new Error('accountEntityFieldNames is empty');
            }
        }

        if(accountTechnologyEntityFieldNamesParam && accountTechnologyEntityFieldNamesParam.Value){
            accountTechnologyEntityFieldNames = JSON.parse(accountTechnologyEntityFieldNamesParam.Value) || null;
        }

        if(technologyCategoryEntityFieldNamesParam && technologyCategoryEntityFieldNamesParam.Value){
            technologyCategoryEntityFieldNames = JSON.parse(technologyCategoryEntityFieldNamesParam.Value) || null;
        }

        if(ContactEntityFieldNamesParam && ContactEntityFieldNamesParam.Value){
            ContactEntityFieldNames = JSON.parse(ContactEntityFieldNamesParam.Value) || null;
        }

        if(ContactEducationHistoryEntityFieldNamesParam && ContactEducationHistoryEntityFieldNamesParam.Value){
            ContactEducationHistoryEntityFieldNames = JSON.parse(ContactEducationHistoryEntityFieldNamesParam.Value) || null;
        }

        const md: Metadata = new Metadata();
        const rv: RunView = new RunView();

        const runViewResult = await rv.RunView({
            EntityName: accountEntityFieldNames!.EntityName,
            ExtraFilter: accountEntityFieldNames!.ExtraFilter,
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
        for(const [index, record] of results.entries()){
            const processParams: ProcessSingleDomainParams = {
                Record: record,
                AccountEntity: accountEntityFieldNames!,
                AccountTechnologyEntity: accountTechnologyEntityFieldNames,
                TechnologyCategoryEntity: technologyCategoryEntityFieldNames,
                ContactEntity: ContactEntityFieldNames,
                ContactEducationHistoryEntity: ContactEducationHistoryEntityFieldNames
            };

            const task = this.ProcessSingleDomain(processParams, index, resultLength, md, params.ContextUser);
            tasks.push(task);

            if(tasks.length === Config.ConcurrentGroups || index + 1 >= resultLength){
                // if we started n tasks or reached the end of the result array, await all started tasks
                await Promise.all(tasks);
        
                // clear tasks
                tasks.length = 0;
            }
        }


        if(resultLength > 0){
            // restart the process once more to see if any records remaining
            LogStatus('--- Records left, RESTARTING PROCESS...')
            return await this.InternalRunAction(params);
        }
        else{
            LogStatus('+++ Completed domain enrichment, no records left to process.')
            return {
                Success: true,
                Message: "ApolloAccountsEnrichment executed successfully.",
                ResultCode: "SUCCESS"
            };
        }
    }

    protected async ProcessSingleDomain(params: ProcessSingleDomainParams, startRow: number, totalRows: number, md: Metadata, currentUser: UserInfo): Promise<boolean> {
        const record = params.Record;
        const accountID = record[params.AccountEntity.AccountIDName];
        const domain = record[params.AccountEntity.DomainParamName];

        const enrichOrganizationResult: boolean = await this.EnrichOrganization(params, startRow, totalRows, md, currentUser);
        const createAndEnrichPeopleResult: boolean = await this.CreateAndEnrichPeople(params, accountID, domain, startRow, md, currentUser);
        
        return enrichOrganizationResult && createAndEnrichPeopleResult;
    }

    protected async EnrichOrganization(params: ProcessSingleDomainParams, startRow: number, totalRows: number, md: Metadata, currentUser: UserInfo): Promise<boolean> {

            const record: Record<string, any> = params.Record;
            const orgQueryString = {
                api_key: Config.ApolloAPIKey,
                domain: record[params.AccountEntity.DomainParamName]
            };
    
            const headers = {
                'Cache-Control': 'no-cache',
                'Content-Type': 'application/json' 
            };

            // get the organization enrichment data first
            const orgResponse = await this.WrapApolloCall('get', 'organizations/enrich', null, { params: orgQueryString, headers: headers });
            
            if(!orgResponse || orgResponse.status !== 200){
                return false;
            }

            // here we want to iterate through all the results and update the contacts with the enriched data if
            // the API returned a match
            const result = orgResponse.data
            let bSuccess: boolean = true;
            if (result && result.organization) {
                const organization: OrganizationEnrichmentOrgainzation = result.organization;
                // use the entity object to load up the account and then update some of the fields in it
                const accountEntity: BaseEntity = await md.GetEntityObject(params.AccountEntity.EntityName, currentUser);
                accountEntity.SetMany(record);
                if(params.AccountEntity.AddressFieldName){
                    accountEntity.Set(params.AccountEntity.AddressFieldName, organization.street_address);
                }

                if(params.AccountEntity.CityFieldNameName){
                    accountEntity.Set(params.AccountEntity.CityFieldNameName, organization.city);
                }

                if(params.AccountEntity.CityFieldNameName){
                    accountEntity.Set(params.AccountEntity.CityFieldNameName, organization.city);
                }

                if(params.AccountEntity.StateProvinceFieldName){
                    //accountEntity.Set(params.StateProvinceFieldName, organization.state);
                }

                if(params.AccountEntity.PostalCodeFieldName){
                    accountEntity.Set(params.AccountEntity.PostalCodeFieldName, organization.postal_code);
                }

                if(params.AccountEntity.DescriptionFieldName){
                    accountEntity.Set(params.AccountEntity.DescriptionFieldName, organization.short_description);
                }

                if(params.AccountEntity.PhoneNumberFieldName){
                    accountEntity.Set(params.AccountEntity.PhoneNumberFieldName, organization.phone);
                }

                if(params.AccountEntity.CountryFieldName){
                    accountEntity.Set(params.AccountEntity.CountryFieldName, organization.country);
                }

                if(params.AccountEntity.LinkedInFieldName){
                    accountEntity.Set(params.AccountEntity.LinkedInFieldName, organization.linkedin_url);
                }

                if(params.AccountEntity.LogoURLFieldName){
                    accountEntity.Set(params.AccountEntity.LogoURLFieldName, organization.logo_url);
                }

                if(params.AccountEntity.FacebookFieldName){
                    accountEntity.Set(params.AccountEntity.FacebookFieldName, organization.facebook_url);
                }

                if(params.AccountEntity.TwitterFieldName){
                    accountEntity.Set(params.AccountEntity.TwitterFieldName, organization.twitter_url);
                }

                if(params.AccountEntity.EnrichedAtField){
                    accountEntity.Set(params.AccountEntity.EnrichedAtField, new Date());
                }

                // no field for twitter, add this mapping when that's done
                //accountEntity.Twitter = result.organization.twitter_url;
                const saveResult: boolean = await accountEntity.Save();
                if(!saveResult){
                    LogError('Error updating account record with enriched data', undefined, accountEntity.LatestResult);
                }

                if(params.AccountTechnologyEntity){
                    // now, attempt to create technology records for linking to the account
                    const accountID: string | number = record[params.AccountEntity.AccountIDName];
                    bSuccess = bSuccess && await this.CreateAccountTechnologyRecords(params, accountID, result.organization.current_technologies, md, currentUser);
                }

                return bSuccess;
            }
            else {
                // missing records == details.length means no matches were found
                LogStatus(`  > No matches found for this domain: ${params.Record[params.AccountEntity.DomainParamName]}`);

                // even though there was no match, we still update the LastEnrichedAt field on the account otherwise we'll keep on attempting to run this each
                // time this process goes through the list of accounts.
                const accountEntity: BaseEntity = await md.GetEntityObject<BaseEntity>('Accounts', currentUser);
                accountEntity.SetMany(params.Record);
                accountEntity.Set(params.AccountEntity.EnrichedAtField, new Date());
                const saveResult = await accountEntity.Save();
                if(!saveResult){
                    LogError('Error updating account record with enriched data', undefined, accountEntity.LatestResult);
                }
                return saveResult;
            }
    }

    protected async CreateAccountTechnologyRecords(params: ProcessSingleDomainParams, accountID: string | number, technologies: TechnologyMap[], md: Metadata, currentUser: UserInfo): Promise<boolean> {
        let bSuccess: boolean = true;
        
        const ATEntity: AccountTechnologyEntityFieldNames | null = params.AccountTechnologyEntity;
        if(!ATEntity){
            return false;
        }

        const rv: RunView = new RunView();
        const runViewResult = await rv.RunView({
            EntityName: `${ATEntity.EntityName}`,
            ExtraFilter: `${ATEntity.AccountIDFieldName} = ${accountID}`
        }, currentUser);

        if(!runViewResult.Success){
            LogError('Error querying for existing Account Technologies', undefined, runViewResult.ErrorMessage);
            return false;
        }

        for(const technology of technologies){
            const categoryId: number = await this.GetOrCreateTechnologyCategoryId(params, technology.category, md, currentUser);
            const row = runViewResult.Results.find((r: any) => r.Category.trim().toLowerCase() === technology.category.trim().toLowerCase() && r.Technology.trim().toLowerCase() === technology.name.trim().toLowerCase());
            if(!row || row.length === 0){
                const at = await md.GetEntityObject(ATEntity.EntityName, currentUser);
                at.Set(ATEntity.AccountIDFieldName, accountID);
                at.Set(ATEntity.TechnologyIDFieldName, await this.GetOrCreateTechnologyId(technology.name, categoryId, md, currentUser));
                bSuccess = bSuccess && await at.Save();
            }
            else{
                row.matchFound = true;
            }
        }

        // finally, go through all the rows in existingRows, and for any that have matchFound === true, skip
        // but for rest update them to have their EndedAt = NOW
        const fieldName: string = ATEntity.MatchFoundFieldName;
        for(const record of runViewResult.Results){
            if(!record[fieldName]){
                const entity: BaseEntity = await md.GetEntityObject<BaseEntity>(fieldName, currentUser);
                entity.SetMany(record);
                entity.Set(ATEntity.EndedUseAtFieldName, new Date());
                const saveResult = await entity.Save();
                if(!saveResult){
                    LogError('Error updating Account Technology record with enriched data', undefined, entity.LatestResult);
                }

                bSuccess = bSuccess && saveResult;
            }
        }

        return bSuccess;
    }

    protected async GetOrCreateTechnologyCategoryId(params: ProcessSingleDomainParams, categoryName: string, md: Metadata, currentUser: UserInfo): Promise<number> {
        const TCEntity: TechnologyCategoryEntityFieldNames | null = params.TechnologyCategoryEntity;
        if(!TCEntity){
            return 0;
        }
        
        const rv: RunView = new RunView();
        const runViewResult = await rv.RunView({
            EntityName: TCEntity.EntityName,
            ExtraFilter: `${TCEntity.NameFieldName} = '${this.EscapeSingleQuotes(categoryName)}'`
        }, currentUser);

        if(!runViewResult.Success){
            LogError('Error querying for existing Technology Categories', undefined, runViewResult.ErrorMessage);
            return 0;
        }

        if(runViewResult.Results.length > 0){
            return runViewResult.Results[0].ID;
        }

        //create a new record
        const entity: BaseEntity = await md.GetEntityObject<BaseEntity>(TCEntity.EntityName, currentUser);
        entity.Set(TCEntity.NameFieldName, categoryName);
        const saveResult: boolean = await entity.Save();
        if(!saveResult){
            LogError('Error creating new Technology Category record', undefined, entity.LatestResult);
            return 0;
        }

        return entity.Get(TCEntity.IDFieldName);
    }

    protected async GetOrCreateTechnologyId(name: string, categoryId: number, md: Metadata, currentUser: UserInfo): Promise<number> {
        
        const rv: RunView = new RunView();
        const runViewResult = await rv.RunView({
            EntityName: 'Technologies',
            ExtraFilter: `Name = '${this.EscapeSingleQuotes(name)}' AND CategoryID = ${categoryId}`
        }, currentUser);

        if(!runViewResult.Success){
            LogError('Error querying for existing Technologies', undefined, runViewResult.ErrorMessage);
            return 0;
        }

        if(runViewResult.Results.length > 0){
            return runViewResult.Results[0].ID;
        }
        else{
            const technologyEntity: BaseEntity = await md.GetEntityObject<BaseEntity>('Technologies', currentUser);
            technologyEntity.Set('Name', name);
            technologyEntity.Set('CategoryID', categoryId);
            const saveResult = await technologyEntity.Save();
            if(!saveResult){
                LogError('Error creating new Technology record', undefined, technologyEntity.LatestResult);
                return 0;
            }

            return technologyEntity.Get('ID');
        }
    }

    protected async CreateAndEnrichPeople(params: ProcessSingleDomainParams, accountID: string | number, domain: string, startRow: number, md: Metadata, currentUser: UserInfo): Promise<boolean> {
        let APIparams = {
            api_key: Config.ApolloAPIKey,
            reveal_personal_emails: true,
            q_organization_domains: domain,
            page: 1
        }

        const headers = {
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/json' 
        }; 

        const response = await this.WrapApolloCall('post', 'mixed_people/search', APIparams, { headers: headers });

        if(!response || response.status !== 200){
            LogError(`Error fetching data from Apollo.io: ${response.statusText}`);
            return false;
        }

        // here we want to iterate through all the results and update the contacts with the enriched data if
        // the API returned a match
        const data: SearchPeopleResponse = response.data;
        const allPeople: SearchPeopleResponsePerson[] = data.people;

        for(let i = 1; i < data.pagination.total_pages && i < (Config.MaxPeopleToEnrichPerOrg / 10); i++){
            //get additional pages
            APIparams.page = i + 1;
            const nextResponse = await this.WrapApolloCall('post', 'mixed_people/search', params, { headers: headers });
            if (nextResponse.status !== 200) {
                console.error(`Error fetching data from Apollo.io: ${nextResponse.statusText}`);
                return false;
            }
            else {
                // here we want to iterate through all the results and update the contacts with the enriched data if
                // the API returned a match
                const nextResult: SearchPeopleResponse = nextResponse.data;
                allPeople.push(...nextResult.people);
            }
        }

        let bSuccess: boolean = true;
        if(allPeople.length === 0){
            LogStatus(`No people found for this domain: ${domain}`);
            return true;
        }

        let i: number = 0;
        for(const person of allPeople){
            // first, check to make sure that the person has an email and the domain matches the 
            // account domain, we don't want people who's primary email doesn't match the domain
            if(!person.last_name || !person.email || person.email.split('@')[1] !== domain){
                // skip this person
                LogStatus(`Skipping person: ${person.first_name} ${person.last_name}, accountID: ${accountID} because email is missing or does not match domain`);
            }
            else if(this.IsExcludedTitle(person.title)){
                LogStatus(`Skipping person: ${person.first_name} ${person.last_name}, accountID: ${accountID} because title is excluded`);
            }
            else{
                bSuccess = bSuccess && await this.CreateAndEnrichContact(params, accountID, person, md, currentUser, i, allPeople.length);
            }

            i++;
        }

        return bSuccess;
    }

    protected async CreateAndEnrichContact(params: ProcessSingleDomainParams, accountID: string | number, person: SearchPeopleResponsePerson, md: Metadata, currentUser: UserInfo, sequence: number, total: number): Promise<boolean> {
        const CEntity = params.ContactEntity;
        if(!CEntity){
            return false;
        }
        
        try {
            LogStatus(`Enriching contact for person: ${person.first_name} ${person.last_name}, accountID: ${accountID} (${sequence} of ${total})`);
            // first check to see if there is an existing contact record for this person
            const contact: BaseEntity | null = await this.GetOrCreateContact(params, accountID, person, md, currentUser);
            if(!contact){
                return false;
            }
    
            // now we have a contact entity object and we can enrich it. 
            contact.Set(CEntity.FirstNameFieldName, person.first_name);
            contact.Set(CEntity.LastNameFieldName, person.last_name);
            contact.Set(CEntity.TitleFieldName, person.title);
            if (person.email){
                contact.Set(CEntity.EmailFieldName, person.email);
            }

            contact.Set(CEntity.FacebookFieldName, person.facebook_url);
            contact.Set(CEntity.LinkedInFieldName, person.linkedin_url);
            contact.Set(CEntity.TwitterFieldName, person.twitter_url);
            //contact.Set("PhoneNumber", person.?.length > 0 ? person.phone_numbers[0].raw_number : null;
            contact.Set(CEntity.PhotoFieldName, person.photo_url);
            contact.Set(CEntity.LastEnrichedAtFieldName, new Date());

            const saveResult = contact.Save();
            if(!saveResult){
                LogError('Error updating contact record with enriched data', undefined, contact.LatestResult);
                return false;
            }

            return await contact.Save() && await this.CreateUpdateContactEmploymentAndEducationHistory(params, contact.Get("ID"), person, md, currentUser);
        }
        catch (e) {
            LogError(e);
            return false;
        }
    }

    protected async GetOrCreateContact(params: ProcessSingleDomainParams, accountID: number | string, person: SearchPeopleResponsePerson, md: Metadata, currentUser: UserInfo): Promise<BaseEntity | null> {
        const CEntity = params.ContactEntity;
        if(!CEntity){
            return null;
        }

        const rv: RunView = new RunView();
        const runViewResult = await rv.RunView({
            EntityName: CEntity.EntityName,
            ExtraFilter: `${CEntity.EmailFieldName}  = '${this.EscapeSingleQuotes(person.email)}' AND ${CEntity.AccountIDFieldName} <> ${accountID}`
        }, currentUser);

        if(!runViewResult.Success){
            LogError('Error querying for existing Contacts', undefined, runViewResult.ErrorMessage);
            return null;
        }

        if(runViewResult.Results.length > 0){
            const results = runViewResult.Results;
            LogError(`*** SKIPPING new contact record for ${person.first_name} ${person.last_name} because they are already associated with AccountID: ${results[0].AccountID} - ContactID: ${results[0].ID}`);
            return null;
        }

        // ok, now that we know this person is not associated with another account, check to see if there is an existing record in the vwContacts view FOR this account, could do this more efficiently with a single SQL
        // query, but this is easier to read and understand
        const contactsViewResult = await rv.RunView({
            EntityName: CEntity.EntityName,
            ExtraFilter: `(${CEntity.EmailFieldName} = '${this.EscapeSingleQuotes(person.email)}' OR (${CEntity.FirstNameFieldName} = '${this.EscapeSingleQuotes(person.first_name)}' AND ${CEntity.LastNameFieldName} = '${this.EscapeSingleQuotes(person.last_name)}')) AND
                        ${CEntity.AccountIDFieldName} = ${accountID}` 
        }, currentUser);

        if(!contactsViewResult.Success){
            LogError('Error querying for existing Contacts', undefined, contactsViewResult.ErrorMessage);
            return null;
        }

        const contactEntity: BaseEntity = await md.GetEntityObject<BaseEntity>(CEntity.EntityName, currentUser);
        if(contactsViewResult.Results.length > 0){
            contactEntity.SetMany(contactsViewResult.Results[0]);
            contactEntity.Set(CEntity.EmailFieldName, person.email);
        }
        else{
            LogStatus(`   > Creating new contact record for ${person.first_name} ${person.last_name}`);
            contactEntity.NewRecord();
            contactEntity.Set(CEntity.EmailFieldName, person.email);
            contactEntity.Set(CEntity.AccountIDFieldName, accountID);
            contactEntity.Set(CEntity.ActivityCountFieldName, 0);
            contactEntity.Set(CEntity.EmailSourceFieldName, Config.EmailSourceName);
        }

        return contactEntity;
    }

    protected async CreateUpdateContactEmploymentAndEducationHistory(params: ProcessSingleDomainParams, contactID: number | string, person: SearchPeopleResponsePerson, md: Metadata, currentUser: UserInfo): Promise<boolean> {
        const CEntity = params.ContactEducationHistoryEntity;
        if(!CEntity){
            return false;
        }

        let bSuccess: boolean = true;
        const rv: RunView = new RunView();

        for(const history of person.employment_history){
            if(history.degree && history.degree.length > 0){
                const EHRunViewResult = await rv.RunView({
                    EntityName: CEntity.EntityName,
                    ExtraFilter: `${CEntity.ContactIDFieldName} = ${contactID} AND ${CEntity.InstitutionFieldName} = '${this.EscapeSingleQuotes(history.organization_name)}' AND ${CEntity.DegreeFieldName} = '${this.EscapeSingleQuotes(history.degree)}'`
                }, currentUser);

                if(!EHRunViewResult.Success){
                    LogError('Error querying for existing Employment History', undefined, EHRunViewResult.ErrorMessage);
                    bSuccess = false;
                }

                const historyEntity: BaseEntity = await md.GetEntityObject<BaseEntity>(CEntity.EntityName, currentUser);
                if(EHRunViewResult.Results.length > 0){
                    historyEntity.SetMany(EHRunViewResult.Results[0]);
                }
                else{
                    historyEntity.NewRecord();
                    historyEntity.Set(CEntity.ContactIDFieldName, contactID);
                }

                historyEntity.Set(CEntity.InstitutionFieldName, history.organization_name);
                historyEntity.Set(CEntity.DegreeFieldName, history.degree);
                historyEntity.Set(CEntity.GradeLevelFieldName, !isNaN(history.grade_level as any) ? parseInt(history.grade_level) : 0);
                
                if(this.IsValidDate(history.start_date)){
                    historyEntity.Set(CEntity.StartDateFieldName, new Date(history.start_date));
                }

                if(this.IsValidDate(history.end_date)){
                    historyEntity.Set(CEntity.EndDateFieldName, new Date(history.end_date));
                }

                historyEntity.Set(CEntity.IsCurrentFieldName, history.current);
                const saveResult = await historyEntity.Save();
                if(!saveResult){
                    LogError('Error saving Employment History record', undefined, historyEntity.LatestResult);
                    bSuccess = false;
                }
            }
        }

        return bSuccess;
    }
    
    protected IsValidDate(dateString: string): boolean {
        if (dateString && dateString.length > 0) {
            const date = new Date(dateString);
            return date instanceof Date && !isNaN(date.getTime());    
        }
        else{
            return false;
        }
    }

    protected IsExcludedTitle(title: string): boolean {
        if(!title){
            return false;
        }

        return this.ExcludeTitles.includes(title.toLowerCase());
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