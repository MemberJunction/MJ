import { ActionParam, ActionResultSimple, BaseAction, RunActionParams } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import * as Config from './config';
import { BaseEntity, LogError, LogStatus, Metadata, RunView, UserInfo } from "@memberjunction/core";
import axios, { AxiosResponse } from "axios";
import { OrganizationEnrichmentOrgainzation, ProcessSingleDomainParams, SearchPeopleResponse, SearchPeopleResponsePerson, TechnologyMap } from "./generic/apollo.types";

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
        if(!process.env.APOLLO_API_KEY){
            throw new Error('Apollo.io API key not found');
        }

        const entityNameParam: ActionParam | undefined = params.Params.find(p => p.Name === 'EntityName');
        const domainFieldNameParam: ActionParam | undefined = params.Params.find(p => p.Name === 'DomainFieldName');
        const AccountIDFieldNameParam: ActionParam | undefined = params.Params.find(p => p.Name === 'AccountIDFieldName');
        const enrichedAtFieldNameParam: ActionParam | undefined = params.Params.find(p => p.Name === 'EnrichedAtFieldName');
        const filterParam: ActionParam | undefined = params.Params.find(p => p.Name === 'EnrichmentFieldMapping');

        const addressFieldNameParam: ActionParam | undefined = params.Params.find(p => p.Name === 'AddressFieldNameParam');
        const cityFieldNameParam: ActionParam | undefined = params.Params.find(p => p.Name === 'CityFieldNameParam');
        const stateProvinceFieldNameParam: ActionParam | undefined = params.Params.find(p => p.Name === 'StateProvinceFieldNameParam');
        const postalCodeFieldNameParam: ActionParam | undefined = params.Params.find(p => p.Name === 'PostalCodeFieldName');
        const descriptionFieldNameParam: ActionParam | undefined = params.Params.find(p => p.Name === 'DescriptionFieldName');
        const phoneNumberFieldNameParam: ActionParam | undefined = params.Params.find(p => p.Name === 'PhoneNumberFieldName');
        const countryFieldNameParam: ActionParam | undefined = params.Params.find(p => p.Name === 'CountryFieldName');
        const linkedInFieldNameParam: ActionParam | undefined = params.Params.find(p => p.Name === 'LinkedInFieldName');
        const logoURLFieldNameParam: ActionParam | undefined = params.Params.find(p => p.Name === 'LogoURLFieldName');
        const facebookFieldNameParam: ActionParam | undefined = params.Params.find(p => p.Name === 'FacebookFieldName');
        const twitterFieldNameParam: ActionParam | undefined = params.Params.find(p => p.Name === 'TwitterFieldName');

        const ContactEntityNameParam: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEntityName');
        const ContactEntityEmailFieldName: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEntityEmailFieldName');
        const ContactEntityAccountIDFieldName: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEntityAccountIDFieldName');
        const ContactEntityFirstNameFieldName: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEntityFirstNameFieldName');
        const ContactEntityActivityCountFieldName: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEntityActivityCountFieldName');
        const ContactEntityEmailSourceFieldName: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEntityEmailSourceFieldName');
        const ContactEntityLastNameFieldName: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEntityLastNameFieldName');
        const ContactEntityTitleFieldName: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEntityTitleFieldName');
        const ContactEntityFacebookFieldName: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEntityFacebookFieldName');
        const ContactEntityLinkedInFieldName: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEntityLinkedInFieldName');
        const ContactEntityTwitterFieldName: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEntityTwitterFieldName');
        const ContactEntityPhotoFieldName: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEntityPhotoFieldName');
        const ContactEntityLastEnrichedAtFieldName: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEntityLastEnrichedAtFieldName');
        
        const ContactEducationHistoryEntityName: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEducationHistoryEntityName');
        const ContactEducationHistoryEntityContactIDFieldName: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEducationHistoryEntityContactIDFieldName');
        const ContactEducationHistoryEntityInstitutionFieldName: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEducationHistoryEntityInstitutionFieldName');
        const ContactEducationHistoryEntityDegreeFieldName: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEducationHistoryEntityDegreeFieldName');
        const ContactEducationHistoryEntityGradeLevelFieldName: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEducationHistoryEntityGradeLevelFieldName');
        const ContactEducationHistoryEntityStartDateFieldName: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEducationHistoryEntityStartDateFieldName');
        const ContactEducationHistoryEntityEndDateFieldName: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEducationHistoryEntityEndDateFieldName');
        const ContactEducationHistoryEntityIsCurrentFieldName: ActionParam | undefined = params.Params.find(p => p.Name === 'ContactEducationHistoryEntityIsCurrentFieldName');

        if(!entityNameParam){
            throw new Error("EntityName parameter not found");
        }

        if(!domainFieldNameParam){
            throw new Error("DomainFieldName parameter not found");
        }

        if(!AccountIDFieldNameParam){
            throw new Error("AccountIDFieldName parameter not found");
        }

        if(!enrichedAtFieldNameParam){
            throw new Error("enrichedAtFieldName parameter not found");
        }

        if(!filterParam){
            throw new Error("filter parameter not found");
        }

        if(!ContactEntityNameParam){
            throw new Error("ContactEntityName parameter not found");
        }

        if(!ContactEntityEmailFieldName){
            throw new Error("ContactEntityEmailFieldName parameter not found");
        }

        if(!ContactEntityAccountIDFieldName){
            throw new Error("ContactEntityAccountIDFieldName parameter not found");
        }

        if(!ContactEntityFirstNameFieldName){
            throw new Error("ContactEntityFirstNameFieldName parameter not found");
        }

        if(!ContactEntityActivityCountFieldName){
            throw new Error("ContactEntityActivityCountFieldName parameter not found");
        }

        if(!ContactEntityEmailSourceFieldName){
            throw new Error("ContactEntityEmailSourceFieldName parameter not found");
        }

        if(!ContactEntityLastNameFieldName){
            throw new Error("ContactEntityLastNameFieldName parameter not found");
        }

        if(!ContactEntityTitleFieldName){
            throw new Error("ContactEntityTitleFieldName parameter not found");
        }

        if(!ContactEntityFacebookFieldName){
            throw new Error("ContactEntityFacebookFieldName parameter not found");
        }

        if(!ContactEntityLinkedInFieldName){
            throw new Error("ContactEntityLinkedInFieldName parameter not found");
        }

        if(!ContactEntityTwitterFieldName){
            throw new Error("ContactEntityTwitterFieldName parameter not found");
        }

        if(!ContactEntityPhotoFieldName){
            throw new Error("ContactEntityPhotoFieldName parameter not found");
        }

        if(!ContactEntityLastEnrichedAtFieldName){
            throw new Error("ContactEntityLastEnrichedAtFieldName parameter not found");
        }

        if(!ContactEducationHistoryEntityName){
            throw new Error("ContactEducationHistoryEntityName parameter not found");
        }

        if(!ContactEducationHistoryEntityContactIDFieldName){
            throw new Error("ContactEducationHistoryEntityContactIDFieldName parameter not found");
        }

        if(!ContactEducationHistoryEntityInstitutionFieldName){
            throw new Error("ContactEducationHistoryEntityInstitutionFieldName parameter not found");
        }

        if(!ContactEducationHistoryEntityDegreeFieldName){
            throw new Error("ContactEducationHistoryEntityDegreeFieldName parameter not found");
        }

        if(!ContactEducationHistoryEntityGradeLevelFieldName){
            throw new Error("ContactEducationHistoryEntityGradeLevelFieldName parameter not found");
        }

        if(!ContactEducationHistoryEntityStartDateFieldName){
            throw new Error("ContactEducationHistoryEntityStartDateFieldName parameter not found");
        }

        if(!ContactEducationHistoryEntityEndDateFieldName){
            throw new Error("ContactEducationHistoryEntityEndDateFieldName parameter not found");
        }

        if(!ContactEducationHistoryEntityIsCurrentFieldName){
            throw new Error("ContactEducationHistoryEntityIsCurrentFieldName parameter not found");
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

        const results: any[] = runViewResult.Results;
        const resultLength: number = runViewResult.Results.length;

        const tasks = [];  // to hold promises
        for(const [index, record] of results.entries()){
            const processParams: ProcessSingleDomainParams = {
                Record: record,
                EntityName: entityNameParam.Value,
                DomainParamName: domainFieldNameParam.Value,
                AccountIDName: AccountIDFieldNameParam.Value,
                EnrichedAtField: enrichedAtFieldNameParam.Value,
                CityFieldNameName: cityFieldNameParam ? cityFieldNameParam.Value : undefined,
                StateProvinceFieldName: stateProvinceFieldNameParam ? stateProvinceFieldNameParam.Value : undefined,
                PostalCodeFieldName: postalCodeFieldNameParam ? postalCodeFieldNameParam.Value : undefined,
                DescriptionFieldName: descriptionFieldNameParam ? descriptionFieldNameParam.Value : undefined,
                PhoneNumberFieldName: phoneNumberFieldNameParam ? phoneNumberFieldNameParam.Value : undefined,
                CountryFieldName: countryFieldNameParam ? countryFieldNameParam.Value : undefined,
                LinkedInFieldName: linkedInFieldNameParam ? linkedInFieldNameParam.Value : undefined,
                LogoURLFieldName: logoURLFieldNameParam ? logoURLFieldNameParam.Value : undefined,
                FacebookFieldName: facebookFieldNameParam ? facebookFieldNameParam.Value : undefined,
                TwitterFieldName: twitterFieldNameParam ? twitterFieldNameParam.Value : undefined,
                AddressFieldName: addressFieldNameParam ? addressFieldNameParam.Value : undefined,
                ContactEntityName: ContactEntityNameParam.Value,
                ContactEntityEmailFieldName: ContactEntityEmailFieldName.Value,
                ContactEntityAccountIDFieldName: ContactEntityAccountIDFieldName.Value,
                ContactEntityFirstNameFieldName: ContactEntityFirstNameFieldName.Value,
                ContactEntityActivityCountFieldName: ContactEntityActivityCountFieldName.Value,
                ContactEntityEmailSourceFieldName: ContactEntityEmailSourceFieldName.Value,
                ContactEntityLastNameFieldName: ContactEntityLastNameFieldName.Value,
                ContactEntityTitleFieldName: ContactEntityTitleFieldName.Value,
                ContactEntityFacebookFieldName: ContactEntityFacebookFieldName.Value,
                ContactEntityLinkedInFieldName: ContactEntityLinkedInFieldName.Value,
                ContactEntityTwitterFieldName: ContactEntityTwitterFieldName.Value,
                ContactEntityPhotoFieldName: ContactEntityPhotoFieldName.Value,
                ContactEntityLastEnrichedAtFieldName: ContactEntityLastEnrichedAtFieldName.Value,
                ContactEducationHistoryEntityName: ContactEducationHistoryEntityName.Value,
                ContactEducationHistoryEntityContactIDFieldName: ContactEducationHistoryEntityContactIDFieldName.Value,
                ContactEducationHistoryEntityInstitutionFieldName: ContactEducationHistoryEntityInstitutionFieldName.Value,
                ContactEducationHistoryEntityDegreeFieldName: ContactEducationHistoryEntityDegreeFieldName.Value,
                ContactEducationHistoryEntityGradeLevelFieldName: ContactEducationHistoryEntityGradeLevelFieldName.Value,
                ContactEducationHistoryEntityStartDateFieldName: ContactEducationHistoryEntityStartDateFieldName.Value,
                ContactEducationHistoryEntityEndDateFieldName: ContactEducationHistoryEntityEndDateFieldName.Value,
                ContactEducationHistoryEntityIsCurrentFieldName: ContactEducationHistoryEntityIsCurrentFieldName.Value,
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
        const accountID = record[params.AccountIDName];
        const domain = record[params.DomainParamName];

        const enrichOrganizationResult: boolean = await this.EnrichOrganization(params, startRow, totalRows, md, currentUser);
        const createAndEnrichPeopleResult: boolean = await this.CreateAndEnrichPeople(params, accountID, domain, startRow, md, currentUser);
        
        return enrichOrganizationResult && createAndEnrichPeopleResult;
    }

    protected async EnrichOrganization(params: ProcessSingleDomainParams, startRow: number, totalRows: number, md: Metadata, currentUser: UserInfo): Promise<boolean> {

            const record: Record<string, any> = params.Record;
            const orgQueryString = {
                api_key: process.env.APOLLO_API_KEY,
                domain: record[params.DomainParamName]
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
                const accountEntity: BaseEntity = await md.GetEntityObject(params.EntityName, currentUser);
                accountEntity.SetMany(record);
                if(params.AddressFieldName){
                    accountEntity.Set(params.AddressFieldName, organization.street_address);
                }

                if(params.CityFieldNameName){
                    accountEntity.Set(params.CityFieldNameName, organization.city);
                }

                if(params.CityFieldNameName){
                    accountEntity.Set(params.CityFieldNameName, organization.city);
                }

                if(params.StateProvinceFieldName){
                    //accountEntity.Set(params.StateProvinceFieldName, organization.state);
                }

                if(params.PostalCodeFieldName){
                    accountEntity.Set(params.PostalCodeFieldName, organization.postal_code);
                }

                if(params.DescriptionFieldName){
                    accountEntity.Set(params.DescriptionFieldName, organization.short_description);
                }

                if(params.PhoneNumberFieldName){
                    accountEntity.Set(params.PhoneNumberFieldName, organization.phone);
                }

                if(params.CountryFieldName){
                    accountEntity.Set(params.CountryFieldName, organization.country);
                }

                if(params.LinkedInFieldName){
                    accountEntity.Set(params.LinkedInFieldName, organization.linkedin_url);
                }

                if(params.LogoURLFieldName){
                    accountEntity.Set(params.LogoURLFieldName, organization.logo_url);
                }

                if(params.FacebookFieldName){
                    accountEntity.Set(params.FacebookFieldName, organization.facebook_url);
                }

                if(params.TwitterFieldName){
                    accountEntity.Set(params.TwitterFieldName, organization.twitter_url);
                }

                if(params.EnrichedAtField){
                    accountEntity.Set(params.EnrichedAtField, new Date());
                }

                // no field for twitter, add this mapping when that's done
                //accountEntity.Twitter = result.organization.twitter_url;
                const saveResult: boolean = await accountEntity.Save();
                if(!saveResult){
                    LogError('Error updating account record with enriched data', undefined, accountEntity.LatestResult);
                }

                // now, attempt to create technology records for linking to the account
                const accountID: string | number = record[params.AccountIDName];
                //bSuccess = bSuccess && await this.CreateAccountTechnologyRecords(accountID, result.organization.current_technologies, md, currentUser);

                return bSuccess;
            }
            else {
                // missing records == details.length means no matches were found
                LogStatus(`  > No matches found for this domain: ${params.Record[params.DomainParamName]}`);

                // even though there was no match, we still update the LastEnrichedAt field on the account otherwise we'll keep on attempting to run this each
                // time this process goes through the list of accounts.
                const accountEntity: BaseEntity = await md.GetEntityObject<BaseEntity>('Accounts', currentUser);
                accountEntity.SetMany(params.Record);
                accountEntity.Set(params.EnrichedAtField, new Date());
                const saveResult = await accountEntity.Save();
                if(!saveResult){
                    LogError('Error updating account record with enriched data', undefined, accountEntity.LatestResult);
                }
                return saveResult;
            }
    }

    protected async CreateAccountTechnologyRecords(params: ProcessSingleDomainParams, accountID: string | number, technologies: TechnologyMap[], md: Metadata, currentUser: UserInfo): Promise<boolean> {
        /*
        try {
            let bSuccess: boolean = true;

            const rv: RunView = new RunView();
            const runViewResult = await rv.RunView({
                EntityName: `${params.AccountTechnologyEntityName}`,
                ExtraFilter: `${params.AccountTechnologyEntityAccountIDFieldName} = ${accountID}`
            }, currentUser);

            if(!runViewResult.Success){
                LogError('Error querying for existing Account Technologies', undefined, runViewResult.ErrorMessage);
                return false;
            }

            for(const technology of technologies){
                const categoryId: number = await this.GetOrCreateTechnologyCategoryId(technology.category, md, currentUser);
                const row = runViewResult.Results.find((r: any) => r.Category.trim().toLowerCase() === technology.category.trim().toLowerCase() && r.Technology.trim().toLowerCase() === technology.name.trim().toLowerCase());
                if(!row || row.length === 0){
                    const at = await md.GetEntityObject(params.AccountTechnologyEntityName, currentUser);
                    at.Set(params.AccountTechnologyEntityAccountIDFieldName, accountID);
                    at.Set(params.AccountTechnologyEntityTechnologyIDFieldName, await this.GetOrCreateTechnologyId(technology.name, categoryId, md, currentUser));
                    bSuccess = bSuccess && await at.Save();
                }
                else{
                    row.matchFound = true;
                }
            }

    
            const sqlExisting = `
                                SELECT 
                                    at.ID AccountTechnologyID,
                                    t.Category Category,
                                    t.Name Technology 
                                FROM 
                                    crm.vwAccountTechnologies at
                                INNER JOIN
                                    crm.vwTechnologies t
                                ON 
                                    at.TechnologyID = t.ID
                                WHERE 
                                    at.AccountID = ${accountID}`;
            const existingRows = await AppDataSource.query(sqlExisting);
            // we have an array of existing rows now we can reuse below to see if we have a given row
            // and at end we'll know if any of the rows in existingRows are NO LONGER in the technologies[] passed in
            // and we'll update those to have an EndedAt = NOW since they're not in use anymore per the data provider
            for (let t of technologies) {
                // check to see if there is an existing AccountTechnology record for this account and technology
                const categoryId: number = await getOrCreateTechnologyCategoryId(t.category, md, currentUser);
                const row = existingRows.find((r: any) => r.Category.trim().toLowerCase() === t.category.trim().toLowerCase() && 
                                                   r.Technology.trim().toLowerCase() === t.name.trim().toLowerCase());
                if (!row || row.length === 0) {
                    // no match, create a new record
                    const at = await md.GetEntityObject<AccountTechnologyEntity>('Account Technologies', currentUser);
                    at.AccountID = accountID;
                    at.TechnologyID = await getOrCreateTechnologyId(t.name, categoryId, md, currentUser);
                    bSuccess = bSuccess && await at.Save();
                }
                else 
                    // match, update the row to mark as matched
                    row.matchFound = true;
            }
    
            // finally, go through all the rows in existingRows, and for any that have matchFound === true, skip
            // but for rest update them to have their EndedAt = NOW
            for (let r of existingRows) {
                if (!r.matchFound) {
                    const at = await md.GetEntityObject<AccountTechnologyEntity>('Account Technologies', currentUser);
                    await at.Load(r.AccountTechnologyID);
                    at.EndedUseAt = new Date()
                    bSuccess = bSuccess && await at.Save();
                }
            }
            return bSuccess;
        }   
        catch (e) {
            LogError(e);
            return false;
        } 
        */
       return false;
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
            api_key: process.env.APOLLO_API_KEY,
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
        try {
            LogStatus(`Enriching contact for person: ${person.first_name} ${person.last_name}, accountID: ${accountID} (${sequence} of ${total})`);
            // first check to see if there is an existing contact record for this person
            const contact: BaseEntity | null = await this.GetOrCreateContact(params, accountID, person, md, currentUser);
            if(!contact){
                return false;
            }
    
            // now we have a contact entity object and we can enrich it. 
            contact.Set(params.ContactEntityFirstNameFieldName, person.first_name);
            contact.Set(params.ContactEntityLastNameFieldName, person.last_name);
            contact.Set(params.ContactEntityTitleFieldName, person.title);
            if (person.email){
                contact.Set(params.ContactEntityEmailFieldName, person.email);
            }

            contact.Set(params.ContactEntityFacebookFieldName, person.facebook_url);
            contact.Set(params.ContactEntityLinkedInFieldName, person.linkedin_url);
            contact.Set(params.ContactEntityTwitterFieldName, person.twitter_url);
            //contact.Set("PhoneNumber", person.?.length > 0 ? person.phone_numbers[0].raw_number : null;
            contact.Set(params.ContactEntityPhotoFieldName, person.photo_url);
            contact.Set(params.ContactEntityLastEnrichedAtFieldName, new Date());

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
        
        const rv: RunView = new RunView();
        const runViewResult = await rv.RunView({
            EntityName: params.ContactEntityName,
            ExtraFilter: `${params.ContactEntityEmailFieldName}  = '${this.EscapeSingleQuotes(person.email)}' AND ${params.ContactEntityAccountIDFieldName} <> ${accountID}`
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
            EntityName: params.ContactEntityName,
            ExtraFilter: `(${params.ContactEntityEmailFieldName} = '${this.EscapeSingleQuotes(person.email)}' OR (${params.ContactEntityFirstNameFieldName} = '${this.EscapeSingleQuotes(person.first_name)}' AND ${params.ContactEntityLastNameFieldName} = '${this.EscapeSingleQuotes(person.last_name)}')) AND
                        ${params.ContactEntityAccountIDFieldName} = ${accountID}` 
        }, currentUser);

        if(!contactsViewResult.Success){
            LogError('Error querying for existing Contacts', undefined, contactsViewResult.ErrorMessage);
            return null;
        }

        const contactEntity: BaseEntity = await md.GetEntityObject<BaseEntity>(params.ContactEntityName, currentUser);
        if(contactsViewResult.Results.length > 0){
            contactEntity.SetMany(contactsViewResult.Results[0]);
            contactEntity.Set(params.ContactEntityEmailFieldName, person.email);
        }
        else{
            LogStatus(`   > Creating new contact record for ${person.first_name} ${person.last_name}`);
            contactEntity.NewRecord();
            contactEntity.Set(params.ContactEntityEmailFieldName, person.email);
            contactEntity.Set(params.ContactEntityAccountIDFieldName, accountID);
            contactEntity.Set(params.ContactEntityActivityCountFieldName, 0);
            contactEntity.Set(params.ContactEntityEmailSourceFieldName, Config.EmailSourceName);
        }

        return contactEntity;
    }

    protected async CreateUpdateContactEmploymentAndEducationHistory(params: ProcessSingleDomainParams, contactID: number | string, person: SearchPeopleResponsePerson, md: Metadata, currentUser: UserInfo): Promise<boolean> {
        
        let bSuccess: boolean = true;
        const rv: RunView = new RunView();

        for(const history of person.employment_history){
            if(history.degree && history.degree.length > 0){
                const EHRunViewResult = await rv.RunView({
                    EntityName: params.ContactEducationHistoryEntityName,
                    ExtraFilter: `${params.ContactEducationHistoryEntityContactIDFieldName} = ${contactID} AND ${params.ContactEducationHistoryEntityInstitutionFieldName} = '${this.EscapeSingleQuotes(history.organization_name)}' AND ${params.ContactEducationHistoryEntityDegreeFieldName} = '${this.EscapeSingleQuotes(history.degree)}'`
                }, currentUser);

                if(!EHRunViewResult.Success){
                    LogError('Error querying for existing Employment History', undefined, EHRunViewResult.ErrorMessage);
                    bSuccess = false;
                }

                const historyEntity: BaseEntity = await md.GetEntityObject<BaseEntity>(params.ContactEducationHistoryEntityName, currentUser);
                if(EHRunViewResult.Results.length > 0){
                    historyEntity.SetMany(EHRunViewResult.Results[0]);
                }
                else{
                    historyEntity.NewRecord();
                    historyEntity.Set(params.ContactEducationHistoryEntityContactIDFieldName, contactID);
                }

                historyEntity.Set(params.ContactEducationHistoryEntityInstitutionFieldName, history.organization_name);
                historyEntity.Set(params.ContactEducationHistoryEntityDegreeFieldName, history.degree);
                historyEntity.Set(params.ContactEducationHistoryEntityGradeLevelFieldName, !isNaN(history.grade_level as any) ? parseInt(history.grade_level) : 0);
                
                if(this.IsValidDate(history.start_date)){
                    historyEntity.Set(params.ContactEducationHistoryEntityStartDateFieldName, new Date(history.start_date));
                }

                if(this.IsValidDate(history.end_date)){
                    historyEntity.Set(params.ContactEducationHistoryEntityEndDateFieldName, new Date(history.end_date));
                }

                historyEntity.Set(params.ContactEducationHistoryEntityIsCurrentFieldName, history.current);
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