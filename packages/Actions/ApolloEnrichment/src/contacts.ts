import { BaseAction } from '@memberjunction/actions';
import { EscapeSQLString, RegisterClass } from '@memberjunction/global';
import { BaseEntity, CompositeKey, EntityInfo, IMetadataProvider, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import * as Config from './config';
import { ApolloAuthError, ApolloRateLimitError } from './http/ApolloHttp';
import { ApolloEducationEntry, ApolloEmploymentEntry, ApolloPeopleClient, ApolloPersonMatch, ApolloPersonMatchInput } from './people/ApolloPeopleClient';

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
    /** Resolve the Apollo key from this company's credential; null means the environment key. */
    CompanyID: string | null;
}

/**
 * Field mappings for the employment history entity (`EmploymentHistoryFieldMappings`).
 * Only the four required keys are written unconditionally; a date or current-flag column is
 * written only when its key is present, so nothing is ever set on a column that was not named.
 */
export interface EmploymentHistoryMapping {
    EntityName: string;
    ContactIDFieldName: string;
    OrganizationFieldName: string;
    TitleFieldName: string;
    StartDateFieldName?: string;
    EndDateFieldName?: string;
    IsCurrentFieldName?: string;
}

/** Field mappings for the education history entity (`EducationHistoryFieldMappings`). Same rule as employment. */
export interface EducationHistoryMapping {
    EntityName: string;
    ContactIDFieldName: string;
    InstitutionFieldName: string;
    DegreeFieldName: string;
    GradeLevelFieldName?: string;
    StartDateFieldName?: string;
    EndDateFieldName?: string;
}

/** Mappings for employment and education history entity fields; null when the param was not given or was incomplete. */
interface HistoryMappings {
    education: EducationHistoryMapping | null;
    employment: EmploymentHistoryMapping | null;
}

/** Everything one run needs, resolved once in InternalRunAction and threaded through. */
interface ContactRunContext {
    Client: ApolloPeopleClient;
    Md: IMetadataProvider;
    Entity: EntityInfo;
    User: UserInfo;
    Params: ContactEnrichmentParams;
    History: HistoryMappings;
    /** When the run started; composite-key paging re-reads rows stamped before this. */
    StartedAt: Date;
}

/** What happened, for the result message. */
interface ContactRunTally {
    Sent: number;
    Matched: number;
    Unmatched: number;
    /** Rows nothing identifies (no email, and not first + last name + an organization); stamped, not sent. */
    Unidentifiable: number;
    SaveFailures: number;
    GroupFailures: number;
    CreditsConsumed: number;
}

/** The single-column key of a contact, for the history entities' FK filters. */
interface ContactKey {
    Value: unknown;
    /** `ContactIDFieldName = <quoted value>` */
    Predicate: (fieldName: string) => string;
}

const PAGE_SIZE = 500;

/**
 * Apollo.io Contact Enrichment Action
 *
 * Enriches contact records with data from Apollo.io, including verified email addresses,
 * employment history, education details and social profiles. Records are read in pages
 * (keyset paging on a single-column key, see {@link processAllContactRecords}) and sent to
 * `people/bulk_match` ten at a time through {@link ApolloPeopleClient}.
 *
 * Every record sent to Apollo is stamped with `EnrichedAtField`, matched or not, so a filter
 * on that stamp never re-selects (and never pays for) the same miss twice.
 *
 * Params: EntityName, EmailField, FirstNameField, LastNameField, TitleField, EnrichedAtField,
 * Filter (required); ProfilePictureURLField, AccountNameField, DomainField, LinkedInField,
 * TwitterField, FacebookField, CompanyID, EmploymentHistoryFieldMappings,
 * EducationHistoryFieldMappings (optional). The mapping params take the keys of
 * {@link EmploymentHistoryMapping} and {@link EducationHistoryMapping}, as an object or a JSON string.
 *
 * Result codes: SUCCESS, VALIDATION_ERROR, CONFIGURATION_ERROR, RATE_LIMIT_EXCEEDED, FAILED.
 */
@RegisterClass(BaseAction, 'ApolloEnrichmentContactsAction')
export class ApolloEnrichmentContactsAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const parsed = this.extractAndValidateParameters(params);
        if (parsed.success === false) return parsed.error;
        const { actionParams, historyMappings } = parsed.data;

        const md = params.Provider ?? Metadata.Provider;
        const entity = md.EntityByName(actionParams.EntityName);
        if (!entity) return Failure('VALIDATION_ERROR', `Entity '${actionParams.EntityName}' was not found`);

        let client: ApolloPeopleClient;
        try {
            const resolved = await this.CreateClient(actionParams.CompanyID, params.ContextUser);
            if (!resolved) return Failure('CONFIGURATION_ERROR', 'Apollo.io API key not found in configuration');
            client = resolved;
        } catch (error) {
            return Failure('CONFIGURATION_ERROR', MessageOf(error));
        }

        const ctx: ContactRunContext = { Client: client, Md: md, Entity: entity, User: params.ContextUser, Params: actionParams, History: historyMappings, StartedAt: new Date() };
        const tally: ContactRunTally = { Sent: 0, Matched: 0, Unmatched: 0, Unidentifiable: 0, SaveFailures: 0, GroupFailures: 0, CreditsConsumed: 0 };
        try {
            await this.processAllContactRecords(ctx, tally);
        } catch (error) {
            return this.failureFor(error, tally);
        }
        const summary = Summarize(tally);
        if (tally.GroupFailures > 0 || tally.SaveFailures > 0) return Failure('FAILED', `ApolloContactsEnrichment finished with errors. ${summary}`);
        return { Success: true, Message: `ApolloContactsEnrichment executed successfully. ${summary}`, ResultCode: 'SUCCESS' };
    }

    /**
     * Resolve the key (company credential first, then `APOLLO_API_KEY`) and build the client.
     * A protected seam so tests can substitute a client that never reaches api.apollo.io.
     */
    protected async CreateClient(companyID: string | null, contextUser: UserInfo): Promise<ApolloPeopleClient | null> {
        const resolved = await ApolloPeopleClient.ForCompany(companyID, contextUser);
        return resolved ? resolved.Client : null;
    }

    private failureFor(error: unknown, tally: ContactRunTally): ActionResultSimple {
        const summary = Summarize(tally);
        if (error instanceof ApolloRateLimitError) {
            LogStatus(`ApolloContactsEnrichment stopped at Apollo's ${error.Window} rate limit. ${summary}`);
            return Failure('RATE_LIMIT_EXCEEDED', `Apollo.io rate limit (${error.Window}) reached; run again later. ${summary}`);
        }
        if (error instanceof ApolloAuthError) return Failure('CONFIGURATION_ERROR', `${error.message} ${summary}`);
        LogError('Unexpected error in ApolloContactsEnrichment', undefined, error);
        return Failure('FAILED', `Unexpected error: ${MessageOf(error)}. ${summary}`);
    }

    /**
     * Extracts and validates all action parameters from the request
     * Processes both required and optional parameters for contact enrichment
     */
    private extractAndValidateParameters(params: RunActionParams): { success: true; data: { actionParams: ContactEnrichmentParams; historyMappings: HistoryMappings } } | { success: false; error: ActionResultSimple } {
        const required = ['EntityName', 'EmailField', 'FirstNameField', 'LastNameField', 'TitleField', 'EnrichedAtField', 'Filter'];
        const values = new Map(required.map((name) => [name, StringOrNull(this.getParamValue(params, name))]));
        const missing = required.filter((name) => !values.get(name));
        if (missing.length > 0) {
            return { success: false, error: Failure('VALIDATION_ERROR', `Missing required parameters: ${missing.join(', ')}`) };
        }
        const optional = (name: string): string | undefined => StringOrNull(this.getParamValue(params, name)) ?? undefined;
        const actionParams: ContactEnrichmentParams = {
            EntityName: values.get('EntityName') as string,
            EmailField: values.get('EmailField') as string,
            FirstNameField: values.get('FirstNameField') as string,
            LastNameField: values.get('LastNameField') as string,
            TitleField: values.get('TitleField') as string,
            EnrichedAtField: values.get('EnrichedAtField') as string,
            Filter: values.get('Filter') as string,
            ProfilePictureURLField: optional('ProfilePictureURLField'),
            AccountNameField: optional('AccountNameField'),
            DomainField: optional('DomainField'),
            LinkedInField: optional('LinkedInField'),
            TwitterField: optional('TwitterField'),
            FacebookField: optional('FacebookField'),
            CompanyID: optional('CompanyID') ?? null,
        };
        const historyMappings: HistoryMappings = {
            employment: ParseEmploymentMapping(this.parseHistoryMappings(params, 'EmploymentHistoryFieldMappings')),
            education: ParseEducationMapping(this.parseHistoryMappings(params, 'EducationHistoryFieldMappings')),
        };
        return { success: true, data: { actionParams, historyMappings } };
    }

    /**
     * Extract parameter value by name (case-insensitive)
     * Handles special case where 'null' string should be treated as null value
     */
    protected getParamValue(params: RunActionParams, paramName: string): unknown {
        const param = params.Params.find((p) => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (param && param.Value === 'null') return null;
        return param?.Value;
    }

    /**
     * Parses JSON field mappings for employment/education history entities
     * Accepts an object or a JSON string; the param name is matched case-insensitively.
     */
    private parseHistoryMappings(params: RunActionParams, paramName: string): Record<string, unknown> {
        const value = this.getParamValue(params, paramName);
        if (typeof value === 'object' && value !== null) return value as Record<string, unknown>;
        if (typeof value === 'string' && value.trim().length > 0) {
            try {
                const parsed: unknown = JSON.parse(value);
                return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
            } catch (error) {
                LogError(`Error parsing ${paramName}`, undefined, error);
            }
        }
        return {};
    }

    // ─── Paging ──────────────────────────────────────────────────────────────

    /**
     * Reads every record the filter selects and processes it exactly once.
     *
     * A single-column key pages by keyset (`AfterKey`): each page starts after the last key of the
     * previous one, so stamping rows out of the filter as we go cannot skip anything. A composite
     * key cannot use `AfterKey`, so it re-reads the first page with an extra predicate that excludes
     * rows this run already stamped; rows that failed to save are remembered and skipped so a save
     * failure cannot loop.
     */
    private async processAllContactRecords(ctx: ContactRunContext, tally: ContactRunTally): Promise<void> {
        const keyset = ctx.Entity.PrimaryKeys.length === 1;
        const seen = new Set<string>();
        let afterKey: CompositeKey | null = null;
        for (;;) {
            const rows = await this.readPage(ctx, keyset, afterKey);
            const fresh = rows.filter((row) => !seen.has(RowKey(ctx.Entity, row)));
            if (fresh.length === 0) break;
            fresh.forEach((row) => seen.add(RowKey(ctx.Entity, row)));
            LogStatus(`Fetched ${fresh.length} records to enrich`);
            await this.processRecordGroups(ctx, fresh, tally);
            if (rows.length < PAGE_SIZE) break;
            if (keyset) afterKey = CompositeKey.FromEntityRecord(ctx.Entity, rows[rows.length - 1]);
        }
    }

    private async readPage(ctx: ContactRunContext, keyset: boolean, afterKey: CompositeKey | null): Promise<Record<string, unknown>[]> {
        const rv = RunView.FromMetadataProvider(ctx.Md);
        const orderBy = ctx.Entity.PrimaryKeys.map((pk) => `[${pk.Name}]`).join(', ');
        const stamp = ctx.Params.EnrichedAtField;
        const filter = keyset
            ? `(${ctx.Params.Filter})`
            : `(${ctx.Params.Filter}) AND ([${stamp}] IS NULL OR [${stamp}] < '${ctx.StartedAt.toISOString()}')`;
        const result = await rv.RunView<Record<string, unknown>>({
            EntityName: ctx.Params.EntityName,
            ExtraFilter: filter,
            OrderBy: orderBy,
            MaxRows: PAGE_SIZE,
            IgnoreMaxRows: true,
            ...(keyset && afterKey ? { AfterKey: afterKey } : {}),
        }, ctx.User);
        if (!result.Success) throw new Error(`Error querying entity '${ctx.Params.EntityName}': ${result.ErrorMessage}`);
        return result.Results;
    }

    /** Sends the rows to Apollo in groups of {@link ApolloPeopleClient.MaxBatchSize}, one group at a time. */
    private async processRecordGroups(ctx: ContactRunContext, rows: Record<string, unknown>[], tally: ContactRunTally): Promise<void> {
        const size = Math.min(Config.GroupSize, ApolloPeopleClient.MaxBatchSize);
        for (let i = 0; i < rows.length; i += size) {
            await this.ProcessPersonRecordGroup(ctx, rows.slice(i, i + size), tally);
        }
    }

    // ─── One group ───────────────────────────────────────────────────────────

    /**
     * Matches one group through `people/bulk_match` and writes every row of it. A row nothing
     * identifies is stamped and skipped before the call. A rate-limit or auth error stops the run
     * (it is rethrown); any other Apollo error fails this group only.
     */
    protected async ProcessPersonRecordGroup(ctx: ContactRunContext, rows: Record<string, unknown>[], tally: ContactRunTally): Promise<void> {
        const inputs: ApolloPersonMatchInput[] = [];
        const sendable: Record<string, unknown>[] = [];
        for (const [index, row] of rows.entries()) {
            const input = BuildMatchInput(ctx.Params, row, String(index));
            if (input) {
                inputs.push(input);
                sendable.push(row);
            } else {
                tally.Unidentifiable++;
                await this.writeContact(ctx, row, null, tally);
            }
        }
        if (inputs.length === 0) return;

        let matches: ApolloPersonMatch[];
        try {
            const result = await ctx.Client.BulkMatch(inputs, { RevealPersonalEmails: true });
            matches = result.Matches;
            tally.CreditsConsumed += result.CreditsConsumed;
        } catch (error) {
            if (error instanceof ApolloRateLimitError || error instanceof ApolloAuthError) throw error;
            LogError('Apollo.io bulk match failed for a group of contacts', undefined, error);
            tally.GroupFailures++;
            return;
        }
        tally.Sent += inputs.length;
        for (const [index, match] of matches.entries()) {
            await this.writeContact(ctx, sendable[index], match, tally);
        }
    }

    /**
     * Writes one contact: the matched fields when there is a match, and the `EnrichedAtField`
     * stamp either way. The save always runs; a failure is counted, never allowed to skip the
     * rows after it.
     */
    private async writeContact(ctx: ContactRunContext, row: Record<string, unknown>, match: ApolloPersonMatch | null, tally: ContactRunTally): Promise<void> {
        const contact = await ctx.Md.GetEntityObject<BaseEntity>(ctx.Params.EntityName, CompositeKey.FromEntityRecord(ctx.Entity, row), ctx.User);
        const matched = match?.Matched === true;
        if (match && matched) {
            ApplyMatch(contact, match, ctx.Params);
            tally.Matched++;
        } else if (match) {
            tally.Unmatched++;
        }
        contact.Set(ctx.Params.EnrichedAtField, new Date());
        const saved = await contact.Save();
        if (!saved) {
            LogError(`Error updating contact record with enriched data: ${contact.LatestResult?.CompleteMessage ?? 'no details'}`);
            tally.SaveFailures++;
            return;
        }
        if (match && matched) await this.UpsertContactHistory(ctx, contact, match, tally);
    }

    // ─── History ─────────────────────────────────────────────────────────────

    /**
     * Writes employment rows when `EmploymentHistoryFieldMappings` is configured and education rows
     * when `EducationHistoryFieldMappings` is, independently of each other. The history entities'
     * contact FK column references the contact's key, so that key must be a single column.
     */
    protected async UpsertContactHistory(ctx: ContactRunContext, contact: BaseEntity, match: ApolloPersonMatch, tally: ContactRunTally): Promise<void> {
        const { employment, education } = ctx.History;
        if (!employment && !education) return;
        const key = ContactKeyOf(contact);
        if (!key) {
            LogError(`Unable to upsert contact history: entity '${contact.EntityInfo.Name}' has a composite primary key, which a single foreign key column cannot reference`);
            return;
        }
        if (employment) {
            for (const entry of match.Employment) {
                const ok = await this.upsertEmployment(ctx, employment, key, entry);
                if (!ok) tally.SaveFailures++;
            }
        }
        if (education) {
            for (const entry of match.Education) {
                const ok = await this.upsertEducation(ctx, education, key, entry);
                if (!ok) tally.SaveFailures++;
            }
        }
    }

    private async upsertEmployment(ctx: ContactRunContext, m: EmploymentHistoryMapping, key: ContactKey, entry: ApolloEmploymentEntry): Promise<boolean> {
        const info = ctx.Md.EntityByName(m.EntityName);
        if (!info) {
            LogError(`Employment history entity '${m.EntityName}' was not found`);
            return false;
        }
        const organization = FitToColumn(info, m.OrganizationFieldName, entry.OrganizationName);
        const title = FitToColumn(info, m.TitleFieldName, entry.Title ?? '');
        const filter = `${key.Predicate(m.ContactIDFieldName)} AND [${m.OrganizationFieldName}] = '${EscapeSQLString(organization)}' AND [${m.TitleFieldName}] = '${EscapeSQLString(title)}'`;
        const row = await this.loadOrNewHistoryRow(ctx, m.EntityName, m.ContactIDFieldName, key, filter);
        if (!row) return false;
        row.Set(m.OrganizationFieldName, organization);
        row.Set(m.TitleFieldName, title);
        SetIfMapped(row, m.StartDateFieldName, ToDate(entry.StartDate));
        SetIfMapped(row, m.EndDateFieldName, ToDate(entry.EndDate));
        SetIfMapped(row, m.IsCurrentFieldName, entry.IsCurrent);
        return this.saveHistoryRow(row, 'employment');
    }

    private async upsertEducation(ctx: ContactRunContext, m: EducationHistoryMapping, key: ContactKey, entry: ApolloEducationEntry): Promise<boolean> {
        const info = ctx.Md.EntityByName(m.EntityName);
        if (!info) {
            LogError(`Education history entity '${m.EntityName}' was not found`);
            return false;
        }
        const institution = FitToColumn(info, m.InstitutionFieldName, entry.InstitutionName);
        const degree = FitToColumn(info, m.DegreeFieldName, entry.Degree ?? '');
        const filter = `${key.Predicate(m.ContactIDFieldName)} AND [${m.InstitutionFieldName}] = '${EscapeSQLString(institution)}' AND [${m.DegreeFieldName}] = '${EscapeSQLString(degree)}'`;
        const row = await this.loadOrNewHistoryRow(ctx, m.EntityName, m.ContactIDFieldName, key, filter);
        if (!row) return false;
        row.Set(m.InstitutionFieldName, institution);
        row.Set(m.DegreeFieldName, degree);
        SetIfMapped(row, m.GradeLevelFieldName, entry.GradeLevel);
        SetIfMapped(row, m.StartDateFieldName, ToDate(entry.StartDate));
        SetIfMapped(row, m.EndDateFieldName, ToDate(entry.EndDate));
        return this.saveHistoryRow(row, 'education');
    }

    /** The existing row the filter finds, or a new one keyed to the contact. Null when the lookup fails. */
    private async loadOrNewHistoryRow(ctx: ContactRunContext, entityName: string, contactIDField: string, key: ContactKey, filter: string): Promise<BaseEntity | null> {
        const rv = RunView.FromMetadataProvider(ctx.Md);
        const existing = await rv.RunView<Record<string, unknown>>({ EntityName: entityName, ExtraFilter: filter }, ctx.User);
        if (!existing.Success) {
            LogError(`Error querying history entity '${entityName}': ${existing.ErrorMessage}`);
            return null;
        }
        if (existing.Results.length > 0) {
            const info = ctx.Md.EntityByName(entityName) as EntityInfo;
            return ctx.Md.GetEntityObject<BaseEntity>(entityName, CompositeKey.FromEntityRecord(info, existing.Results[0]), ctx.User);
        }
        const row = await ctx.Md.GetEntityObject<BaseEntity>(entityName, ctx.User);
        row.NewRecord();
        row.Set(contactIDField, key.Value);
        return row;
    }

    private async saveHistoryRow(row: BaseEntity, kind: string): Promise<boolean> {
        const saved = await row.Save();
        if (!saved) LogError(`Error upserting contact ${kind} history: ${row.LatestResult?.CompleteMessage ?? 'no details'}`);
        return saved;
    }
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

function Failure(code: string, message: string): ActionResultSimple {
    return { Success: false, Message: message, ResultCode: code };
}

function MessageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function StringOrNull(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function Summarize(t: ContactRunTally): string {
    return `Sent ${t.Sent} to Apollo (${t.Matched} matched, ${t.Unmatched} not matched, ${t.CreditsConsumed} credits); ` +
        `${t.Unidentifiable} stamped without a lookup (nothing to match on); ${t.SaveFailures} save failures; ${t.GroupFailures} failed groups.`;
}

/** A string key for a row, from its real primary key column(s). */
function RowKey(entity: EntityInfo, row: Record<string, unknown>): string {
    return entity.PrimaryKeys.map((pk) => String(row[pk.Name])).join('|');
}

/**
 * The bulk_match `details` entry for a row, or null when the row carries nothing Apollo can
 * match on: an email, or a first and last name with a domain or an account name.
 */
export function BuildMatchInput(p: ContactEnrichmentParams, row: Record<string, unknown>, key: string): ApolloPersonMatchInput | null {
    const text = (field: string | undefined): string | undefined => (field ? StringOrNull(row[field]) ?? undefined : undefined);
    const input: ApolloPersonMatchInput = {
        Key: key,
        Email: text(p.EmailField),
        FirstName: text(p.FirstNameField),
        LastName: text(p.LastNameField),
        OrganizationDomain: text(p.DomainField),
        OrganizationName: text(p.AccountNameField),
    };
    const byName = !!input.FirstName && !!input.LastName && (!!input.OrganizationDomain || !!input.OrganizationName);
    return input.Email || byName ? input : null;
}

/** Copies the matched values onto the mapped columns. Values are stored as Apollo sent them. */
function ApplyMatch(contact: BaseEntity, match: ApolloPersonMatch, p: ContactEnrichmentParams): void {
    SetIfMapped(contact, p.EmailField, match.Email);
    SetIfMapped(contact, p.TitleField, match.Title);
    SetIfMapped(contact, p.AccountNameField, match.Organization?.Name ?? null);
    SetIfMapped(contact, p.ProfilePictureURLField, match.PhotoURL);
    SetIfMapped(contact, p.LinkedInField, match.LinkedInURL);
    SetIfMapped(contact, p.TwitterField, match.TwitterURL);
    SetIfMapped(contact, p.FacebookField, match.FacebookURL);
}

/** Sets a column only when it was mapped and the value is present. Never touches an unnamed column. */
function SetIfMapped(entity: BaseEntity, fieldName: string | undefined, value: unknown): void {
    if (fieldName && value !== null && value !== undefined && value !== '') entity.Set(fieldName, value);
}

/** Truncates to the column's declared length so a long vendor value fails nothing; unchanged when the length is unknown. */
export function FitToColumn(entity: EntityInfo, fieldName: string, value: string): string {
    const length = entity.Fields.find((f) => f.Name.toLowerCase() === fieldName.toLowerCase())?.Length ?? 0;
    return length > 0 && value.length > length ? value.slice(0, length) : value;
}

/** A `YYYY-MM-DD` string to a Date; null for anything that does not parse. */
export function ToDate(value: string | null): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The contact's single-column key and a predicate builder for the history FK filters, quoted
 * per the key column's type. Null for a composite key, which a single FK column cannot reference.
 */
export function ContactKeyOf(contact: BaseEntity): ContactKey | null {
    if (contact.PrimaryKeys.length !== 1) return null;
    const pk = contact.FirstPrimaryKey; // first-pk-ok: FK target — the history entities' contact FK column references the contact's single-column key (guarded above)
    const literal = pk.NeedsQuotes ? `'${EscapeSQLString(String(pk.Value))}'` : String(pk.Value);
    return { Value: pk.Value, Predicate: (fieldName) => `[${fieldName}] = ${literal}` };
}

function MappedString(raw: Record<string, unknown>, key: string): string | undefined {
    const entry = Object.entries(raw).find(([k]) => k.toLowerCase() === key.toLowerCase());
    return entry ? StringOrNull(entry[1]) ?? undefined : undefined;
}

export function ParseEmploymentMapping(raw: Record<string, unknown>): EmploymentHistoryMapping | null {
    const get = (key: string): string | undefined => MappedString(raw, key);
    const entityName = get('EntityName');
    const contactID = get('ContactIDFieldName');
    const organization = get('OrganizationFieldName');
    const title = get('TitleFieldName');
    if (!entityName || !contactID || !organization || !title) {
        if (Object.keys(raw).length > 0) LogStatus('EmploymentHistoryFieldMappings is missing EntityName, ContactIDFieldName, OrganizationFieldName or TitleFieldName; employment history will not be written');
        return null;
    }
    return { EntityName: entityName, ContactIDFieldName: contactID, OrganizationFieldName: organization, TitleFieldName: title, StartDateFieldName: get('StartDateFieldName'), EndDateFieldName: get('EndDateFieldName'), IsCurrentFieldName: get('IsCurrentFieldName') };
}

export function ParseEducationMapping(raw: Record<string, unknown>): EducationHistoryMapping | null {
    const get = (key: string): string | undefined => MappedString(raw, key);
    const entityName = get('EntityName');
    const contactID = get('ContactIDFieldName');
    const institution = get('InstitutionFieldName');
    const degree = get('DegreeFieldName');
    if (!entityName || !contactID || !institution || !degree) {
        if (Object.keys(raw).length > 0) LogStatus('EducationHistoryFieldMappings is missing EntityName, ContactIDFieldName, InstitutionFieldName or DegreeFieldName; education history will not be written');
        return null;
    }
    return { EntityName: entityName, ContactIDFieldName: contactID, InstitutionFieldName: institution, DegreeFieldName: degree, GradeLevelFieldName: get('GradeLevelFieldName'), StartDateFieldName: get('StartDateFieldName'), EndDateFieldName: get('EndDateFieldName') };
}
