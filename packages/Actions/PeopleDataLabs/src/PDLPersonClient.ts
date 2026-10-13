/**
 * A table-agnostic People Data Labs client: bulk person enrichment, person search, a size-1 count,
 * and the free school lookups. It fetches and returns normalized data and writes nothing. Only the
 * fields below are mapped; emails, phones, addresses and everything else PDL returns never leave
 * this module unless `IncludeRaw` is set for debugging.
 */
import { LogError, type UserInfo } from '@memberjunction/core';
import { DefaultMinLikelihood, PDLAPIEndpoint } from './config.js';
import { ResolvePDLAPIKey } from './credentials.js';
import type {
    PDLAutocompleteResponseRaw,
    PDLBulkItemRaw,
    PDLEducationRaw,
    PDLErrorBody,
    PDLExperienceRaw,
    PDLPersonRaw,
    PDLResponseHeaders,
    PDLSchoolCleanResponseRaw,
    PDLSearchResponseRaw,
} from './pdl.types.js';

export interface PDLPersonInput {
    /** Correlation key; common passes the Person ID. Echoed back by PDL as `metadata.key`. */
    Key: string;
    /** Exact re-match when known; sent as `pdl_id`. */
    PDLID?: string;
    Email?: string;
    /** Sent as PDL's `profile` param. */
    LinkedInURL?: string;
    FirstName?: string;
    LastName?: string;
    /** Employer name or domain. */
    Company?: string;
}

export interface PDLEducationEntry {
    SchoolName: string;
    SchoolID: string | null;
    Degrees: string[];
    Majors: string[];
    /** Normalized 'YYYY-MM-DD'. */
    StartDate: string | null;
    EndDate: string | null;
}

export interface PDLExperienceEntry {
    CompanyName: string;
    /** Host of `company.website`, normalized. */
    CompanyDomain: string | null;
    Title: string | null;
    StartDate: string | null;
    EndDate: string | null;
    IsCurrent: boolean;
}

export interface PDLPersonMatch {
    Key: string;
    Matched: boolean;
    PDLID: string | null;
    /** 1..10 */
    Likelihood: number | null;
    LinkedInURL: string | null;
    Education: PDLEducationEntry[];
    Experience: PDLExperienceEntry[];
    /** Set when this one item failed (non-200, non-404). */
    ErrorMessage: string | null;
    /** Only with IncludeRaw; never persist. */
    Raw?: Record<string, unknown>;
}

export interface PDLBulkOptions {
    /** Default 6, PDL's recommended value. Sent inside each request's `params`; at the request level PDL ignores it. */
    MinLikelihood?: number;
    /** e.g. 'education'. Accepted but not applied on every plan; never rely on it. */
    Required?: string;
    /** Not applied on every plan; the mapping above is the real minimization. */
    DataInclude?: string[];
    IncludeRaw?: boolean;
}

export interface PDLBulkResult {
    /** Same length and order as the input. */
    Matches: PDLPersonMatch[];
    /** From `x-call-credits-spent` when PDL sends it, else the count of per-item 200s. */
    CreditsConsumed: number;
}

/** A typed subset of PDL's Elasticsearch query. Built from clauses, so no value is ever spliced into query text. */
export type PDLQueryClause =
    | { term: Record<string, string> }
    | { terms: Record<string, string[]> }
    | { match: Record<string, string> }
    | { range: Record<string, { gte?: string; lte?: string }> }
    | PDLBoolQuery;

export interface PDLBoolQuery {
    bool: { must?: PDLQueryClause[]; should?: PDLQueryClause[]; minimum_should_match?: number }; // case-violation-ok-legacy-back-compat: Elasticsearch key
}

export interface PDLPersonSearchRequest {
    Query: PDLBoolQuery;
    /** 1..100 */
    Size: number;
    /** From the previous page. */
    ScrollToken?: string;
}

export interface PDLPersonSearchPage {
    /** PDL's total for the query. */
    Total: number;
    /** Normalized like BulkEnrich; Key = PDL person id, Matched = true. */
    People: PDLPersonMatch[];
    /** Null on the last page. */
    ScrollToken: string | null;
    /** Records returned, which is what PDL bills for a search. */
    CreditsConsumed: number;
}

export interface PDLSchoolSuggestion {
    Name: string;
    SchoolID: string | null;
    /** Autocomplete's per-suggestion count; null from the cleaner. */
    Count: number | null;
}

export interface PDLPersonClientOptions {
    /** Injected fetch, for tests. Tests must never reach api.peopledatalabs.com. */
    FetchImpl?: typeof fetch;
    BaseURL?: string;
}

export class PDLRateLimitError extends Error {
    public readonly RetryAfterSeconds: number | null;
    constructor(message: string, retryAfterSeconds: number | null) {
        super(message);
        this.name = 'PDLRateLimitError';
        this.RetryAfterSeconds = retryAfterSeconds;
    }
}
export class PDLCreditsExhaustedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PDLCreditsExhaustedError';
    }
}
export class PDLAuthError extends Error {
    public readonly Status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = 'PDLAuthError';
        this.Status = status;
    }
}
export class PDLRequestError extends Error {
    public readonly Status: number;
    public readonly Body: string;
    constructor(message: string, status: number, body: string) {
        super(message);
        this.name = 'PDLRequestError';
        this.Status = status;
        this.Body = body;
    }
}

interface PDLResponse<T> {
    Status: number;
    Body: T;
    Headers: PDLResponseHeaders;
    Text: string;
}

export class PDLPersonClient {
    public static readonly MaxBatchSize = 100;
    public static readonly MaxSearchPageSize = 100;

    private readonly apiKey: string;
    private readonly fetchImpl: typeof fetch;
    private readonly baseURL: string;

    public constructor(apiKey: string, options?: PDLPersonClientOptions) {
        if (!apiKey || apiKey.trim().length === 0) throw new Error('PDLPersonClient: apiKey is required');
        this.apiKey = apiKey.trim();
        // Bind global fetch so it keeps its expected `this` when not injected.
        this.fetchImpl = options?.FetchImpl ?? fetch.bind(globalThis);
        this.baseURL = (options?.BaseURL ?? PDLAPIEndpoint).replace(/\/+$/, '');
    }

    /** Resolve the key through the credentials path (company credential, then PDL_API_KEY), then construct a client. */
    public static async ForCompany(companyID: string | null, contextUser: UserInfo | undefined, options?: PDLPersonClientOptions): Promise<{ Client: PDLPersonClient; KeySource: 'credential' | 'environment' } | null> {
        const key = await ResolvePDLAPIKey(companyID, contextUser);
        if (!key) return null;
        return { Client: new PDLPersonClient(key.apiKey, options), KeySource: key.source };
    }

    public async BulkEnrich(inputs: PDLPersonInput[], options?: PDLBulkOptions): Promise<PDLBulkResult> {
        ValidateInputs(inputs);
        const requests = inputs.map((input) => ({ params: BuildParams(input, options), metadata: { key: input.Key } }));
        const response = await this.request<PDLBulkItemRaw[]>('POST', '/person/bulk', { body: { requests }, context: 'BulkEnrich' });
        const items = response.Body;
        if (!Array.isArray(items) || items.length !== inputs.length) {
            throw new PDLRequestError(`PDLPersonClient.BulkEnrich: expected ${inputs.length} results, got ${Array.isArray(items) ? items.length : 'a non-array body'}`, response.Status, response.Text);
        }
        const matches = items.map((item, index) => MapBulkItem(item, inputs[index], options?.IncludeRaw === true));
        const matched = matches.filter((match) => match.Matched).length;
        return { Matches: matches, CreditsConsumed: response.Headers.creditsSpent ?? matched };
    }

    /** One page of Person Search. Billed per record returned. A no-records response is `Total: 0`, not an error. */
    public async SearchPeople(request: PDLPersonSearchRequest): Promise<PDLPersonSearchPage> {
        if (!Number.isInteger(request.Size) || request.Size < 1 || request.Size > PDLPersonClient.MaxSearchPageSize) {
            throw new Error(`PDLPersonClient.SearchPeople: Size must be an integer from 1 to ${PDLPersonClient.MaxSearchPageSize}`);
        }
        const body: Record<string, unknown> = { query: request.Query, size: request.Size };
        if (request.ScrollToken) body.scroll_token = request.ScrollToken;
        const response = await this.request<PDLSearchResponseRaw>('POST', '/person/search', { body, context: 'SearchPeople', allowNotFound: true });
        if (response.Status === 404) return { Total: 0, People: [], ScrollToken: null, CreditsConsumed: 0 };
        const people = (response.Body.data ?? []).map((person) => MapPerson(person, person.id ?? '', true, null, false));
        return { Total: response.Body.total ?? people.length, People: people, ScrollToken: response.Body.scroll_token ?? null, CreditsConsumed: response.Headers.creditsSpent ?? people.length };
    }

    /** A size-1 search that returns only the total; the one record is discarded unmapped. */
    public async CountPeople(query: PDLBoolQuery): Promise<{ Total: number; CreditsConsumed: number }> {
        const response = await this.request<PDLSearchResponseRaw>('POST', '/person/search', { body: { query, size: 1 }, context: 'CountPeople', allowNotFound: true });
        if (response.Status === 404) return { Total: 0, CreditsConsumed: 0 };
        return { Total: response.Body.total ?? 0, CreditsConsumed: response.Headers.creditsSpent ?? (response.Body.data?.length ?? 0) };
    }

    /** Autocomplete on `field=school`. Free of credits; rate-limited only. */
    public async SuggestSchools(text: string, size = 10): Promise<PDLSchoolSuggestion[]> {
        const query = `field=school&text=${encodeURIComponent(text)}&size=${Math.max(1, Math.min(100, Math.floor(size)))}`;
        const response = await this.request<PDLAutocompleteResponseRaw>('GET', `/autocomplete?${query}`, { context: 'SuggestSchools', allowNotFound: true });
        if (response.Status === 404) return [];
        return (response.Body.data ?? []).map((item) => ({ Name: item.name, SchoolID: item.meta?.id ?? null, Count: typeof item.count === 'number' ? item.count : null }));
    }

    /** School Cleaner. Free of credits. Returns null when PDL can't resolve the name. Not trustworthy alone: confirm with SuggestSchools. */
    public async CleanSchool(name: string): Promise<PDLSchoolSuggestion | null> {
        const response = await this.request<PDLSchoolCleanResponseRaw>('GET', `/school/clean?name=${encodeURIComponent(name)}`, { context: 'CleanSchool', allowNotFound: true });
        if (response.Status === 404 || !response.Body.name) return null;
        return { Name: response.Body.name, SchoolID: response.Body.id ?? null, Count: null };
    }

    private async request<T>(method: 'GET' | 'POST', path: string, args: { body?: unknown; context: string; allowNotFound?: boolean }): Promise<PDLResponse<T>> {
        const headers: Record<string, string> = { 'X-Api-Key': this.apiKey, accept: 'application/json' };
        if (args.body !== undefined) headers['Content-Type'] = 'application/json';
        const response = await this.fetchImpl(`${this.baseURL}${path}`, { method, headers, body: args.body !== undefined ? JSON.stringify(args.body) : undefined });
        const text = await response.text();
        const parsed = ParseJson(text);
        const result: PDLResponse<T> = { Status: response.status, Body: parsed as T, Headers: ReadHeaders(response.headers), Text: text };
        if (response.ok || (args.allowNotFound && response.status === 404)) return result;
        throw ClassifyFailure(response.status, parsed, text, result.Headers, `PDLPersonClient.${args.context}: ${method} ${path}`);
    }
}

/** Reject oversize batches and inputs nothing identifies before any HTTP call. */
function ValidateInputs(inputs: PDLPersonInput[]): void {
    if (inputs.length === 0) throw new Error('PDLPersonClient.BulkEnrich: at least one input is required');
    if (inputs.length > PDLPersonClient.MaxBatchSize) throw new Error(`PDLPersonClient.BulkEnrich: at most ${PDLPersonClient.MaxBatchSize} inputs per call (got ${inputs.length})`);
    inputs.forEach((input, index) => {
        const hasName = !!input.FirstName?.trim() && !!input.LastName?.trim() && !!input.Company?.trim();
        if (!input.PDLID?.trim() && !input.Email?.trim() && !input.LinkedInURL?.trim() && !hasName) {
            throw new Error(`PDLPersonClient.BulkEnrich: input ${index} (${input.Key}) has no identifying field (PDLID, Email, LinkedInURL, or first name + last name + company)`);
        }
    });
}

function BuildParams(input: PDLPersonInput, options: PDLBulkOptions | undefined): Record<string, unknown> {
    const params: Record<string, unknown> = { min_likelihood: options?.MinLikelihood ?? DefaultMinLikelihood };
    if (input.PDLID?.trim()) params.pdl_id = input.PDLID.trim();
    if (input.Email?.trim()) params.email = input.Email.trim();
    if (input.LinkedInURL?.trim()) params.profile = input.LinkedInURL.trim();
    if (input.FirstName?.trim()) params.first_name = input.FirstName.trim();
    if (input.LastName?.trim()) params.last_name = input.LastName.trim();
    if (input.Company?.trim()) params.company = input.Company.trim();
    if (options?.Required) params.required = options.Required;
    if (options?.DataInclude && options.DataInclude.length > 0) params.data_include = options.DataInclude.join(',');
    return params;
}

function MapBulkItem(item: PDLBulkItemRaw, input: PDLPersonInput, includeRaw: boolean): PDLPersonMatch {
    const echoed = item.metadata?.key;
    if (echoed !== undefined && echoed !== input.Key) {
        throw new PDLRequestError(`PDLPersonClient.BulkEnrich: result for '${input.Key}' carried metadata.key '${String(echoed)}'; refusing to correlate by position`, item.status, JSON.stringify(item));
    }
    if (item.status === 200 && item.data) return MapPerson(item.data, input.Key, true, item.likelihood ?? null, includeRaw);
    const empty = MapPerson(null, input.Key, false, null, false);
    if (item.status === 404) return empty;
    return { ...empty, ErrorMessage: `PDL returned ${item.status}${item.error ? `: ${ErrorText(item.error)}` : ''}` };
}

function MapPerson(data: PDLPersonRaw | null, key: string, matched: boolean, likelihood: number | null, includeRaw: boolean): PDLPersonMatch {
    const match: PDLPersonMatch = {
        Key: key,
        Matched: matched,
        PDLID: data?.id ?? null,
        Likelihood: likelihood,
        LinkedInURL: data?.linkedin_url ?? null,
        Education: (data?.education ?? []).map(MapEducation).filter((entry): entry is PDLEducationEntry => entry !== null),
        Experience: (data?.experience ?? []).map(MapExperience).filter((entry): entry is PDLExperienceEntry => entry !== null),
        ErrorMessage: null,
    };
    if (includeRaw && data) match.Raw = data as unknown as Record<string, unknown>;
    return match;
}

function MapEducation(raw: PDLEducationRaw): PDLEducationEntry | null {
    const name = raw.school?.name?.trim();
    if (!name) return null;
    return { SchoolName: name, SchoolID: raw.school?.id ?? null, Degrees: raw.degrees ?? [], Majors: raw.majors ?? [], StartDate: NormalizeDate(raw.start_date), EndDate: NormalizeDate(raw.end_date) };
}

function MapExperience(raw: PDLExperienceRaw): PDLExperienceEntry | null {
    const name = raw.company?.name?.trim();
    if (!name) return null;
    return { CompanyName: name, CompanyDomain: DomainOf(raw.company?.website), Title: raw.title?.name?.trim() || null, StartDate: NormalizeDate(raw.start_date), EndDate: NormalizeDate(raw.end_date), IsCurrent: raw.is_primary === true };
}

/** `YYYY`, `YYYY-MM` and `YYYY-MM-DD` to the first day of the year or month; anything else to null. */
export function NormalizeDate(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01-01`;
    if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    return null;
}

/** Bare host of a website or domain value. */
export function DomainOf(value: string | null | undefined): string | null {
    if (!value) return null;
    let host = value.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^www\./, '');
    host = host.split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '');
    return host === '' ? null : host;
}

function ParseJson(text: string): unknown {
    try {
        return text ? JSON.parse(text) : null;
    } catch {
        return null;
    }
}

function ErrorText(error: PDLErrorBody | undefined): string {
    if (!error) return '';
    const type = Array.isArray(error.type) ? error.type.join(',') : error.type;
    return `${type}: ${error.message}`;
}

function ReadHeaders(headers: Headers): PDLResponseHeaders {
    const number = (name: string): number | null => { const v = headers.get(name); return v !== null && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : null; };
    return { creditsSpent: number('x-call-credits-spent'), creditsType: headers.get('x-call-credits-type'), rateLimitRemaining: headers.get('x-ratelimit-remaining'), rateLimitReset: headers.get('x-ratelimit-reset'), totalLimitRemaining: number('x-totallimit-remaining') };
}

/** Maps a failed top-level response onto the typed errors. Never sleeps. */
function ClassifyFailure(status: number, parsed: unknown, text: string, headers: PDLResponseHeaders, prefix: string): Error {
    const body = parsed as { error?: PDLErrorBody } | null;
    const detail = body?.error ? ErrorText(body.error) : text.slice(0, 300);
    const message = `${prefix} failed with HTTP ${status}${detail ? ` — ${detail}` : ''}`;
    LogError(message);
    if (status === 401 || status === 403) return new PDLAuthError(message, status);
    if (status === 402) return new PDLCreditsExhaustedError(message);
    if (status === 429) return new PDLRateLimitError(message, RetryAfterSeconds(headers));
    return new PDLRequestError(message, status, text);
}

function RetryAfterSeconds(headers: PDLResponseHeaders): number | null {
    if (!headers.rateLimitReset) return null;
    const reset = Date.parse(headers.rateLimitReset.replace(' ', 'T') + 'Z');
    if (Number.isNaN(reset)) return null;
    return Math.max(0, Math.ceil((reset - Date.now()) / 1000));
}
