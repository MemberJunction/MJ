/**
 * A table-agnostic client for Apollo's people enrichment: `POST /api/v1/people/bulk_match`, up to 10
 * people per call, header auth, typed errors, no long sleeps. It returns normalized data and writes
 * nothing. The enrichment actions in this package and bizapps-common's enrichment engine both use it.
 */
import type { UserInfo } from '@memberjunction/core';
import { ApolloRESTEndpoint } from '../config.js';
import { ApolloRateLimitError, ApolloRequest, ApolloRequestError } from '../http/ApolloHttp.js';
import { ResolveApolloAPIKey } from '../lists/credentials.js';
import type { OrganizationEnrichmentOrganization } from '../generic/apollo.types.js';
import type { ApolloBulkMatchResponseRaw, ApolloEmploymentHistoryRaw, ApolloPersonMatchRaw } from './apollo-people.types.js';

export interface ApolloPersonMatchInput {
    /** Caller's correlation key (common passes the Person ID). Echoed back on the result. */
    Key: string;
    /** When already known: the cheapest, most exact match. */
    ApolloPersonID?: string;
    Email?: string;
    LinkedInURL?: string;
    FirstName?: string;
    LastName?: string;
    OrganizationDomain?: string;
    OrganizationName?: string;
}

export interface ApolloEmploymentEntry {
    OrganizationName: string;
    ApolloOrganizationID: string | null;
    /** Apollo does not include a domain on history entries; null unless it starts to. */
    OrganizationDomain: string | null;
    Title: string | null;
    /** 'YYYY-MM-DD', normalized; null when Apollo's value won't parse. */
    StartDate: string | null;
    EndDate: string | null;
    IsCurrent: boolean;
}

export interface ApolloEducationEntry {
    InstitutionName: string;
    ApolloOrganizationID: string | null;
    Degree: string | null;
    FieldOfStudy: string | null;
    GradeLevel: string | null;
    StartDate: string | null;
    EndDate: string | null;
}

export interface ApolloPersonMatch {
    Key: string;
    Matched: boolean;
    ApolloPersonID: string | null;
    FirstName: string | null;
    LastName: string | null;
    Title: string | null;
    /** The email Apollo returned for the match. Personal emails only when RevealPersonalEmails was sent. */
    Email: string | null;
    LinkedInURL: string | null;
    TwitterURL: string | null;
    FacebookURL: string | null;
    PhotoURL: string | null;
    Organization: { ApolloOrganizationID: string | null; Name: string | null; Domain: string | null } | null;
    Employment: ApolloEmploymentEntry[];
    /** Entries of `employment_history` that carry a degree or an education kind. Empty on every record Phase 0 saw. */
    Education: ApolloEducationEntry[];
    /** Raw `matches[i]`. Only with IncludeRaw. Never persist it. */
    Raw?: Record<string, unknown>;
}

export interface ApolloBulkMatchOptions {
    /** Default false. The legacy Contacts action passes true to keep its behaviour. */
    RevealPersonalEmails?: boolean;
    IncludeRaw?: boolean;
}

export interface ApolloBulkMatchResult {
    /** Same length and order as the input. */
    Matches: ApolloPersonMatch[];
    /** Apollo's `credits_consumed`: one per match, misses free. */
    CreditsConsumed: number;
}

export interface ApolloPeopleClientOptions {
    /** Injected fetch, for tests. Tests must never reach api.apollo.io. */
    FetchImpl?: typeof fetch;
    BaseURL?: string;
    /** Injected sleep for the single per-minute retry, so tests never wait. */
    SleepImpl?: (ms: number) => Promise<void>;
}

const MAX_MINUTE_WAIT_MS = 60_000;

export class ApolloPeopleClient {
    public static readonly MaxBatchSize = 10;

    private readonly apiKey: string;
    private readonly fetchImpl: typeof fetch;
    private readonly baseURL: string;
    private readonly sleepImpl: (ms: number) => Promise<void>;

    public constructor(apiKey: string, options?: ApolloPeopleClientOptions) {
        if (!apiKey || apiKey.trim().length === 0) throw new Error('ApolloPeopleClient: apiKey is required');
        this.apiKey = apiKey.trim();
        // Bind global fetch so it keeps its expected `this` when not injected.
        this.fetchImpl = options?.FetchImpl ?? fetch.bind(globalThis);
        this.baseURL = TrimTrailingSlashes(options?.BaseURL ?? ApolloRESTEndpoint);
        this.sleepImpl = options?.SleepImpl ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    }

    /** Resolve the key through the existing credentials path (company credential, then APOLLO_API_KEY), then construct a client. */
    public static async ForCompany(companyID: string | null, contextUser: UserInfo | undefined, options?: ApolloPeopleClientOptions): Promise<{ Client: ApolloPeopleClient; KeySource: 'credential' | 'environment' } | null> {
        const key = await ResolveApolloAPIKey(companyID, contextUser);
        if (!key) return null;
        return { Client: new ApolloPeopleClient(key.apiKey, options), KeySource: key.source };
    }

    public async BulkMatch(inputs: ApolloPersonMatchInput[], options?: ApolloBulkMatchOptions): Promise<ApolloBulkMatchResult> {
        ValidateInputs(inputs);
        const reveal = options?.RevealPersonalEmails === true;
        const body = { details: inputs.map(ToDetail), reveal_personal_emails: reveal, reveal_phone_number: false };
        const path = `/people/bulk_match?reveal_personal_emails=${reveal}&reveal_phone_number=false`;
        const response = await this.requestWithMinuteRetry({ Method: 'POST', Path: path, Context: 'ApolloPeopleClient.BulkMatch', Body: body });
        const raw = response as ApolloBulkMatchResponseRaw;
        const matches = Array.isArray(raw?.matches) ? raw.matches : null;
        if (!matches || matches.length !== inputs.length) {
            throw new ApolloRequestError(`ApolloPeopleClient.BulkMatch: expected ${inputs.length} matches, got ${matches ? matches.length : 'a non-array body'}; refusing to correlate by position`, 200, JSON.stringify(raw).slice(0, 500));
        }
        return { Matches: matches.map((match, index) => MapMatch(match, inputs[index].Key, options?.IncludeRaw === true)), CreditsConsumed: typeof raw.credits_consumed === 'number' ? raw.credits_consumed : 0 };
    }

    /**
     * `GET /organizations/enrich?domain=` with header auth. Returns Apollo's organization record, or
     * null when Apollo has nothing for the domain (a miss costs nothing).
     */
    public async EnrichOrganization(domain: string): Promise<OrganizationEnrichmentOrganization | null> {
        const trimmed = domain.trim();
        if (!trimmed) throw new Error('ApolloPeopleClient.EnrichOrganization: domain is required');
        const path = `/organizations/enrich?domain=${encodeURIComponent(trimmed)}`;
        const body = await this.requestWithMinuteRetry({ Method: 'GET', Path: path, Context: 'ApolloPeopleClient.EnrichOrganization' });
        const organization = IsRecord(body) && IsRecord(body.organization) ? (body.organization as unknown as OrganizationEnrichmentOrganization) : null;
        return organization;
    }

    /** A per-minute 429 waits at most 60 seconds and retries once; an hourly or daily 429 throws at once (never sleep an hour inside a call). */
    private async requestWithMinuteRetry(args: { Method: 'GET' | 'POST'; Path: string; Context: string; Body?: unknown }): Promise<unknown> {
        try {
            return await this.send(args);
        } catch (error) {
            if (!(error instanceof ApolloRateLimitError) || error.Window !== 'minute') throw error;
            await this.sleepImpl(Math.min(MAX_MINUTE_WAIT_MS, (error.RetryAfterSeconds ?? 60) * 1000));
            return this.send(args);
        }
    }

    private async send(args: { Method: 'GET' | 'POST'; Path: string; Context: string; Body?: unknown }): Promise<unknown> {
        const response = await ApolloRequest({ ApiKey: this.apiKey, FetchImpl: this.fetchImpl, BaseURL: this.baseURL, ...args });
        return response.Body;
    }
}

/** Reject more than 10 inputs and inputs nothing identifies, before any HTTP call. */
function ValidateInputs(inputs: ApolloPersonMatchInput[]): void {
    if (inputs.length === 0) throw new Error('ApolloPeopleClient.BulkMatch: at least one input is required');
    if (inputs.length > ApolloPeopleClient.MaxBatchSize) throw new Error(`ApolloPeopleClient.BulkMatch: at most ${ApolloPeopleClient.MaxBatchSize} inputs per call (got ${inputs.length})`);
    inputs.forEach((input, index) => {
        const hasName = !!input.FirstName?.trim() && !!input.LastName?.trim() && (!!input.OrganizationDomain?.trim() || !!input.OrganizationName?.trim());
        if (!input.ApolloPersonID?.trim() && !input.Email?.trim() && !input.LinkedInURL?.trim() && !hasName) {
            throw new Error(`ApolloPeopleClient.BulkMatch: input ${index} (${input.Key}) has no identifying field (ApolloPersonID, Email, LinkedInURL, or first name + last name + organization)`);
        }
    });
}

function ToDetail(input: ApolloPersonMatchInput): Record<string, string> {
    const detail: Record<string, string> = {};
    if (input.ApolloPersonID?.trim()) detail.id = input.ApolloPersonID.trim();
    if (input.Email?.trim()) detail.email = input.Email.trim();
    if (input.LinkedInURL?.trim()) detail.linkedin_url = input.LinkedInURL.trim();
    if (input.FirstName?.trim()) detail.first_name = input.FirstName.trim();
    if (input.LastName?.trim()) detail.last_name = input.LastName.trim();
    if (input.OrganizationName?.trim()) detail.organization_name = input.OrganizationName.trim();
    if (input.OrganizationDomain?.trim()) detail.domain = input.OrganizationDomain.trim();
    return detail;
}

export function MapMatch(raw: ApolloPersonMatchRaw | null, key: string, includeRaw: boolean): ApolloPersonMatch {
    if (!raw) return { Key: key, Matched: false, ApolloPersonID: null, FirstName: null, LastName: null, Title: null, Email: null, LinkedInURL: null, TwitterURL: null, FacebookURL: null, PhotoURL: null, Organization: null, Employment: [], Education: [] };
    const history = raw.employment_history ?? [];
    const match: ApolloPersonMatch = {
        Key: key,
        Matched: true,
        ApolloPersonID: raw.id ?? null,
        FirstName: raw.first_name ?? null,
        LastName: raw.last_name ?? null,
        Title: raw.title ?? null,
        Email: raw.email ?? null,
        LinkedInURL: raw.linkedin_url ?? null,
        TwitterURL: raw.twitter_url ?? null,
        FacebookURL: raw.facebook_url ?? null,
        PhotoURL: raw.photo_url ?? null,
        Organization: raw.organization ? { ApolloOrganizationID: raw.organization.id ?? raw.organization_id ?? null, Name: raw.organization.name ?? null, Domain: raw.organization.primary_domain ?? DomainOf(raw.organization.website_url) } : null,
        Employment: history.filter((entry) => !IsEducation(entry)).map(MapEmployment).filter((entry): entry is ApolloEmploymentEntry => entry !== null),
        Education: history.filter(IsEducation).map(MapEducation).filter((entry): entry is ApolloEducationEntry => entry !== null),
    };
    if (includeRaw) match.Raw = raw as unknown as Record<string, unknown>;
    return match;
}

/** The education split: a degree, or a kind naming education, marks a school; a school-named entry without either (a trustee seat) stays a job. */
export function IsEducation(entry: ApolloEmploymentHistoryRaw): boolean {
    return !!entry.degree?.trim() || /educat/i.test(entry.kind ?? '');
}

function MapEmployment(entry: ApolloEmploymentHistoryRaw): ApolloEmploymentEntry | null {
    const name = entry.organization_name?.trim();
    if (!name) return null;
    return { OrganizationName: name, ApolloOrganizationID: entry.organization_id ?? null, OrganizationDomain: null, Title: entry.title?.trim() || null, StartDate: NormalizeDate(entry.start_date), EndDate: NormalizeDate(entry.end_date), IsCurrent: entry.current === true };
}

function MapEducation(entry: ApolloEmploymentHistoryRaw): ApolloEducationEntry | null {
    const name = entry.organization_name?.trim();
    if (!name) return null;
    return { InstitutionName: name, ApolloOrganizationID: entry.organization_id ?? null, Degree: entry.degree?.trim() || null, FieldOfStudy: entry.major?.trim() || null, GradeLevel: entry.grade_level?.trim() || null, StartDate: NormalizeDate(entry.start_date), EndDate: NormalizeDate(entry.end_date) };
}

/** `YYYY`, `YYYY-MM` and `YYYY-MM-DD` (or a longer ISO string) to the first day of the year or month; anything else to null. */
export function NormalizeDate(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01-01`;
    if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    return null;
}

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Strips trailing slashes without a regex (a `/\/+$/` pattern is quadratic on long runs of slashes). */
export function TrimTrailingSlashes(value: string): string {
    let end = value.length;
    while (end > 0 && value.charAt(end - 1) === '/') end--;
    return value.slice(0, end);
}

/** Bare host of a website URL or domain value. */
export function DomainOf(value: string | null | undefined): string | null {
    if (!value) return null;
    let host = value.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^www\./, '');
    host = host.split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '');
    return host === '' ? null : host;
}
