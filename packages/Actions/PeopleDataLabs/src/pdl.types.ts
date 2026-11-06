/**
 * People Data Labs v5 payload shapes, limited to what this package reads. Field names follow the
 * vendor's JSON, so they keep the vendor's snake_case.
 *
 * Shapes were confirmed against live responses on 2026-10-12 (plan Phase 0); the redacted fixtures
 * under `__tests__/fixtures/` are those responses.
 */
/* eslint-disable @typescript-eslint/naming-convention */

// case-violation-ok-legacy-back-compat: vendor payload, keys are PDL's own
export interface PDLSchool {
    name: string | null;
    type: string | null;
    id: string | null;
    website: string | null;
    domain: string | null;
    linkedin_url: string | null;
}

// case-violation-ok-legacy-back-compat: vendor payload, keys are PDL's own
export interface PDLEducationRaw {
    school: PDLSchool | null;
    degrees: string[] | null;
    majors: string[] | null;
    minors: string[] | null;
    gpa: number | null;
    /** `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, or null. */
    start_date: string | null;
    end_date: string | null;
}

// case-violation-ok-legacy-back-compat: vendor payload, keys are PDL's own
export interface PDLCompany {
    name: string | null;
    id: string | null;
    /** A bare domain, e.g. `un.org`. */
    website: string | null;
    industry: string | null;
    size: string | null;
    linkedin_url: string | null;
}

// case-violation-ok-legacy-back-compat: vendor payload, keys are PDL's own
export interface PDLExperienceRaw {
    company: PDLCompany | null;
    title: { name: string | null; role: string | null; sub_role: string | null; levels: string[] | null } | null;
    start_date: string | null;
    end_date: string | null;
    /** True on the current job. */
    is_primary: boolean | null;
}

/**
 * The person record. Only the fields this package maps are typed; PDL sends many more (emails,
 * phones, addresses) which the client never reads.
 */
// case-violation-ok-legacy-back-compat: vendor payload, keys are PDL's own
export interface PDLPersonRaw {
    id: string | null;
    linkedin_url: string | null;
    education: PDLEducationRaw[] | null;
    experience: PDLExperienceRaw[] | null;
}

// case-violation-ok-legacy-back-compat: vendor payload, keys are PDL's own
export interface PDLErrorBody {
    type: string | string[];
    message: string;
}

/** One element of the bulk response array, in request order. */
// case-violation-ok-legacy-back-compat: vendor payload, keys are PDL's own
export interface PDLBulkItemRaw {
    status: number;
    likelihood?: number;
    data?: PDLPersonRaw;
    error?: PDLErrorBody;
    /** Echo of `requests[i].metadata`. */
    metadata?: Record<string, unknown>;
}

// case-violation-ok-legacy-back-compat: vendor payload, keys are PDL's own
export interface PDLSearchResponseRaw {
    status: number;
    data?: PDLPersonRaw[];
    total?: number;
    scroll_token?: string | null;
    error?: PDLErrorBody;
}

// case-violation-ok-legacy-back-compat: vendor payload, keys are PDL's own
export interface PDLAutocompleteItemRaw {
    name: string;
    count?: number;
    meta?: { id?: string; website?: string; location_name?: string };
}

// case-violation-ok-legacy-back-compat: vendor payload, keys are PDL's own
export interface PDLAutocompleteResponseRaw {
    status: number;
    data?: PDLAutocompleteItemRaw[];
    error?: PDLErrorBody;
}

// case-violation-ok-legacy-back-compat: vendor payload, keys are PDL's own
export interface PDLSchoolCleanResponseRaw {
    status: number;
    name?: string;
    id?: string;
    type?: string;
    website?: string;
    error?: PDLErrorBody;
}

/** Headers PDL sets on every response. Values are strings; the rate-limit ones hold JSON per window. */
export interface PDLResponseHeaders {
    creditsSpent: number | null;
    creditsType: string | null;
    rateLimitRemaining: string | null;
    rateLimitReset: string | null;
    totalLimitRemaining: number | null;
}
