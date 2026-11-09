/**
 * Apollo `people/bulk_match` payload shapes, limited to what this package reads. Keys keep Apollo's
 * snake_case. Confirmed against live responses on 2026-10-12 (plan Phase 0, both a free and a paid
 * key); the redacted fixture under `__tests__/fixtures/bulk-match.redacted.json` is that response.
 */
/* eslint-disable @typescript-eslint/naming-convention */

// case-violation-ok-legacy-back-compat: vendor payload, keys are Apollo's own
export interface ApolloEmploymentHistoryRaw {
    organization_id: string | null;
    organization_name: string | null;
    title: string | null;
    start_date: string | null;
    end_date: string | null;
    current: boolean | null;
    /** Null on every record seen in Phase 0; Apollo documents education entries carrying these. */
    kind: string | null;
    degree: string | null;
    major: string | null;
    grade_level: string | null;
}

// case-violation-ok-legacy-back-compat: vendor payload, keys are Apollo's own
export interface ApolloOrganizationRaw {
    id: string | null;
    name: string | null;
    /** A full URL, e.g. `http://www.un.org`. */
    website_url: string | null;
    /** A bare domain, e.g. `un.org`. */
    primary_domain: string | null;
}

// case-violation-ok-legacy-back-compat: vendor payload, keys are Apollo's own
export interface ApolloPersonMatchRaw {
    id: string | null;
    first_name: string | null;
    last_name: string | null;
    name: string | null;
    title: string | null;
    linkedin_url: string | null;
    photo_url: string | null;
    /** Present on a match; the work email, or a personal one when `reveal_personal_emails` was sent. */
    email: string | null;
    twitter_url: string | null;
    facebook_url: string | null;
    organization_id: string | null;
    organization: ApolloOrganizationRaw | null;
    employment_history: ApolloEmploymentHistoryRaw[] | null;
    match_confidence: number | null;
}

/** `matches[i]` is positionally aligned with `details[i]`; null for a miss. */
// case-violation-ok-legacy-back-compat: vendor payload, keys are Apollo's own
export interface ApolloBulkMatchResponseRaw {
    status: string;
    error_code: string | null;
    error_message: string | null;
    total_requested_enrichments: number;
    unique_enriched_records: number;
    missing_records: number;
    credits_consumed: number;
    matches: (ApolloPersonMatchRaw | null)[];
}
