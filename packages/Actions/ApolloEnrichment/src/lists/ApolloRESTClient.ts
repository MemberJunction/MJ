/**
 * Apollo.io REST client for label management, saved-record search and prospecting.
 *
 * The five API behaviours this encodes are documented once, on
 * `../generic/apollo-lists.types.ts`. Read that first; the methods below refer to
 * them by number.
 *
 * Everything here goes through {@link ApolloRESTEndpoint} (`api.apollo.io/api/v1`),
 * which is a different base path from the enrichment actions in this package.
 * Auth is the `X-Api-Key` header — Apollo's REST convention, even though the
 * docs' generic auth widget renders a "Bearer" label — and every write, plus the
 * labels endpoints, needs a MASTER key. A scoped key returns 403, which this
 * client rewrites into a message that says so instead of passing the bare status
 * through.
 *
 * Endpoints used:
 *   GET   /labels                    list labels
 *   POST  /labels                    create a label
 *   POST  /accounts/search           saved accounts
 *   POST  /contacts/search           saved contacts
 *   POST  /mixed_people/api_search   prospecting people
 *   PATCH /accounts/{id}             update one account's labels (master key)
 *   PATCH /contacts/{id}             update one contact's labels (master key)
 *
 * The write body key is `label_names` (strings), not `label_ids`. Apollo's
 * update-a-contact reference documents it explicitly along with the full-replace
 * semantics; the update-an-account reference documents no label parameter at all,
 * but mirrors the contact body in practice. If a future Apollo change rejects
 * names on the account PATCH, the fix is to resolve names → ids through the
 * cached map and send `label_ids` — still as a COMPLETE set, since the
 * full-replace behaviour is the part that matters.
 *
 * No delete surface. The only writes are label-array updates and label creation.
 */
import { LogError, LogStatus } from '@memberjunction/core';
import { ApolloRESTEndpoint } from '../config.js';
import type {
    ApolloAccount,
    ApolloAccountSearchFilter,
    ApolloAccountsPage,
    ApolloContact,
    ApolloContactSearchFilter,
    ApolloContactsPage,
    ApolloLabel,
    ApolloMoveItemResult,
    ApolloMoveResult,
    ApolloPagination,
    ApolloPagingOptions,
    ApolloPeoplePage,
    ApolloPeopleSearchFilter,
    ApolloPerson,
    IApolloRESTClient,
} from '../generic/apollo-lists.types.js';

/** Apollo's per-page cap on every search endpoint. */
const MAX_PER_PAGE = 100;
/** Apollo's page cap, a consequence of its 50,000-record display limit. */
const MAX_PAGE = 500;

/** Options for {@link ApolloRESTClient}. */
export interface ApolloRESTClientOptions {
    /**
     * Injected fetch, for tests. Tests must never reach api.apollo.io — a live
     * call would consume real credits and mutate a real account's lists.
     */
    fetchImpl?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOr(value: unknown, fallback: string): string {
    return typeof value === 'string' ? value : fallback;
}

function stringOrNull(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberOr(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Coerce an unknown into a string[], dropping anything that is not a string. */
function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string');
}

/** Bidirectional label id↔name maps (quirk #5). */
interface LabelMaps {
    idToName: Map<string, string>;
    nameToId: Map<string, string>;
}

/**
 * Resolve a record's raw `label_ids` into names (quirk #5). An id with no
 * matching label is dropped and reported through {@link onUnresolved} so the
 * caller can log one aggregated warning instead of one per id. Dropping is the
 * safe choice: passing a raw id through into a later `label_names` write would
 * create a new label named after a hex string.
 */
function resolveLabelNames(labelIds: string[], idToName: Map<string, string>, onUnresolved: (id: string) => void): string[] {
    const names: string[] = [];
    for (const id of labelIds) {
        const name = idToName.get(id);
        if (name !== undefined) {
            names.push(name);
        } else {
            onUnresolved(id);
        }
    }
    return names;
}

function mapPagination(value: unknown): ApolloPagination {
    const p = isRecord(value) ? value : {};
    return {
        page: numberOr(p.page, 1),
        perPage: numberOr(p.per_page, 0),
        totalEntries: numberOr(p.total_entries, 0),
        totalPages: numberOr(p.total_pages, 0),
    };
}

function mapAccount(item: Record<string, unknown>, idToName: Map<string, string>, onUnresolved: (id: string) => void): ApolloAccount {
    const labelIds = toStringArray(item.label_ids);
    return {
        id: stringOr(item.id, ''),
        name: stringOr(item.name, ''),
        primaryDomain: stringOr(item.primary_domain, ''),
        labelIds,
        labelNames: resolveLabelNames(labelIds, idToName, onUnresolved),
    };
}

function mapContact(item: Record<string, unknown>, idToName: Map<string, string>, onUnresolved: (id: string) => void): ApolloContact {
    const labelIds = toStringArray(item.label_ids);
    return {
        id: stringOr(item.id, ''),
        firstName: stringOr(item.first_name, ''),
        lastName: stringOr(item.last_name, ''),
        name: stringOr(item.name, ''),
        title: stringOr(item.title, ''),
        email: stringOr(item.email, ''),
        // Apollo returns either a flat `organization_name` or a nested `organization.name`.
        organizationName: stringOr(
            item.organization_name,
            isRecord(item.organization) ? stringOr(item.organization.name, '') : '',
        ),
        labelIds,
        labelNames: resolveLabelNames(labelIds, idToName, onUnresolved),
    };
}

function mapPerson(item: Record<string, unknown>): ApolloPerson {
    const org = isRecord(item.organization) ? item.organization : {};
    return {
        id: stringOr(item.id, ''),
        firstName: stringOr(item.first_name, ''),
        lastName: stringOr(item.last_name, ''),
        name: stringOr(item.name, ''),
        title: stringOr(item.title, ''),
        linkedinUrl: stringOr(item.linkedin_url, ''),
        organizationId: stringOrNull(item.organization_id) ?? stringOrNull(org.id),
        organizationName: stringOr(item.organization_name, stringOr(org.name, '')),
    };
}

/** Clamp paging into Apollo's bounds, defaulting drain-safe (quirk #3). */
function normalizePaging(paging?: ApolloPagingOptions): { page: number; perPage: number } {
    const page = Math.min(Math.max(numberOr(paging?.page, 1), 1), MAX_PAGE);
    const perPage = Math.min(Math.max(numberOr(paging?.perPage, MAX_PER_PAGE), 1), MAX_PER_PAGE);
    return { page, perPage };
}

/**
 * Apollo.io list/search client. See the module doc, and the quirk list on
 * `apollo-lists.types.ts`, for the behaviours it encodes.
 */
export class ApolloRESTClient implements IApolloRESTClient {
    private readonly apiKey: string;
    private readonly fetchImpl: typeof fetch;
    /**
     * The label id↔name maps, built on first use and cached for the instance
     * lifetime (quirk #5). One labels call per client, shared by every search and
     * move. No TTL: a single drain or move operation uses one instance, and
     * labels do not churn mid-operation. Construct a new client to see label
     * changes made since.
     */
    private labelMaps: LabelMaps | null = null;

    constructor(apiKey: string, options?: ApolloRESTClientOptions) {
        if (!apiKey || apiKey.trim().length === 0) {
            throw new Error('ApolloRESTClient: apiKey is required');
        }
        this.apiKey = apiKey;
        // Bind global fetch so it keeps its expected `this` when not injected.
        this.fetchImpl = options?.fetchImpl ?? fetch.bind(globalThis);
    }

    // ─── HTTP ────────────────────────────────────────────────────────────────

    /**
     * Issue one request and return the parsed body. A non-2xx throws with the
     * method, path, status and whatever detail Apollo supplied; a 403 on a
     * master-key operation throws the master-key explanation instead (quirk #4).
     * Nothing is swallowed — a body that will not parse still surfaces its text.
     */
    private async request(args: {
        method: 'GET' | 'POST' | 'PATCH';
        path: string;
        context: string;
        body?: unknown;
        /** When true, a 403 is reported as the master-key requirement (quirk #4). */
        masterKeyOp?: boolean;
    }): Promise<unknown> {
        const { method, path, context, body, masterKeyOp } = args;
        const url = `${ApolloRESTEndpoint}${path}`;
        const headers: Record<string, string> = {
            'X-Api-Key': this.apiKey,
            accept: 'application/json',
        };
        if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await this.fetchImpl(url, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            let rawText = '';
            let detail = '';
            try {
                rawText = await response.text();
                const parsed: unknown = JSON.parse(rawText);
                if (isRecord(parsed)) {
                    detail = stringOr(parsed.error, stringOr(parsed.message, ''));
                }
            } catch {
                // Body was not JSON. The error thrown below still carries rawText,
                // so nothing is lost here.
            }
            if (response.status === 403 && masterKeyOp) {
                const message =
                    `ApolloRESTClient.${context}: ${method} ${path} returned HTTP 403. ` +
                    `This endpoint requires a MASTER Apollo API key — scoped keys 403 on label reads/writes ` +
                    `and on account/contact updates.` +
                    (detail ? ` (${detail})` : '');
                LogError(message);
                throw new Error(message);
            }
            const fallback = detail || rawText.slice(0, 500);
            const message = `ApolloRESTClient.${context}: ${method} ${path} failed with HTTP ${response.status}${fallback ? ` — ${fallback}` : ''}`;
            LogError(message);
            throw new Error(message);
        }

        try {
            return (await response.json()) as unknown;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            const message = `ApolloRESTClient.${context}: ${method} ${path} returned a non-JSON body: ${msg}`;
            LogError(message);
            throw new Error(message);
        }
    }

    // ─── Labels ──────────────────────────────────────────────────────────────

    /**
     * Every label, account lists and contact lists alike. Master key required.
     * Apollo returns either a bare array or a `{ labels: [...] }` envelope
     * depending on the account; both are accepted.
     */
    public async listLabels(): Promise<ApolloLabel[]> {
        const data = await this.request({ method: 'GET', path: '/labels', context: 'listLabels', masterKeyOp: true });
        const arr = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.labels) ? data.labels : null;
        if (arr === null) {
            throw new Error('ApolloRESTClient.listLabels: unexpected response shape — expected an array of labels or { labels: [...] }');
        }
        return arr.filter(isRecord).map((item): ApolloLabel => ({
            id: stringOr(item.id, ''),
            name: stringOr(item.name, ''),
            cachedCount: numberOr(item.cached_count, 0),
            // Apollo's field is `modality`; surfaced as `kind`.
            kind: stringOr(item.modality, 'unknown'),
            createdAt: stringOr(item.created_at, ''),
            updatedAt: stringOr(item.updated_at, ''),
        }));
    }

    /**
     * Create a label. Master key required.
     *
     * `modality` is not optional to Apollo despite reading like it should be:
     * posting without it returns HTTP 422 "Please enter a non-empty modality!".
     * It defaults to 'contacts' here because a people list is the common case.
     *
     * The create response shape is not pinned in Apollo's docs, so a bare label
     * object, a `{ label: {...} }` envelope and a `{ labels: [...] }` envelope
     * are all accepted — mirroring how {@link listLabels} tolerates two read
     * shapes. A shape none of those match throws rather than returning a label
     * with an empty id, which would then be written into a membership array.
     */
    public async createLabel(name: string, modality: 'contacts' | 'accounts' = 'contacts'): Promise<ApolloLabel> {
        const trimmed = name.trim();
        if (trimmed.length === 0) {
            throw new Error('ApolloRESTClient.createLabel: name is required');
        }
        const data = await this.request({
            method: 'POST',
            path: '/labels',
            context: 'createLabel',
            body: { name: trimmed, modality },
            masterKeyOp: true,
        });
        const raw: unknown = isRecord(data) && isRecord(data.label)
            ? data.label
            : isRecord(data) && Array.isArray(data.labels) && data.labels.length > 0
                ? data.labels[0]
                : data;
        if (!isRecord(raw)) {
            throw new Error(
                'ApolloRESTClient.createLabel: unexpected response shape — expected a label object, { label: {...} }, or { labels: [...] }',
            );
        }
        const id = stringOr(raw.id, '');
        if (id.length === 0) {
            throw new Error('ApolloRESTClient.createLabel: response carried no label id — cannot confirm the label was created');
        }
        return {
            id,
            name: stringOr(raw.name, trimmed),
            cachedCount: numberOr(raw.cached_count, 0),
            kind: stringOr(raw.modality, 'unknown'),
            createdAt: stringOr(raw.created_at, ''),
            updatedAt: stringOr(raw.updated_at, ''),
        };
    }

    /**
     * Resolve a label by exact name, case-insensitive; null when nothing matches.
     * This is how a human-supplied list name becomes the id a search filter needs.
     */
    public async findLabelByName(name: string): Promise<ApolloLabel | null> {
        const target = name.trim().toLowerCase();
        if (target.length === 0) {
            throw new Error('ApolloRESTClient.findLabelByName: name is required');
        }
        const labels = await this.listLabels();
        return labels.find((l) => l.name.trim().toLowerCase() === target) ?? null;
    }

    /**
     * Build (once per instance) the id↔name maps that resolve search-response
     * `label_ids` into names (quirk #5). When two labels share a name — rare — the
     * last one wins in `nameToId`.
     */
    private async getLabelMaps(): Promise<LabelMaps> {
        if (this.labelMaps !== null) {
            return this.labelMaps;
        }
        const labels = await this.listLabels();
        const idToName = new Map<string, string>();
        const nameToId = new Map<string, string>();
        for (const label of labels) {
            if (label.id.length > 0) {
                idToName.set(label.id, label.name);
            }
            if (label.name.length > 0) {
                nameToId.set(label.name, label.id);
            }
        }
        this.labelMaps = { idToName, nameToId };
        return this.labelMaps;
    }

    /** One aggregated warning for label ids that did not resolve to a name (quirk #5). */
    private warnUnresolvedLabels(context: string, unresolved: Set<string>): void {
        if (unresolved.size > 0) {
            LogStatus(
                `ApolloRESTClient.${context}: ${unresolved.size} label id(s) had no matching label and were dropped from labelNames ` +
                `(the raw ids stay on labelIds): ${[...unresolved].join(', ')}`,
            );
        }
    }

    // ─── Searches ────────────────────────────────────────────────────────────

    /**
     * One page of saved accounts. Paging defaults to page 1 — when draining a
     * list, never advance (quirk #3).
     */
    public async searchAccounts(filter: ApolloAccountSearchFilter, paging?: ApolloPagingOptions): Promise<ApolloAccountsPage> {
        const { page, perPage } = normalizePaging(paging);
        const body: Record<string, unknown> = { page, per_page: perPage };
        if (filter.labelIds && filter.labelIds.length > 0) body.account_label_ids = filter.labelIds;
        if (filter.keywords) body.q_organization_name = filter.keywords;

        const { idToName } = await this.getLabelMaps();
        const data = await this.request({ method: 'POST', path: '/accounts/search', context: 'searchAccounts', body });
        if (!isRecord(data)) {
            throw new Error('ApolloRESTClient.searchAccounts: unexpected response shape — expected an object with accounts + pagination');
        }
        // Saved-account search returns `accounts`; some responses use `organizations`.
        const rows = Array.isArray(data.accounts) ? data.accounts : Array.isArray(data.organizations) ? data.organizations : [];
        const unresolved = new Set<string>();
        const accounts = rows.filter(isRecord).map((item) => mapAccount(item, idToName, (id) => unresolved.add(id)));
        this.warnUnresolvedLabels('searchAccounts', unresolved);
        return { accounts, pagination: mapPagination(data.pagination) };
    }

    /** One page of saved contacts. Same drain-page-1 default as {@link searchAccounts}. */
    public async searchContacts(filter: ApolloContactSearchFilter, paging?: ApolloPagingOptions): Promise<ApolloContactsPage> {
        const { page, perPage } = normalizePaging(paging);
        const body: Record<string, unknown> = { page, per_page: perPage };
        if (filter.labelIds && filter.labelIds.length > 0) body.contact_label_ids = filter.labelIds;
        if (filter.keywords) body.q_keywords = filter.keywords;

        const { idToName } = await this.getLabelMaps();
        const data = await this.request({ method: 'POST', path: '/contacts/search', context: 'searchContacts', body });
        if (!isRecord(data)) {
            throw new Error('ApolloRESTClient.searchContacts: unexpected response shape — expected an object with contacts + pagination');
        }
        const rows = Array.isArray(data.contacts) ? data.contacts : [];
        const unresolved = new Set<string>();
        const contacts = rows.filter(isRecord).map((item) => mapContact(item, idToName, (id) => unresolved.add(id)));
        this.warnUnresolvedLabels('searchContacts', unresolved);
        return { contacts, pagination: mapPagination(data.pagination) };
    }

    /**
     * One page of prospecting people — net-new, not your saved contacts. Apollo
     * does not return emails or phones here by design.
     *
     * Unlike the two searches above, this one does not need the label maps: the
     * prospecting response carries no memberships, so fetching them would be a
     * wasted master-key call on a read a scoped key can otherwise serve.
     */
    public async searchPeople(filter: ApolloPeopleSearchFilter, paging?: ApolloPagingOptions): Promise<ApolloPeoplePage> {
        const { page, perPage } = normalizePaging(paging);
        const body: Record<string, unknown> = { page, per_page: perPage };
        if (filter.organizationDomains && filter.organizationDomains.length > 0) {
            body.q_organization_domains_list = filter.organizationDomains;
        }
        if (filter.organizationIds && filter.organizationIds.length > 0) body.organization_ids = filter.organizationIds;
        if (filter.titles && filter.titles.length > 0) body.person_titles = filter.titles;
        if (filter.seniorities && filter.seniorities.length > 0) body.person_seniorities = filter.seniorities;

        const data = await this.request({ method: 'POST', path: '/mixed_people/api_search', context: 'searchPeople', body });
        if (!isRecord(data)) {
            throw new Error('ApolloRESTClient.searchPeople: unexpected response shape — expected an object with people + pagination');
        }
        // Matches arrive under `people`, and historically under `contacts`.
        const rows = Array.isArray(data.people) ? data.people : Array.isArray(data.contacts) ? data.contacts : [];
        return { people: rows.filter(isRecord).map(mapPerson), pagination: mapPagination(data.pagination) };
    }

    // ─── Label writes: the two-step, label-preserving move ───────────────────

    /**
     * Replace one account's label set with `labelNames` — which must be the
     * COMPLETE intended set, because Apollo overwrites wholesale (quirk #1).
     * Master key required.
     */
    private async updateAccountLabels(accountId: string, labelNames: string[]): Promise<void> {
        if (!accountId || accountId.trim().length === 0) {
            throw new Error('ApolloRESTClient.updateAccountLabels: accountId is required');
        }
        await this.request({
            method: 'PATCH',
            path: `/accounts/${encodeURIComponent(accountId)}`,
            context: 'updateAccountLabels',
            body: { label_names: labelNames },
            masterKeyOp: true,
        });
    }

    /** The same for one contact. Identical full-replace and master-key semantics. */
    private async updateContactLabels(contactId: string, labelNames: string[]): Promise<void> {
        if (!contactId || contactId.trim().length === 0) {
            throw new Error('ApolloRESTClient.updateContactLabels: contactId is required');
        }
        await this.request({
            method: 'PATCH',
            path: `/contacts/${encodeURIComponent(contactId)}`,
            context: 'updateContactLabels',
            body: { label_names: labelNames },
            masterKeyOp: true,
        });
    }

    /**
     * Re-read one account's current labels for the verify pass (quirk #2), by
     * searching the destination list and matching on id. Null when the record is
     * not on that page, which is not the same as "the remove worked" — hence
     * `possiblyStuck` stays null rather than becoming false.
     */
    private async readAccountLabels(accountId: string, toListLabelId: string | null): Promise<string[] | null> {
        const filter: ApolloAccountSearchFilter = toListLabelId ? { labelIds: [toListLabelId] } : {};
        const pageData = await this.searchAccounts(filter, { page: 1, perPage: MAX_PER_PAGE });
        const found = pageData.accounts.find((a) => a.id === accountId);
        return found ? found.labelNames : null;
    }

    private async readContactLabels(contactId: string, toListLabelId: string | null): Promise<string[] | null> {
        const filter: ApolloContactSearchFilter = toListLabelId ? { labelIds: [toListLabelId] } : {};
        const pageData = await this.searchContacts(filter, { page: 1, perPage: MAX_PER_PAGE });
        const found = pageData.contacts.find((c) => c.id === contactId);
        return found ? found.labelNames : null;
    }

    /**
     * The ADD phase's label set: current ∪ {toList}. Idempotent — adding a label
     * the record already carries is a set no-op, so re-running a partial move
     * does not duplicate anything.
     */
    private addPhaseLabels(currentLabels: string[], toList: string): string[] {
        return currentLabels.includes(toList) ? [...currentLabels] : [...currentLabels, toList];
    }

    /**
     * The REMOVE phase's label set: (current ∪ {toList}) \ {fromList}.
     *
     * It is computed from the post-add state rather than from `current` so that
     * the destination label survives the second write. Deriving it from `current`
     * alone would add the record to the destination and then immediately take it
     * back out.
     */
    private removePhaseLabels(currentLabels: string[], fromList: string, toList: string): string[] {
        const postAdd = this.addPhaseLabels(currentLabels, toList);
        return postAdd.filter((l) => l !== fromList);
    }

    /**
     * The move engine, shared by accounts and contacts through the injected
     * update/read closures so the label-preservation math and the stuck detection
     * exist in exactly one place.
     */
    private async moveRecords<T extends { id: string; labelNames: string[] }>(
        records: T[],
        fromList: string,
        toList: string,
        ops: {
            update: (id: string, labels: string[]) => Promise<void>;
            readLabels: (id: string) => Promise<string[] | null>;
            kind: 'accounts' | 'contacts';
        },
        options?: { verify?: boolean },
    ): Promise<ApolloMoveResult> {
        if (fromList.trim().length === 0 || toList.trim().length === 0) {
            throw new Error('ApolloRESTClient.moveRecords: fromList and toList are both required');
        }
        if (fromList === toList) {
            throw new Error(`ApolloRESTClient.moveRecords: fromList and toList are identical ('${fromList}') — nothing to move`);
        }

        const verify = options?.verify === true;
        const items: ApolloMoveItemResult[] = [];
        let movedCount = 0;
        let failedCount = 0;
        let possiblyStuckCount = 0;

        for (const record of records) {
            const item: ApolloMoveItemResult = { id: record.id, added: false, removed: false, possiblyStuck: null, error: null };

            // Phase 1 — add the destination, preserving every current label (quirk #1).
            try {
                await ops.update(record.id, this.addPhaseLabels(record.labelNames, toList));
                item.added = true;
            } catch (error) {
                item.error = `add phase: ${error instanceof Error ? error.message : String(error)}`;
                failedCount++;
                items.push(item);
                // Never attempt the remove when the add failed — that would strip the
                // record from the source list without it having reached the destination.
                continue;
            }

            // Phase 2 — remove the source, from the post-add state (quirk #1).
            try {
                await ops.update(record.id, this.removePhaseLabels(record.labelNames, fromList, toList));
                item.removed = true;
            } catch (error) {
                item.error = `remove phase: ${error instanceof Error ? error.message : String(error)}`;
                failedCount++;
                items.push(item);
                continue;
            }

            // Optional verify — catches Apollo's silent-fail removes (quirk #2).
            if (verify) {
                try {
                    const after = await ops.readLabels(record.id);
                    // A null read means the record was not on the destination page,
                    // which is not evidence that the remove worked — so the stuck
                    // state stays unknown rather than being reported as verified.
                    item.possiblyStuck = after === null ? null : after.includes(fromList);
                } catch (error) {
                    // A failed verify read is not a failed move. Note it and leave the
                    // stuck state unknown rather than guessing either way.
                    LogStatus(
                        `ApolloRESTClient.move(${ops.kind}): verify re-read failed for ${record.id} — leaving possiblyStuck=null: ` +
                        `${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            }

            if (item.possiblyStuck === true) {
                possiblyStuckCount++;
            } else {
                movedCount++;
            }
            items.push(item);
        }

        LogStatus(
            `ApolloRESTClient.move(${ops.kind}): '${fromList}' → '${toList}' — ${movedCount} moved, ` +
            `${possiblyStuckCount} possibly stuck (Apollo silent-fail, retried on the next drain), ${failedCount} failed of ${records.length}.`,
        );

        return { movedCount, failedCount, possiblyStuckCount, items };
    }

    /**
     * Move accounts between lists. The supplied accounts must carry current
     * `labelNames` from a fresh {@link searchAccounts} read — this method writes
     * whatever it is given as the intended set, so stale labels here mean real
     * memberships silently disappear.
     *
     * With `verify`, the destination list is re-read after each remove to flag
     * silent-fail records. Never deletes, never auto-retries.
     */
    public async moveAccounts(
        accounts: ApolloAccount[],
        fromList: string,
        toList: string,
        options?: { verify?: boolean },
    ): Promise<ApolloMoveResult> {
        // Resolve the destination label id once, for the verify re-reads.
        const toLabelId = options?.verify ? (await this.findLabelByName(toList))?.id ?? null : null;
        return this.moveRecords(
            accounts,
            fromList,
            toList,
            {
                update: (id, labels) => this.updateAccountLabels(id, labels),
                readLabels: (id) => this.readAccountLabels(id, toLabelId),
                kind: 'accounts',
            },
            options,
        );
    }

    /** Move contacts between lists. Same two-step and verify semantics as accounts. */
    public async moveContacts(
        contacts: ApolloContact[],
        fromList: string,
        toList: string,
        options?: { verify?: boolean },
    ): Promise<ApolloMoveResult> {
        const toLabelId = options?.verify ? (await this.findLabelByName(toList))?.id ?? null : null;
        return this.moveRecords(
            contacts,
            fromList,
            toList,
            {
                update: (id, labels) => this.updateContactLabels(id, labels),
                readLabels: (id) => this.readContactLabels(id, toLabelId),
                kind: 'contacts',
            },
            options,
        );
    }
}
