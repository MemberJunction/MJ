import { BaseAction } from '@memberjunction/actions';
import { EscapeSQLString, RegisterClass } from '@memberjunction/global';
import { BaseEntity, CompositeKey, EntityInfo, IMetadataProvider, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import * as Config from './config';
import { AccountEntityFields, AccountTechnologyEntityFields, ContactEducationHistoryEntityFields, ContactEntityFields, OrganizationEnrichmentOrganization, ProcessSingleDomainParams, TechnologyCategoryEntityFields, TechnologyMap } from './generic/apollo.types';
import { IApolloRESTClient } from './generic/apollo-lists.types';
import { ApolloAuthError, ApolloRateLimitError } from './http/ApolloHttp';
import { ApolloRESTClient } from './lists/ApolloRESTClient';
import { ResolveApolloAPIKey } from './lists/credentials';
import { ApolloPeopleClient, ApolloPersonMatch, DomainOf } from './people/ApolloPeopleClient';

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
    /** Resolve the Apollo key from this company's credential; null means the environment key. */
    companyID: string | null;
}

/** The two Apollo clients one run uses: enrichment (header auth, bulk_match) and prospecting search. */
export interface ApolloAccountClients {
    People: ApolloPeopleClient;
    Search: IApolloRESTClient;
}

/** Everything one run needs, resolved once in InternalRunAction and threaded through. */
interface AccountRunContext {
    Clients: ApolloAccountClients;
    Md: IMetadataProvider;
    User: UserInfo;
    Params: AccountEnrichmentParams;
}

const MAX_EXECUTIONS = 5;
const SEARCH_PAGE_SIZE = 100;

/**
 * Apollo.io Account Enrichment Action
 *
 * Enriches account records with organization data (`organizations/enrich`), their technology
 * stack, and the people Apollo lists at the account's domain. People discovery is two steps:
 * `mixed_people/api_search` (free, obfuscated: ids, first names and titles only) and then a paid
 * `people/bulk_match` by id, ten at a time, for emails and profiles. Each matched person costs
 * one Apollo credit; a domain with no people costs nothing.
 *
 * Params: AccountEntityFieldMappings (required); ContactEntityFieldMappings,
 * AccountTechnologyEntityFieldMappings, TechnologyCategoryEntityFieldMappings,
 * ContactEducationHistoryEntityFieldMappings, CompanyID (optional).
 *
 * Result codes: SUCCESS, VALIDATION_ERROR, CONFIGURATION_ERROR, RATE_LIMIT_EXCEEDED, FAILED.
 */
@RegisterClass(BaseAction, 'ApolloEnrichmentAccountsAction')
export class ApolloEnrichmentAccountsAction extends BaseAction {
    /** Job titles to exclude when creating contact records (not decision-makers). */
    private readonly excludeTitles: string[] = ['member', 'student member', 'student', 'volunteer'];

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const parsed = this.extractAndValidateParameters(params);
        if (parsed.success === false) return parsed.error;

        let clients: ApolloAccountClients;
        try {
            const resolved = await this.CreateClients(parsed.data.companyID, params.ContextUser);
            if (!resolved) return Failure('CONFIGURATION_ERROR', 'Apollo.io API key not found in configuration');
            clients = resolved;
        } catch (error) {
            return Failure('CONFIGURATION_ERROR', MessageOf(error));
        }

        const ctx: AccountRunContext = { Clients: clients, Md: params.Provider ?? Metadata.Provider, User: params.ContextUser, Params: parsed.data };
        try {
            return await this.processAllAccountRecords(ctx, 1);
        } catch (error) {
            if (error instanceof ApolloRateLimitError) {
                return Failure('RATE_LIMIT_EXCEEDED', `Apollo.io rate limit (${error.Window}) reached; run again later.`);
            }
            if (error instanceof ApolloAuthError) return Failure('CONFIGURATION_ERROR', error.message);
            LogError('Unexpected error in ApolloAccountsEnrichmentAction', undefined, error);
            return Failure('FAILED', `Unexpected error: ${MessageOf(error)}`);
        }
    }

    /**
     * Resolve the key (company credential first, then `APOLLO_API_KEY`) and build both clients.
     * A protected seam so tests can substitute clients that never reach api.apollo.io.
     */
    protected async CreateClients(companyID: string | null, contextUser: UserInfo): Promise<ApolloAccountClients | null> {
        const key = await ResolveApolloAPIKey(companyID, contextUser);
        if (!key) return null;
        return { People: new ApolloPeopleClient(key.apiKey), Search: new ApolloRESTClient(key.apiKey) };
    }

    // ─── Parameters ──────────────────────────────────────────────────────────

    private extractAndValidateParameters(params: RunActionParams): { success: true; data: AccountEnrichmentParams } | { success: false; error: ActionResultSimple } {
        const accountEntityFieldsParam = this.getRequiredParam(params, 'AccountEntityFieldMappings');
        if (!accountEntityFieldsParam) {
            return { success: false, error: Failure('VALIDATION_ERROR', 'Missing required parameter: AccountEntityFieldMappings') };
        }
        let accountEntityFields: AccountEntityFields;
        try {
            accountEntityFields = this.parseJSONParam<AccountEntityFields>(accountEntityFieldsParam.Value);
            if (!accountEntityFields) throw new Error('Parsed AccountEntityFieldMappings is empty');
        } catch {
            return { success: false, error: Failure('VALIDATION_ERROR', 'Invalid AccountEntityFieldMappings parameter: must be valid JSON or object') };
        }
        const companyRaw = params.Params.find((p) => p.Name.trim().toLowerCase() === 'companyid')?.Value;
        return {
            success: true,
            data: {
                accountEntityFields,
                accountTechnologyEntityFields: this.parseOptionalJSONParam<AccountTechnologyEntityFields>(params, 'AccountTechnologyEntityFieldMappings'),
                technologyCategoryEntityFields: this.parseOptionalJSONParam<TechnologyCategoryEntityFields>(params, 'TechnologyCategoryEntityFieldMappings'),
                contactEntityFields: this.parseOptionalJSONParam<ContactEntityFields>(params, 'ContactEntityFieldMappings'),
                contactEducationHistoryEntityFields: this.parseOptionalJSONParam<ContactEducationHistoryEntityFields>(params, 'ContactEducationHistoryEntityFieldMappings'),
                companyID: typeof companyRaw === 'string' && companyRaw.trim().length > 0 && companyRaw !== 'null' ? companyRaw.trim() : null,
            },
        };
    }

    private getRequiredParam(params: RunActionParams, paramName: string): ActionParam | null {
        return params.Params.find((p) => p.Name === paramName) ?? null;
    }

    private parseOptionalJSONParam<T>(params: RunActionParams, paramName: string): T | null {
        const param = params.Params.find((p) => p.Name === paramName);
        if (!param || !param.Value) return null;
        try {
            return this.parseJSONParam<T>(param.Value) || null;
        } catch (error) {
            LogError(`Error parsing ${paramName}`, undefined, error);
            return null;
        }
    }

    /** A parameter value that may be a JSON string or an already-parsed object. */
    private parseJSONParam<T>(value: unknown): T {
        if (typeof value === 'object' && value !== null) return value as T;
        return JSON.parse(String(value)) as T;
    }

    // ─── Accounts ────────────────────────────────────────────────────────────

    /**
     * Processes every account the filter selects, re-running the query until it drains or
     * {@link MAX_EXECUTIONS} passes have run. The filter is expected to exclude stamped rows
     * (every processed account is stamped, matched or not).
     */
    private async processAllAccountRecords(ctx: AccountRunContext, executionCount: number): Promise<ActionResultSimple> {
        const rv = RunView.FromMetadataProvider(ctx.Md);
        const result = await rv.RunView<Record<string, unknown>>({ EntityName: ctx.Params.accountEntityFields.EntityName, ExtraFilter: ctx.Params.accountEntityFields.Filter }, ctx.User);
        if (!result.Success) return Failure('FAILED', result.ErrorMessage);
        if (result.Results.length === 0) {
            LogStatus('+++ Completed domain enrichment, no records left to process.');
            return { Success: true, Message: 'ApolloAccountsEnrichment executed successfully.', ResultCode: 'SUCCESS' };
        }
        if (executionCount > MAX_EXECUTIONS) {
            LogStatus(`+++ Reached maximum execution limit (${MAX_EXECUTIONS}), stopping to prevent infinite recursion.`);
            return { Success: true, Message: `ApolloAccountsEnrichment stopped after ${MAX_EXECUTIONS} executions to prevent infinite recursion. ${result.Results.length} records may remain unprocessed.`, ResultCode: 'SUCCESS' };
        }
        let failures = 0;
        for (const record of result.Results) {
            const ok = await this.ProcessSingleDomain(ctx, record);
            if (!ok) failures++;
        }
        if (failures > 0) return Failure('FAILED', `ApolloAccountsEnrichment finished with ${failures} of ${result.Results.length} accounts failing; see the log.`);
        LogStatus(`--- Checking for remaining records... (execution ${executionCount + 1}/${MAX_EXECUTIONS})`);
        return this.processAllAccountRecords(ctx, executionCount + 1);
    }

    /** Enriches one account and, when contacts are configured, the people at its domain. */
    protected async ProcessSingleDomain(ctx: AccountRunContext, record: Record<string, unknown>): Promise<boolean> {
        const p = ctx.Params;
        const params: ProcessSingleDomainParams = {
            Record: record,
            AccountEntity: p.accountEntityFields,
            AccountTechnologyEntity: p.accountTechnologyEntityFields ?? null,
            TechnologyCategoryEntity: p.technologyCategoryEntityFields ?? null,
            ContactEntity: p.contactEntityFields ?? null,
            ContactEducationHistoryEntity: p.contactEducationHistoryEntityFields ?? null,
        };
        const domain = StringOf(record[p.accountEntityFields.DomainField]);
        if (!domain) {
            LogStatus('  > Account has no domain; stamping it without a lookup');
            return this.updateAccountEnrichedTimestamp(params, record, ctx.Md, ctx.User);
        }
        const accountID = record[p.accountEntityFields.AccountIDField] as string | number;
        const enriched = await this.enrichOrganization(ctx, params, domain);
        const people = await this.createAndEnrichPeople(ctx, params, accountID, domain);
        return enriched && people;
    }

    /** `organizations/enrich` for the account's domain; a miss still stamps the account. */
    private async enrichOrganization(ctx: AccountRunContext, params: ProcessSingleDomainParams, domain: string): Promise<boolean> {
        const organization = await ctx.Clients.People.EnrichOrganization(domain);
        if (!organization) {
            LogStatus(`  > No matches found for this domain: ${domain}`);
            return this.updateAccountEnrichedTimestamp(params, params.Record, ctx.Md, ctx.User);
        }
        const saved = await this.updateAccountWithOrganizationData(organization, params, params.Record, ctx.Md, ctx.User);
        if (!saved || !params.AccountTechnologyEntity) return saved;
        const accountID = params.Record[params.AccountEntity.AccountIDField] as string | number;
        return this.CreateAccountTechnologyRecords(params, accountID, organization.current_technologies, ctx.Md, ctx.User);
    }

    /** Maps Apollo organization fields to the configured account entity fields and stamps the account. */
    private async updateAccountWithOrganizationData(organization: OrganizationEnrichmentOrganization, params: ProcessSingleDomainParams, record: Record<string, unknown>, md: IMetadataProvider, currentUser: UserInfo): Promise<boolean> {
        try {
            const a = params.AccountEntity;
            const accountEntity = await md.GetEntityObject<BaseEntity>(a.EntityName, CompositeKey.FromEntityRecord(EntityOf(md, a.EntityName), record), currentUser);
            this.setFieldIfExists(accountEntity, a.AddressField, organization.street_address);
            this.setFieldIfExists(accountEntity, a.CityField, organization.city);
            this.setFieldIfExists(accountEntity, a.StateProvinceField, organization.state);
            this.setFieldIfExists(accountEntity, a.PostalCodeField, organization.postal_code);
            this.setFieldIfExists(accountEntity, a.DescriptionField, organization.short_description);
            this.setFieldIfExists(accountEntity, a.PhoneNumberField, organization.phone);
            this.setFieldIfExists(accountEntity, a.CountryField, organization.country);
            this.setFieldIfExists(accountEntity, a.LinkedInField, organization.linkedin_url);
            this.setFieldIfExists(accountEntity, a.LogoURLField, organization.logo_url);
            this.setFieldIfExists(accountEntity, a.FacebookField, organization.facebook_url);
            this.setFieldIfExists(accountEntity, a.TwitterField, organization.twitter_url);
            accountEntity.Set(a.EnrichedAtField, new Date());
            const saveResult = await accountEntity.Save();
            if (!saveResult) LogError(`Error updating account record with enriched data: ${accountEntity.LatestResult?.CompleteMessage ?? 'no details'}`);
            return saveResult;
        } catch (error) {
            LogError('Error updating account with organization data', undefined, error);
            return false;
        }
    }

    /** Stamps the account's enrichment timestamp when Apollo had nothing, so it is not retried every run. */
    private async updateAccountEnrichedTimestamp(params: ProcessSingleDomainParams, record: Record<string, unknown>, md: IMetadataProvider, currentUser: UserInfo): Promise<boolean> {
        try {
            const a = params.AccountEntity;
            const accountEntity = await md.GetEntityObject<BaseEntity>(a.EntityName, CompositeKey.FromEntityRecord(EntityOf(md, a.EntityName), record), currentUser);
            accountEntity.Set(a.EnrichedAtField, new Date());
            const saveResult = await accountEntity.Save();
            if (!saveResult) LogError(`Error updating account record with enriched timestamp: ${accountEntity.LatestResult?.CompleteMessage ?? 'no details'}`);
            return saveResult;
        } catch (error) {
            LogError('Error updating account enriched timestamp', undefined, error);
            return false;
        }
    }

    /** Sets a field when the mapping names it and the value is present. */
    private setFieldIfExists(entity: BaseEntity, fieldName: string | undefined, value: unknown): void {
        if (fieldName && value !== null && value !== undefined) entity.Set(fieldName, value);
    }

    // ─── Technologies ────────────────────────────────────────────────────────

    /**
     * Creates account-technology rows for technologies Apollo reports and marks the rows for
     * technologies it no longer reports as ended. Every save runs; a failure is counted, never
     * allowed to skip the rows after it.
     */
    protected async CreateAccountTechnologyRecords(params: ProcessSingleDomainParams, accountID: string | number, technologies: TechnologyMap[], md: IMetadataProvider, currentUser: UserInfo): Promise<boolean> {
        const ATEntity = params.AccountTechnologyEntity;
        if (!ATEntity || !technologies || technologies.length === 0) return true;
        if (!ATEntity.TechnologyIDField || !ATEntity.TechnologyField || !ATEntity.CategoryField) return true;
        try {
            const rv = RunView.FromMetadataProvider(md);
            const existing = await rv.RunView<Record<string, unknown>>({ EntityName: ATEntity.EntityName, ExtraFilter: FieldPredicate(md, ATEntity.EntityName, ATEntity.AccountIDField, accountID) }, currentUser);
            if (!existing.Success) {
                LogError(`Error querying for existing Account Technologies: ${existing.ErrorMessage}`);
                return false;
            }
            const matched = new Set<Record<string, unknown>>();
            let bSuccess = true;
            for (const technology of technologies) {
                const row = existing.Results.find((r) => SameText(r[ATEntity.CategoryField], technology.category) && SameText(r[ATEntity.TechnologyField], technology.name));
                if (row) {
                    matched.add(row);
                    continue;
                }
                const categoryId = await this.getOrCreateTechnologyCategoryId(params, technology.category, md, currentUser);
                const at = await md.GetEntityObject<BaseEntity>(ATEntity.EntityName, currentUser);
                at.NewRecord();
                at.Set(ATEntity.AccountIDField, accountID);
                at.Set(ATEntity.TechnologyIDField, await this.getOrCreateTechnologyId(technology.name, categoryId, md, currentUser));
                const saved = await at.Save();
                if (!saved) LogError(`Error creating Account Technology record: ${at.LatestResult?.CompleteMessage ?? 'no details'}`);
                bSuccess = bSuccess && saved;
            }
            const ended = await this.endUnmatchedTechnologies(ATEntity, existing.Results.filter((r) => !matched.has(r)), md, currentUser);
            return bSuccess && ended;
        } catch (error) {
            LogError('Error creating account technology records', undefined, error);
            return false;
        }
    }

    private async endUnmatchedTechnologies(ATEntity: AccountTechnologyEntityFields, rows: Record<string, unknown>[], md: IMetadataProvider, currentUser: UserInfo): Promise<boolean> {
        let bSuccess = true;
        for (const record of rows) {
            const entity = await md.GetEntityObject<BaseEntity>(ATEntity.EntityName, CompositeKey.FromEntityRecord(EntityOf(md, ATEntity.EntityName), record), currentUser);
            entity.Set(ATEntity.EndedUseAtField, new Date());
            const saved = await entity.Save();
            if (!saved) LogError(`Error updating Account Technology record: ${entity.LatestResult?.CompleteMessage ?? 'no details'}`);
            bSuccess = bSuccess && saved;
        }
        return bSuccess;
    }

    /** The configured category entity's key for a category name, creating the row when absent. 0 on error. */
    private async getOrCreateTechnologyCategoryId(params: ProcessSingleDomainParams, categoryName: string, md: IMetadataProvider, currentUser: UserInfo): Promise<number | string> {
        const TCEntity = params.TechnologyCategoryEntity;
        if (!TCEntity) return 0;
        try {
            const rv = RunView.FromMetadataProvider(md);
            const existing = await rv.RunView<Record<string, unknown>>({ EntityName: TCEntity.EntityName, ExtraFilter: `[${TCEntity.NameField}] = '${EscapeSQLString(categoryName)}'` }, currentUser);
            if (!existing.Success) {
                LogError(`Error querying for existing Technology Categories: ${existing.ErrorMessage}`);
                return 0;
            }
            if (existing.Results.length > 0) return existing.Results[0][TCEntity.IDField] as number | string;
            const entity = await md.GetEntityObject<BaseEntity>(TCEntity.EntityName, currentUser);
            entity.NewRecord();
            entity.Set(TCEntity.NameField, categoryName);
            if (!(await entity.Save())) {
                LogError(`Error creating new Technology Category record: ${entity.LatestResult?.CompleteMessage ?? 'no details'}`);
                return 0;
            }
            return entity.Get(TCEntity.IDField) as number | string;
        } catch (error) {
            LogError('Error getting or creating technology category', undefined, error);
            return 0;
        }
    }

    /** The `Technologies` entity's key for a name within a category, creating the row when absent. 0 on error. */
    private async getOrCreateTechnologyId(name: string, categoryId: number | string, md: IMetadataProvider, currentUser: UserInfo): Promise<number | string> {
        try {
            const info = EntityOf(md, 'Technologies');
            const rv = RunView.FromMetadataProvider(md);
            const existing = await rv.RunView<Record<string, unknown>>({ EntityName: 'Technologies', ExtraFilter: `[Name] = '${EscapeSQLString(name)}' AND ${FieldPredicate(md, 'Technologies', 'CategoryID', categoryId)}` }, currentUser);
            if (!existing.Success) {
                LogError(`Error querying for existing Technologies: ${existing.ErrorMessage}`);
                return 0;
            }
            const pkName = info.FirstPrimaryKey.Name; // first-pk-ok: Technologies is a single-key MJ entity; the value is returned for a single FK column
            if (existing.Results.length > 0) return existing.Results[0][pkName] as number | string;
            const technologyEntity = await md.GetEntityObject<BaseEntity>('Technologies', currentUser);
            technologyEntity.NewRecord();
            technologyEntity.Set('Name', name);
            technologyEntity.Set('CategoryID', categoryId);
            if (!(await technologyEntity.Save())) {
                LogError(`Error creating new Technology record: ${technologyEntity.LatestResult?.CompleteMessage ?? 'no details'}`);
                return 0;
            }
            return technologyEntity.Get(pkName) as number | string;
        } catch (error) {
            LogError('Error getting or creating technology', undefined, error);
            return 0;
        }
    }

    // ─── People ──────────────────────────────────────────────────────────────

    /**
     * Discovers the people Apollo lists at the domain (free search, ids only), then matches them
     * ten at a time by id (one credit per match) and creates or updates a contact for each.
     */
    private async createAndEnrichPeople(ctx: AccountRunContext, params: ProcessSingleDomainParams, accountID: string | number, domain: string): Promise<boolean> {
        if (!params.ContactEntity) return true;
        const ids = await this.discoverPeopleIDs(ctx, domain);
        if (ids.length === 0) {
            LogStatus(`No people found for this domain: ${domain}`);
            return true;
        }
        let bSuccess = true;
        let sequence = 0;
        for (let i = 0; i < ids.length; i += ApolloPeopleClient.MaxBatchSize) {
            const group = ids.slice(i, i + ApolloPeopleClient.MaxBatchSize);
            const result = await ctx.Clients.People.BulkMatch(group.map((id) => ({ Key: id, ApolloPersonID: id })), { RevealPersonalEmails: true });
            for (const match of result.Matches) {
                sequence++;
                if (this.shouldSkipPerson(match, domain)) continue;
                const ok = await this.createAndEnrichContact(ctx, params, accountID, match, sequence, ids.length);
                bSuccess = bSuccess && ok;
            }
        }
        return bSuccess;
    }

    /** Apollo ids of the people at the domain, from `api_search`, up to `MaxPeopleToEnrichPerOrg`. */
    private async discoverPeopleIDs(ctx: AccountRunContext, domain: string): Promise<string[]> {
        const ids: string[] = [];
        const maxPages = Math.max(1, Math.ceil(Config.MaxPeopleToEnrichPerOrg / SEARCH_PAGE_SIZE));
        for (let page = 1; page <= maxPages; page++) {
            const result = await ctx.Clients.Search.searchPeople({ organizationDomains: [domain] }, { page, perPage: SEARCH_PAGE_SIZE });
            for (const person of result.people) {
                if (person.id && ids.length < Config.MaxPeopleToEnrichPerOrg) ids.push(person.id);
            }
            if (result.people.length < SEARCH_PAGE_SIZE || page >= result.pagination.totalPages || ids.length >= Config.MaxPeopleToEnrichPerOrg) break;
        }
        return ids;
    }

    /** Skips a miss, a person with no last name or email, an email outside the domain, and an excluded title. */
    private shouldSkipPerson(match: ApolloPersonMatch, domain: string): boolean {
        if (!match.Matched || !match.LastName || !match.Email || DomainOf(match.Email.split('@')[1]) !== domain.toLowerCase()) {
            LogStatus(`Skipping person: ${match.FirstName ?? ''} ${match.LastName ?? ''} because email is missing or does not match domain`);
            return true;
        }
        if (this.IsExcludedTitle(match.Title ?? '')) {
            LogStatus(`Skipping person: ${match.FirstName} ${match.LastName} because title is excluded`);
            return true;
        }
        return false;
    }

    /** Creates or updates one contact and, when configured, its education history. */
    private async createAndEnrichContact(ctx: AccountRunContext, params: ProcessSingleDomainParams, accountID: string | number, match: ApolloPersonMatch, sequence: number, total: number): Promise<boolean> {
        const CEntity = params.ContactEntity;
        if (!CEntity) return false;
        try {
            LogStatus(`Enriching contact for person: ${match.FirstName} ${match.LastName}, accountID: ${accountID} (${sequence} of ${total})`);
            const contact = await this.getOrCreateContact(ctx, params, accountID, match);
            if (!contact) return false;
            this.updateContactFields(contact, match, CEntity);
            const saved = await contact.Save();
            if (!saved) {
                LogError(`Error updating contact record with enriched data: ${contact.LatestResult?.CompleteMessage ?? 'no details'}`);
                return false;
            }
            if (!params.ContactEducationHistoryEntity) return true;
            return this.createUpdateContactEducationHistory(ctx, params, contact, match);
        } catch (error) {
            if (error instanceof ApolloRateLimitError || error instanceof ApolloAuthError) throw error;
            LogError('Error creating and enriching contact', undefined, error);
            return false;
        }
    }

    private updateContactFields(contact: BaseEntity, match: ApolloPersonMatch, CEntity: ContactEntityFields): void {
        contact.Set(CEntity.FirstNameField, match.FirstName);
        contact.Set(CEntity.LastNameField, match.LastName);
        contact.Set(CEntity.TitleField, match.Title);
        if (match.Email) contact.Set(CEntity.EmailField, match.Email);
        this.setFieldIfExists(contact, CEntity.FacebookField, match.FacebookURL);
        this.setFieldIfExists(contact, CEntity.LinkedInField, match.LinkedInURL);
        this.setFieldIfExists(contact, CEntity.TwitterField, match.TwitterURL);
        this.setFieldIfExists(contact, CEntity.ProfilePictureURLField, match.PhotoURL);
        contact.Set(CEntity.EnrichedAtField, new Date());
    }

    /**
     * The existing contact for this account (by email, or by first and last name), or a new one.
     * Null when the person is already a contact of a different account, or on a lookup error.
     */
    private async getOrCreateContact(ctx: AccountRunContext, params: ProcessSingleDomainParams, accountID: string | number, match: ApolloPersonMatch): Promise<BaseEntity | null> {
        const CEntity = params.ContactEntity;
        if (!CEntity) return null;
        const md = ctx.Md;
        const rv = RunView.FromMetadataProvider(md);
        const email = `[${CEntity.EmailField}] = '${EscapeSQLString(match.Email ?? '')}'`;
        const conflict = await rv.RunView<Record<string, unknown>>({ EntityName: CEntity.EntityName, ExtraFilter: `${email} AND ${FieldPredicate(md, CEntity.EntityName, CEntity.AccountIDField, accountID, '<>')}` }, ctx.User);
        if (!conflict.Success) {
            LogError(`Error querying for existing Contacts: ${conflict.ErrorMessage}`);
            return null;
        }
        if (conflict.Results.length > 0) {
            LogError(`*** SKIPPING new contact record for ${match.FirstName} ${match.LastName} because they are already associated with another account (${CEntity.AccountIDField}: ${String(conflict.Results[0][CEntity.AccountIDField])})`);
            return null;
        }
        const byName = `([${CEntity.FirstNameField}] = '${EscapeSQLString(match.FirstName ?? '')}' AND [${CEntity.LastNameField}] = '${EscapeSQLString(match.LastName ?? '')}')`;
        const existing = await rv.RunView<Record<string, unknown>>({ EntityName: CEntity.EntityName, ExtraFilter: `(${email} OR ${byName}) AND ${FieldPredicate(md, CEntity.EntityName, CEntity.AccountIDField, accountID)}` }, ctx.User);
        if (!existing.Success) {
            LogError(`Error querying for existing Contacts: ${existing.ErrorMessage}`);
            return null;
        }
        if (existing.Results.length > 0) {
            return md.GetEntityObject<BaseEntity>(CEntity.EntityName, CompositeKey.FromEntityRecord(EntityOf(md, CEntity.EntityName), existing.Results[0]), ctx.User);
        }
        LogStatus(`   > Creating new contact record for ${match.FirstName} ${match.LastName}`);
        const contactEntity = await md.GetEntityObject<BaseEntity>(CEntity.EntityName, ctx.User);
        contactEntity.NewRecord();
        contactEntity.Set(CEntity.AccountIDField, accountID);
        contactEntity.Set(CEntity.ActivityCountField, 0);
        contactEntity.Set(CEntity.EmailSourceField, Config.EmailSourceName);
        return contactEntity;
    }

    /** Writes the match's education entries to the configured education history entity. */
    private async createUpdateContactEducationHistory(ctx: AccountRunContext, params: ProcessSingleDomainParams, contact: BaseEntity, match: ApolloPersonMatch): Promise<boolean> {
        const CEntity = params.ContactEducationHistoryEntity;
        if (!CEntity || match.Education.length === 0) return true;
        if (contact.PrimaryKeys.length !== 1) {
            LogError(`Unable to write education history: entity '${contact.EntityInfo.Name}' has a composite primary key, which a single foreign key column cannot reference`);
            return false;
        }
        const contactID = contact.FirstPrimaryKey.Value; // first-pk-ok: FK target — the education entity's contact FK column references the contact's single-column key (guarded above)
        const md = ctx.Md;
        const rv = RunView.FromMetadataProvider(md);
        let bSuccess = true;
        for (const history of match.Education) {
            const filter = `${FieldPredicate(md, CEntity.EntityName, CEntity.ContactIDField, contactID)} AND [${CEntity.InstitutionField}] = '${EscapeSQLString(history.InstitutionName)}' AND [${CEntity.DegreeField}] = '${EscapeSQLString(history.Degree ?? '')}'`;
            const existing = await rv.RunView<Record<string, unknown>>({ EntityName: CEntity.EntityName, ExtraFilter: filter }, ctx.User);
            if (!existing.Success) {
                LogError(`Error querying for existing Education History: ${existing.ErrorMessage}`);
                bSuccess = false;
                continue;
            }
            const saved = await this.saveEducationRow(ctx, CEntity, contactID, history, existing.Results[0]);
            bSuccess = bSuccess && saved;
        }
        return bSuccess;
    }

    private async saveEducationRow(ctx: AccountRunContext, CEntity: ContactEducationHistoryEntityFields, contactID: unknown, history: ApolloPersonMatch['Education'][number], existingRow: Record<string, unknown> | undefined): Promise<boolean> {
        const md = ctx.Md;
        let row: BaseEntity;
        if (existingRow) {
            row = await md.GetEntityObject<BaseEntity>(CEntity.EntityName, CompositeKey.FromEntityRecord(EntityOf(md, CEntity.EntityName), existingRow), ctx.User);
        } else {
            row = await md.GetEntityObject<BaseEntity>(CEntity.EntityName, ctx.User);
            row.NewRecord();
            row.Set(CEntity.ContactIDField, contactID);
        }
        row.Set(CEntity.InstitutionField, history.InstitutionName);
        row.Set(CEntity.DegreeField, history.Degree);
        const grade = history.GradeLevel !== null && !Number.isNaN(Number(history.GradeLevel)) ? Number.parseInt(history.GradeLevel, 10) : 0;
        this.setFieldIfExists(row, CEntity.GradeLevelField, grade);
        if (this.IsValidDate(history.StartDate ?? '')) this.setFieldIfExists(row, CEntity.StartDateField, new Date(history.StartDate as string));
        if (this.IsValidDate(history.EndDate ?? '')) this.setFieldIfExists(row, CEntity.EndDateField, new Date(history.EndDate as string));
        this.setFieldIfExists(row, CEntity.IsCurrentField, history.EndDate === null);
        const saved = await row.Save();
        if (!saved) LogError(`Error saving Education History record: ${row.LatestResult?.CompleteMessage ?? 'no details'}`);
        return saved;
    }

    // ─── Small helpers ───────────────────────────────────────────────────────

    /** True when the string parses as a date. */
    protected IsValidDate(dateString: string): boolean {
        if (dateString && dateString.length > 0) {
            const date = new Date(dateString);
            return !Number.isNaN(date.getTime());
        }
        return false;
    }

    /** True for titles that are not decision-makers (members, students, volunteers). */
    protected IsExcludedTitle(title: string): boolean {
        if (!title) return false;
        return this.excludeTitles.includes(title.trim().toLowerCase());
    }
}

// ─── Module helpers ──────────────────────────────────────────────────────────

function Failure(code: string, message: string): ActionResultSimple {
    return { Success: false, Message: message, ResultCode: code };
}

function MessageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function StringOf(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function SameText(a: unknown, b: string): boolean {
    return typeof a === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();
}

function EntityOf(md: IMetadataProvider, entityName: string): EntityInfo {
    const info = md.EntityByName(entityName);
    if (!info) throw new Error(`Entity '${entityName}' was not found`);
    return info;
}

/**
 * `[field] <op> <literal>` with the literal quoted per the column's type, so a UUID or string key
 * is quoted and an integer key is not. An unknown column is treated as needing quotes.
 */
export function FieldPredicate(md: IMetadataProvider, entityName: string, fieldName: string, value: unknown, op: '=' | '<>' = '='): string {
    const field = md.EntityByName(entityName)?.Fields.find((f) => f.Name.toLowerCase() === fieldName.toLowerCase());
    const needsQuotes = field ? field.NeedsQuotes : typeof value !== 'number';
    const literal = needsQuotes ? `'${EscapeSQLString(String(value))}'` : String(value);
    return `[${fieldName}] ${op} ${literal}`;
}
