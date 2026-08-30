/**
 * Apollo.io list-management and search contract types.
 *
 * These serve a different surface from the enrichment actions in this package.
 * Enrichment answers "tell me more about this record I already have"; this
 * surface answers "which records are in this list, who else is out there, and
 * move these from one list to another". It talks to a different base path
 * (`api.apollo.io/api/v1`, see {@link ApolloRESTEndpoint}) and, for writes, needs
 * a MASTER key rather than a scoped one.
 *
 * Five API behaviours are encoded here rather than discovered by each caller.
 * Every one of them was learned by running this against a real Apollo account
 * with tens of thousands of records in it:
 *
 *   1. AN ACCOUNT/CONTACT UPDATE REPLACES THE FULL LABEL ARRAY. A PATCH carrying
 *      `label_names` overwrites every membership the record had. So a move is two
 *      writes — add destination (current ∪ target), then remove source (post-add
 *      state minus source) — and each write carries the record's COMPLETE
 *      intended set. Sending a bare `[target]` would silently strip the record
 *      from every other list it belongs to.
 *   2. ROUGHLY 15-17% OF REMOVES SILENTLY NO-OP. The PATCH returns success and
 *      the label stays attached; the record resurfaces later carrying both
 *      labels. The move surface re-reads afterwards and reports these as
 *      `possiblyStuck`. It deliberately does NOT auto-retry — an immediate retry
 *      flakes the same way — so they are cleaned up on the next drain pass.
 *   3. A LIST DRAIN ALWAYS READS PAGE 1. Removing members shifts every later
 *      page, so "page 2" of a shrinking list skips records. {@link ApolloPagingOptions}
 *      therefore defaults `page` to 1.
 *   4. UPDATES REQUIRE A MASTER KEY. Scoped keys return 403 on account/contact
 *      updates and on the labels endpoints.
 *   5. LABELS ARE READ AS IDS AND WRITTEN AS NAMES. The account/contact search
 *      response carries memberships as `label_ids` ONLY — there is no
 *      `label_names` on the search payload — while the PATCH body takes
 *      `label_names`. The client bridges the asymmetry by caching the labels
 *      id↔name map and resolving on every read, so the move math and the writes
 *      both operate on real names.
 *
 * SAFETY INVARIANT: there is no delete surface anywhere in this contract. The
 * only writes are label-array updates and label creation.
 */

// ─── Labels (Apollo "lists" / "tags") ───────────────────────────────────────

/**
 * A label. Apollo overloads "label" to mean account lists, contact lists, and
 * freeform tags; `modality` discriminates, and is surfaced here as `kind`.
 */
export interface ApolloLabel {
    id: string;
    name: string;
    /**
     * The member count Apollo caches per label. It can lag the true count, so it
     * is fine for display and wrong for paging math.
     */
    cachedCount: number;
    /** 'accounts' | 'contacts'; any other value Apollo sends passes through verbatim. */
    kind: 'accounts' | 'contacts' | string;
    createdAt: string;
    updatedAt: string;
}

// ─── Accounts and contacts (list members) ───────────────────────────────────

/**
 * An account from the saved-account search. Deliberately thin: a list-cleanup
 * workflow needs the identity, the domain for triage, and — load-bearing — the
 * current label set, so a move can preserve it. Apollo returns far more fields
 * and they are not modelled.
 */
export interface ApolloAccount {
    id: string;
    name: string;
    /** Apollo's `primary_domain`; '' when absent. */
    primaryDomain: string;
    /**
     * Membership ids exactly as the search returned them (quirk #5). Kept for
     * diagnostics, and as the input {@link labelNames} is resolved from.
     */
    labelIds: string[];
    /**
     * The account's CURRENT label names, resolved from {@link labelIds}. Every
     * label write must start from this set or it clobbers the account's other
     * memberships (quirk #1). An id with no matching label is dropped rather
     * than passed through — a raw id inside a `label_names` write would create a
     * junk label named after a hex string.
     */
    labelNames: string[];
}

/** A contact from the saved-contact search. Thin for the same reason as {@link ApolloAccount}. */
export interface ApolloContact {
    id: string;
    firstName: string;
    lastName: string;
    name: string;
    title: string;
    email: string;
    /** Employer name; '' when Apollo has none on the contact. */
    organizationName: string;
    /** Membership ids as returned (quirk #5). */
    labelIds: string[];
    /** CURRENT label names resolved from {@link labelIds} — load-bearing for moves (quirk #1). */
    labelNames: string[];
}

/**
 * A person from the prospecting search — net-new people in Apollo's database,
 * not your saved contacts. This endpoint does not return emails or phones by
 * design; that is the enrichment surface, which the other actions in this
 * package cover.
 */
export interface ApolloPerson {
    id: string;
    firstName: string;
    lastName: string;
    name: string;
    title: string;
    /** LinkedIn profile URL when present; '' otherwise. */
    linkedinUrl: string;
    /** Apollo organization id of the employer; null when absent. */
    organizationId: string | null;
    /** Employer name; '' when absent. */
    organizationName: string;
}

// ─── Pagination ─────────────────────────────────────────────────────────────

/** Apollo's `pagination` envelope on every search response. */
export interface ApolloPagination {
    page: number;
    perPage: number;
    totalEntries: number;
    totalPages: number;
}

/**
 * Paging controls. Apollo caps a search at 100 per page and 500 pages.
 *
 * `page` defaults to 1 because of quirk #3: when draining a list — reading
 * members in order to move them out — always re-read page 1. Removals shift
 * every later page, so advancing to page 2 skips records. Read page 1, move,
 * read page 1 again; it now surfaces what used to be page 2. The default is 1
 * precisely so a caller who has not read that paragraph still drains correctly.
 */
export interface ApolloPagingOptions {
    /** 1-based page. Defaults to 1 (drain-safe). Apollo's max is 500. */
    page?: number;
    /** Results per page. Defaults to 100, which is also Apollo's maximum. */
    perPage?: number;
}

/** One page of accounts plus the pagination envelope. */
export interface ApolloAccountsPage {
    accounts: ApolloAccount[];
    pagination: ApolloPagination;
}

/** One page of contacts plus the pagination envelope. */
export interface ApolloContactsPage {
    contacts: ApolloContact[];
    pagination: ApolloPagination;
}

/** One page of prospecting people plus the pagination envelope. */
export interface ApolloPeoplePage {
    people: ApolloPerson[];
    pagination: ApolloPagination;
}

// ─── Search filters ─────────────────────────────────────────────────────────

/** Account search filter. `labelIds` → `account_label_ids`; `keywords` → `q_organization_name`. */
export interface ApolloAccountSearchFilter {
    labelIds?: string[];
    keywords?: string;
}

/**
 * Contact search filter. `labelIds` → `contact_label_ids`; `keywords` →
 * `q_keywords`, which Apollo matches against names, titles, employers and emails.
 */
export interface ApolloContactSearchFilter {
    labelIds?: string[];
    keywords?: string;
}

/**
 * Prospecting-search filter. `organizationDomains` → `q_organization_domains_list`,
 * `organizationIds` → `organization_ids`, `titles` → `person_titles`,
 * `seniorities` → `person_seniorities`. All are optional to Apollo, but supplying
 * none returns an unscoped firehose that burns the rate limit for nothing, so the
 * action requires at least one.
 */
export interface ApolloPeopleSearchFilter {
    organizationDomains?: string[];
    organizationIds?: string[];
    titles?: string[];
    /** e.g. 'owner' | 'founder' | 'c_suite' | 'vp' | 'director' | 'manager' */
    seniorities?: string[];
}

// ─── Move results ───────────────────────────────────────────────────────────

/**
 * One record's move outcome. `added`/`removed` track the two PATCH phases
 * separately, because an add that succeeded followed by a remove that failed
 * leaves the record in both lists — a state the caller has to be able to see.
 */
export interface ApolloMoveItemResult {
    /** Apollo id of the account or contact. */
    id: string;
    /** Phase 1 (add the destination label) succeeded. */
    added: boolean;
    /** Phase 2 (remove the source label) succeeded. */
    removed: boolean;
    /**
     * true  — the verify re-read still found the source label attached (quirk #2).
     * false — the verify re-read confirmed it is gone.
     * null  — no verify pass ran, or the re-read itself failed; state unknown.
     */
    possiblyStuck: boolean | null;
    /** Failure detail when `added` or `removed` is false; null otherwise. */
    error: string | null;
}

/**
 * The result of moving a batch between lists.
 *
 * `possiblyStuckCount` is Apollo's silent-fail rate showing up (quirk #2), not a
 * bug in the caller. Those records are not retried here: they resurface on the
 * next page-1 drain carrying both labels and get stripped then.
 */
export interface ApolloMoveResult {
    /** Destination added AND source removed, and not flagged stuck. */
    movedCount: number;
    /** Records where a PATCH outright failed. */
    failedCount: number;
    /** Records whose remove reported success but did not apply (quirk #2). */
    possiblyStuckCount: number;
    /** Per-record detail, for auditing and for planning the next drain pass. */
    items: ApolloMoveItemResult[];
}

// ─── Client surface ─────────────────────────────────────────────────────────

/** The operations the list/search actions need. No delete surface, by design. */
export interface IApolloRESTClient {
    /** Every label, account and contact alike. Master key required. */
    listLabels(): Promise<ApolloLabel[]>;
    /** Create a label. `modality` is required by Apollo — omitting it returns 422. */
    createLabel(name: string, modality?: 'contacts' | 'accounts'): Promise<ApolloLabel>;
    /** Resolve a label by exact name, case-insensitive; null when no match. */
    findLabelByName(name: string): Promise<ApolloLabel | null>;

    /** One page of saved accounts. */
    searchAccounts(filter: ApolloAccountSearchFilter, paging?: ApolloPagingOptions): Promise<ApolloAccountsPage>;
    /** One page of saved contacts. */
    searchContacts(filter: ApolloContactSearchFilter, paging?: ApolloPagingOptions): Promise<ApolloContactsPage>;
    /** One page of net-new prospects. */
    searchPeople(filter: ApolloPeopleSearchFilter, paging?: ApolloPagingOptions): Promise<ApolloPeoplePage>;

    /**
     * Move accounts between lists, two-step and label-preserving. The supplied
     * accounts MUST carry current `labelNames` from a fresh read — stale labels
     * would be written back as the intended set and strip real memberships.
     */
    moveAccounts(
        accounts: ApolloAccount[],
        fromList: string,
        toList: string,
        options?: { verify?: boolean },
    ): Promise<ApolloMoveResult>;
    /** The same for contacts. */
    moveContacts(
        contacts: ApolloContact[],
        fromList: string,
        toList: string,
        options?: { verify?: boolean },
    ): Promise<ApolloMoveResult>;
}
