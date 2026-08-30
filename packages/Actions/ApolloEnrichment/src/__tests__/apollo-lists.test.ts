/**
 * Tests for the Apollo list, search and move surface.
 *
 * Two levels:
 *
 *   - The client is driven through a fake `fetch`, so the request bodies Apollo
 *     would receive are asserted directly. That matters more here than usual,
 *     because the dangerous behaviours are all about what is IN the request: a
 *     move that sends the wrong label array silently deletes memberships, and
 *     nothing about the response would reveal it.
 *   - The actions are driven with a fake client, so validation, list resolution
 *     and result shaping are exercised without a transport.
 *
 * Nothing here may reach api.apollo.io. A real call would spend credits on the
 * read side and mutate a real account's lists on the write side, with no undo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The only BaseAction behaviour these tests need is that Run() delegates to
// InternalRunAction; the real one drags in the whole actions engine.
vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {
        public async Run(params: unknown): Promise<unknown> {
            return (this as unknown as { InternalRunAction(p: unknown): Promise<unknown> }).InternalRunAction(params);
        }
        protected async InternalRunAction(): Promise<unknown> {
            return {};
        }
    },
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
}));

/**
 * `CredentialEngine` is mocked, not exercised: it extends `BaseEngine` and reaches for a provider,
 * which these suites deliberately do not have. What IS asserted is that the credential path goes
 * THROUGH the engine — `getCredential` is a spy, so a regression back to a raw `RunView` would show
 * up as this never being called.
 */
vi.mock('@memberjunction/credentials', () => {
  const getCredential = vi.fn(async () => ({ values: { accessToken: 'cred-token', apiKey: 'cred-apollo-key' } }));
  return {
    CredentialEngine: {
      Instance: {
        Config: vi.fn(async () => undefined),
        Credentials: [{ ID: 'cred-1', Name: 'Test Credential', IsActive: true }],
        getCredential,
      },
    },
    __getCredentialSpy: getCredential,
  };
});

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    Metadata: class Metadata {
        async GetEntityObject(): Promise<unknown> {
            throw new Error('Metadata should not be reached in these tests');
        }
    },
    RunView: class RunView {
        async RunView(): Promise<unknown> {
            throw new Error('RunView should not be reached in these tests');
        }
    },
}));

// config.ts reads APOLLO_API_KEY at module load, so it has to be set before the
// imports below rather than in a beforeEach.
process.env.APOLLO_API_KEY = 'env-key';

const { ApolloRESTClient } = await import('../lists/ApolloRESTClient.js');
const { extractApolloKey } = await import('../lists/credentials.js');
const {
    getParam,
    getParamRaw,
    parseOptionalBooleanParam,
    parseOptionalIntegerParam,
    parseStringArrayParam,
} = await import('../lists/params.js');
const { ApolloGetListsAction, ApolloCreateListAction } = await import('../lists/ApolloListActions.js');
const { ApolloGetListAccountsAction, ApolloGetListContactsAction, ApolloSearchPeopleAction } = await import(
    '../lists/ApolloSearchActions.js'
);
const { ApolloMoveListAccountsAction, ApolloMoveListContactsAction } = await import('../lists/ApolloMoveActions.js');

import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import type {
    ApolloAccount,
    ApolloAccountsPage,
    ApolloContact,
    ApolloContactsPage,
    ApolloLabel,
    ApolloMoveResult,
    ApolloPeoplePage,
    IApolloRESTClient,
} from '../generic/apollo-lists.types.js';

// ── Transport fake ────────────────────────────────────────────────────────────

interface Call {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: Record<string, unknown> | null;
}

/** A canned reply. `status` defaults to 200. */
interface Reply {
    status?: number;
    body?: unknown;
    /** Raw text instead of JSON, for the non-JSON-body case. */
    text?: string;
}

function fakeFetch(replies: Reply[] | ((call: Call, index: number) => Reply)): {
    fetchImpl: typeof fetch;
    calls: Call[];
} {
    const calls: Call[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
        const call: Call = {
            url,
            method: String(init.method),
            headers: init.headers as Record<string, string>,
            body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
        };
        calls.push(call);
        const reply = typeof replies === 'function' ? replies(call, calls.length - 1) : replies[calls.length - 1];
        if (!reply) throw new Error(`fakeFetch: no reply configured for call ${calls.length} (${call.method} ${call.url})`);
        const status = reply.status ?? 200;
        return {
            ok: status >= 200 && status < 300,
            status,
            json: async () => {
                if (reply.text !== undefined) throw new Error('Unexpected end of JSON input');
                return reply.body;
            },
            text: async () => (reply.text !== undefined ? reply.text : JSON.stringify(reply.body)),
        };
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
}

const LABELS_BODY = {
    labels: [
        { id: 'lab-cold', name: 'Cold', modality: 'accounts', cached_count: 40, created_at: 'c1', updated_at: 'u1' },
        { id: 'lab-warm', name: 'Warm', modality: 'accounts', cached_count: 3, created_at: 'c2', updated_at: 'u2' },
        { id: 'lab-keep', name: 'Do Not Touch', modality: 'accounts', cached_count: 9, created_at: 'c3', updated_at: 'u3' },
        { id: 'lab-people', name: 'Qualified People', modality: 'contacts', cached_count: 12, created_at: 'c4', updated_at: 'u4' },
    ],
};

function client(replies: Reply[] | ((call: Call, index: number) => Reply)) {
    const { fetchImpl, calls } = fakeFetch(replies);
    return { c: new ApolloRESTClient('key-1', { fetchImpl }), calls };
}

// ── Client: transport ─────────────────────────────────────────────────────────

describe('ApolloRESTClient transport', () => {
    it('sends the key as X-Api-Key against the /api/v1 base path', async () => {
        const { c, calls } = client([{ body: LABELS_BODY }]);
        await c.listLabels();
        expect(calls[0].url).toBe('https://api.apollo.io/api/v1/labels');
        expect(calls[0].headers['X-Api-Key']).toBe('key-1');
    });

    it('refuses to construct without a key', () => {
        expect(() => new ApolloRESTClient('')).toThrow(/apiKey is required/);
        expect(() => new ApolloRESTClient('   ')).toThrow(/apiKey is required/);
    });

    it('explains that a 403 on a label read means a scoped key, not a wrong one', async () => {
        const { c } = client([{ status: 403, body: { error: 'Need master api key' } }]);
        await expect(c.listLabels()).rejects.toThrow(/requires a MASTER Apollo API key/);
    });

    it('reports a plain failure with its status and Apollo detail', async () => {
        const { c } = client([{ status: 422, body: { error: 'Please enter a non-empty modality!' } }]);
        await expect(c.createLabel('X')).rejects.toThrow(/HTTP 422 — Please enter a non-empty modality!/);
    });

    it('surfaces a body that is not JSON rather than reporting an empty response', async () => {
        const { c } = client([{ text: '<html>gateway timeout</html>' }]);
        await expect(c.listLabels()).rejects.toThrow(/non-JSON body/);
    });

    it('keeps the raw body text when an error response is not JSON either', async () => {
        const { c } = client([{ status: 502, text: 'upstream connect error' }]);
        await expect(c.listLabels()).rejects.toThrow(/HTTP 502 — upstream connect error/);
    });
});

// ── Client: labels ────────────────────────────────────────────────────────────

describe('ApolloRESTClient labels', () => {
    it('reads the enveloped and the bare array shape alike', async () => {
        const enveloped = client([{ body: LABELS_BODY }]);
        expect((await enveloped.c.listLabels())).toHaveLength(4);

        const bare = client([{ body: LABELS_BODY.labels }]);
        expect((await bare.c.listLabels())).toHaveLength(4);
    });

    it('surfaces Apollo modality as kind', async () => {
        const { c } = client([{ body: LABELS_BODY }]);
        const labels = await c.listLabels();
        expect(labels[0]).toEqual({
            id: 'lab-cold',
            name: 'Cold',
            kind: 'accounts',
            cachedCount: 40,
            createdAt: 'c1',
            updatedAt: 'u1',
        });
    });

    it('rejects a response that is neither an array nor an envelope', async () => {
        const { c } = client([{ body: { data: 'nope' } }]);
        await expect(c.listLabels()).rejects.toThrow(/unexpected response shape/);
    });

    it('sends the modality Apollo requires on create', async () => {
        const { c, calls } = client([{ body: { id: 'lab-new', name: 'Fresh', modality: 'contacts' } }]);
        await c.createLabel('Fresh');
        expect(calls[0].method).toBe('POST');
        expect(calls[0].body).toEqual({ name: 'Fresh', modality: 'contacts' });
    });

    it('creates an accounts label when asked', async () => {
        const { c, calls } = client([{ body: { id: 'lab-new', name: 'Fresh', modality: 'accounts' } }]);
        const created = await c.createLabel('Fresh', 'accounts');
        expect(calls[0].body?.modality).toBe('accounts');
        expect(created.kind).toBe('accounts');
    });

    it('accepts every create response shape Apollo has been seen to use', async () => {
        for (const body of [
            { id: 'lab-new', name: 'Fresh' },
            { label: { id: 'lab-new', name: 'Fresh' } },
            { labels: [{ id: 'lab-new', name: 'Fresh' }] },
        ]) {
            const { c } = client([{ body }]);
            expect((await c.createLabel('Fresh')).id).toBe('lab-new');
        }
    });

    it('refuses a create response with no id rather than returning a label that does not exist', async () => {
        // An empty id would be written into a later label_names array as ''.
        const { c } = client([{ body: { name: 'Fresh' } }]);
        await expect(c.createLabel('Fresh')).rejects.toThrow(/carried no label id/);
    });

    it('requires a name to create or to look up', async () => {
        const { c } = client([]);
        await expect(c.createLabel('   ')).rejects.toThrow(/name is required/);
        await expect(c.findLabelByName('  ')).rejects.toThrow(/name is required/);
    });

    it('matches a label name case-insensitively and returns null for no match', async () => {
        const found = client([{ body: LABELS_BODY }]);
        expect((await found.c.findLabelByName('  cOLD '))?.id).toBe('lab-cold');

        const missing = client([{ body: LABELS_BODY }]);
        expect(await missing.c.findLabelByName('Nonexistent')).toBeNull();
    });
});

// ── Client: searches ──────────────────────────────────────────────────────────

describe('ApolloRESTClient searches', () => {
    const accountsBody = {
        accounts: [
            { id: 'acc-1', name: 'Acme', primary_domain: 'acme.com', label_ids: ['lab-cold', 'lab-keep'] },
            { id: 'acc-2', name: 'Globex', primary_domain: 'globex.com', label_ids: ['lab-cold'] },
        ],
        pagination: { page: 1, per_page: 100, total_entries: 2, total_pages: 1 },
    };

    it('resolves the label ids the search returns into the names a move needs', async () => {
        // The search payload carries no label_names at all — without this resolution
        // the move math would have nothing to preserve.
        const { c } = client([{ body: LABELS_BODY }, { body: accountsBody }]);
        const page = await c.searchAccounts({ labelIds: ['lab-cold'] });
        expect(page.accounts[0].labelIds).toEqual(['lab-cold', 'lab-keep']);
        expect(page.accounts[0].labelNames).toEqual(['Cold', 'Do Not Touch']);
    });

    it('drops a label id with no matching label instead of passing it through as a name', async () => {
        // A raw id inside a later label_names write would create a label named after a hex string.
        const body = {
            accounts: [{ id: 'acc-1', name: 'Acme', label_ids: ['lab-cold', 'lab-deleted'] }],
            pagination: {},
        };
        const { c } = client([{ body: LABELS_BODY }, { body }]);
        const page = await c.searchAccounts({});
        expect(page.accounts[0].labelNames).toEqual(['Cold']);
        expect(page.accounts[0].labelIds).toContain('lab-deleted');
    });

    it('fetches the labels once and reuses them across searches', async () => {
        const { c, calls } = client([{ body: LABELS_BODY }, { body: accountsBody }, { body: accountsBody }]);
        await c.searchAccounts({});
        await c.searchAccounts({});
        expect(calls.filter((call) => call.url.endsWith('/labels'))).toHaveLength(1);
    });

    it('maps the account filter onto Apollo field names', async () => {
        const { c, calls } = client([{ body: LABELS_BODY }, { body: accountsBody }]);
        await c.searchAccounts({ labelIds: ['lab-cold'], keywords: 'assoc' });
        expect(calls[1].url).toBe('https://api.apollo.io/api/v1/accounts/search');
        expect(calls[1].body).toEqual({
            page: 1,
            per_page: 100,
            account_label_ids: ['lab-cold'],
            q_organization_name: 'assoc',
        });
    });

    it('maps the contact filter onto its own differently-named keyword field', async () => {
        const body = { contacts: [], pagination: {} };
        const { c, calls } = client([{ body: LABELS_BODY }, { body }]);
        await c.searchContacts({ labelIds: ['lab-people'], keywords: 'director' });
        expect(calls[1].body).toEqual({
            page: 1,
            per_page: 100,
            contact_label_ids: ['lab-people'],
            q_keywords: 'director',
        });
    });

    it('omits filters that were not supplied rather than sending empty arrays', async () => {
        const { c, calls } = client([{ body: LABELS_BODY }, { body: accountsBody }]);
        await c.searchAccounts({ labelIds: [], keywords: '' });
        expect(calls[1].body).toEqual({ page: 1, per_page: 100 });
    });

    it('defaults to page 1, which is what makes a drain correct', async () => {
        const { c, calls } = client([{ body: LABELS_BODY }, { body: accountsBody }]);
        await c.searchAccounts({});
        expect(calls[1].body?.page).toBe(1);
    });

    it("clamps paging into Apollo's bounds", async () => {
        const { c, calls } = client([{ body: LABELS_BODY }, { body: accountsBody }, { body: accountsBody }]);
        await c.searchAccounts({}, { page: 9999, perPage: 9999 });
        expect(calls[1].body).toMatchObject({ page: 500, per_page: 100 });
        await c.searchAccounts({}, { page: 0, perPage: 0 });
        expect(calls[2].body).toMatchObject({ page: 1, per_page: 1 });
    });

    it('reads the pagination envelope', async () => {
        const { c } = client([{ body: LABELS_BODY }, { body: accountsBody }]);
        const page = await c.searchAccounts({});
        expect(page.pagination).toEqual({ page: 1, perPage: 100, totalEntries: 2, totalPages: 1 });
    });

    it('defaults a missing pagination envelope rather than failing the page', async () => {
        const { c } = client([{ body: LABELS_BODY }, { body: { accounts: [] } }]);
        expect((await c.searchAccounts({})).pagination).toEqual({ page: 1, perPage: 0, totalEntries: 0, totalPages: 0 });
    });

    it('accepts accounts under the organizations key too', async () => {
        const body = { organizations: [{ id: 'acc-9', name: 'Initech' }], pagination: {} };
        const { c } = client([{ body: LABELS_BODY }, { body }]);
        expect((await c.searchAccounts({})).accounts[0].id).toBe('acc-9');
    });

    it('reads a contact employer from either the flat or the nested field', async () => {
        const body = {
            contacts: [
                { id: 'con-1', first_name: 'A', last_name: 'B', organization_name: 'Flat Co' },
                { id: 'con-2', first_name: 'C', last_name: 'D', organization: { name: 'Nested Co' } },
            ],
            pagination: {},
        };
        const { c } = client([{ body: LABELS_BODY }, { body }]);
        const page = await c.searchContacts({});
        expect(page.contacts.map((x) => x.organizationName)).toEqual(['Flat Co', 'Nested Co']);
    });

    it('maps the people filter onto its four Apollo fields', async () => {
        const body = { people: [], pagination: {} };
        const { c, calls } = client([{ body }]);
        await c.searchPeople({
            organizationDomains: ['acme.com'],
            organizationIds: ['org-1'],
            titles: ['VP of Marketing'],
            seniorities: ['vp'],
        });
        expect(calls[0].url).toBe('https://api.apollo.io/api/v1/mixed_people/api_search');
        expect(calls[0].body).toEqual({
            page: 1,
            per_page: 100,
            q_organization_domains_list: ['acme.com'],
            organization_ids: ['org-1'],
            person_titles: ['VP of Marketing'],
            person_seniorities: ['vp'],
        });
    });

    it('does not spend a master-key labels call on a prospecting search', async () => {
        // The prospecting response carries no memberships, so there is nothing to resolve.
        const { c, calls } = client([{ body: { people: [], pagination: {} } }]);
        await c.searchPeople({ titles: ['CEO'] });
        expect(calls).toHaveLength(1);
        expect(calls[0].url).not.toContain('/labels');
    });

    it('accepts people under the legacy contacts key', async () => {
        const body = { contacts: [{ id: 'p-1', first_name: 'E', organization: { id: 'org-2', name: 'Umbrella' } }], pagination: {} };
        const { c } = client([{ body }]);
        const page = await c.searchPeople({ titles: ['CEO'] });
        expect(page.people[0].organizationId).toBe('org-2');
        expect(page.people[0].organizationName).toBe('Umbrella');
    });

    it('reports a null organization id rather than an empty string when absent', async () => {
        const { c } = client([{ body: { people: [{ id: 'p-1' }], pagination: {} } }]);
        expect((await c.searchPeople({ titles: ['CEO'] })).people[0].organizationId).toBeNull();
    });

    it('rejects a search response that is not an object', async () => {
        const { c } = client([{ body: LABELS_BODY }, { body: [] }]);
        await expect(c.searchAccounts({})).rejects.toThrow(/unexpected response shape/);
    });
});

// ── Client: moves ─────────────────────────────────────────────────────────────

describe('ApolloRESTClient moves', () => {
    const acme: ApolloAccount = {
        id: 'acc-1',
        name: 'Acme',
        primaryDomain: 'acme.com',
        labelIds: ['lab-cold', 'lab-keep'],
        labelNames: ['Cold', 'Do Not Touch'],
    };

    /**
     * Replies for a move with verify: labels (for the destination id) → PATCH →
     * PATCH → labels + destination-list search.
     *
     * `verifyLabels` is the record's label_ids as the verify read finds them, or
     * `null` for "the record is not on the destination page at all" — a genuinely
     * different case from "on the page with no labels".
     */
    function moveReplies(verifyLabels: string[] | null): (call: Call) => Reply {
        return (call) => {
            if (call.url.endsWith('/labels')) return { body: LABELS_BODY };
            if (call.method === 'PATCH') return { body: { account: { id: 'acc-1' } } };
            return {
                body: {
                    accounts: verifyLabels === null ? [] : [{ id: 'acc-1', name: 'Acme', label_ids: verifyLabels }],
                    pagination: {},
                },
            };
        };
    }

    it('preserves every other membership on both writes', async () => {
        // This is the whole point of the two-step: Apollo replaces the array, so a
        // bare ['Warm'] would silently drop 'Do Not Touch'.
        const { c, calls } = client(moveReplies(['lab-warm', 'lab-keep']));
        await c.moveAccounts([acme], 'Cold', 'Warm', { verify: true });

        const patches = calls.filter((x) => x.method === 'PATCH');
        expect(patches).toHaveLength(2);
        expect(patches[0].body).toEqual({ label_names: ['Cold', 'Do Not Touch', 'Warm'] });
        expect(patches[1].body).toEqual({ label_names: ['Do Not Touch', 'Warm'] });
    });

    it('keeps the destination label on the remove write', async () => {
        // Computing the remove set from the pre-add state would add then immediately un-add.
        const { c, calls } = client(moveReplies(['lab-warm', 'lab-keep']));
        await c.moveAccounts([acme], 'Cold', 'Warm', { verify: true });
        expect(calls.filter((x) => x.method === 'PATCH')[1].body?.label_names).toContain('Warm');
    });

    it('patches the record by id on the account path', async () => {
        const { c, calls } = client(moveReplies(['lab-warm']));
        await c.moveAccounts([acme], 'Cold', 'Warm', { verify: true });
        expect(calls.find((x) => x.method === 'PATCH')?.url).toBe('https://api.apollo.io/api/v1/accounts/acc-1');
    });

    it('flags a record whose source label survived the remove', async () => {
        const { c } = client(moveReplies(['lab-cold', 'lab-warm']));
        const result = await c.moveAccounts([acme], 'Cold', 'Warm', { verify: true });
        expect(result.possiblyStuckCount).toBe(1);
        expect(result.movedCount).toBe(0);
        expect(result.items[0]).toMatchObject({ added: true, removed: true, possiblyStuck: true, error: null });
    });

    it('does not retry a stuck record', async () => {
        // An immediate retry flakes the same way; the next drain pass cleans it up.
        const { c, calls } = client(moveReplies(['lab-cold', 'lab-warm']));
        await c.moveAccounts([acme], 'Cold', 'Warm', { verify: true });
        expect(calls.filter((x) => x.method === 'PATCH')).toHaveLength(2);
    });

    it('counts a clean move once the verify read confirms the source is gone', async () => {
        const { c } = client(moveReplies(['lab-warm', 'lab-keep']));
        const result = await c.moveAccounts([acme], 'Cold', 'Warm', { verify: true });
        expect(result).toMatchObject({ movedCount: 1, failedCount: 0, possiblyStuckCount: 0 });
        expect(result.items[0].possiblyStuck).toBe(false);
    });

    it('leaves the stuck state unknown when the record is not on the destination page', async () => {
        // Absent from page 1 is not evidence the remove worked, so it must not be
        // reported as verified-clean.
        const { c } = client(moveReplies(null));
        const result = await c.moveAccounts([acme], 'Cold', 'Warm', { verify: true });
        expect(result.items[0].possiblyStuck).toBeNull();
        expect(result.movedCount).toBe(1);
    });

    it('reports not-stuck only when it actually read the record back', async () => {
        // On the page, source label gone — the one case that is genuinely verified.
        const { c } = client(moveReplies(['lab-warm']));
        const result = await c.moveAccounts([acme], 'Cold', 'Warm', { verify: true });
        expect(result.items[0].possiblyStuck).toBe(false);
    });

    it('skips the verify read, and the label lookup it needs, when not asked to verify', async () => {
        const { c, calls } = client((call) => (call.method === 'PATCH' ? { body: {} } : { body: LABELS_BODY }));
        const result = await c.moveAccounts([acme], 'Cold', 'Warm');
        expect(calls.filter((x) => x.method !== 'PATCH')).toHaveLength(0);
        expect(result.items[0].possiblyStuck).toBeNull();
        expect(result.movedCount).toBe(1);
    });

    it('never removes the source label when the add failed', async () => {
        // Otherwise the record leaves the source list without reaching the destination.
        let patches = 0;
        const { c, calls } = client((call) => {
            if (call.url.endsWith('/labels')) return { body: LABELS_BODY };
            patches++;
            return { status: 500, body: { error: 'boom' } };
        });
        const result = await c.moveAccounts([acme], 'Cold', 'Warm', { verify: true });
        expect(patches).toBe(1);
        expect(calls.filter((x) => x.method === 'PATCH')).toHaveLength(1);
        expect(result).toMatchObject({ failedCount: 1, movedCount: 0 });
        expect(result.items[0]).toMatchObject({ added: false, removed: false });
        expect(result.items[0].error).toMatch(/^add phase:/);
    });

    it('reports a failed remove distinctly, since the record is now in both lists', async () => {
        let seen = 0;
        const { c } = client((call) => {
            if (call.url.endsWith('/labels')) return { body: LABELS_BODY };
            seen++;
            return seen === 1 ? { body: {} } : { status: 500, body: { error: 'boom' } };
        });
        const result = await c.moveAccounts([acme], 'Cold', 'Warm', { verify: true });
        expect(result.items[0]).toMatchObject({ added: true, removed: false });
        expect(result.items[0].error).toMatch(/^remove phase:/);
        expect(result.failedCount).toBe(1);
    });

    it('does not fail a move because the verify read failed', async () => {
        let seen = 0;
        const { c } = client((call) => {
            if (call.url.endsWith('/labels')) return { body: LABELS_BODY };
            if (call.method === 'PATCH') return { body: {} };
            seen++;
            return { status: 500, body: { error: 'search down' } };
        });
        const result = await c.moveAccounts([acme], 'Cold', 'Warm', { verify: true });
        expect(seen).toBe(1);
        expect(result).toMatchObject({ movedCount: 1, failedCount: 0 });
        expect(result.items[0].possiblyStuck).toBeNull();
    });

    it('adds the destination idempotently when the record already carries it', async () => {
        const both: ApolloAccount = { ...acme, labelNames: ['Cold', 'Warm'] };
        const { c, calls } = client(moveReplies(['lab-warm']));
        await c.moveAccounts([both], 'Cold', 'Warm', { verify: true });
        const patches = calls.filter((x) => x.method === 'PATCH');
        expect(patches[0].body).toEqual({ label_names: ['Cold', 'Warm'] });
        expect(patches[1].body).toEqual({ label_names: ['Warm'] });
    });

    it('refuses a move to the same list, and a move with a blank list name', async () => {
        const { c } = client([]);
        await expect(c.moveAccounts([acme], 'Cold', 'Cold')).rejects.toThrow(/identical/);
        await expect(c.moveAccounts([acme], '  ', 'Warm')).rejects.toThrow(/both required/);
    });

    it('returns an empty result for an empty batch without touching Apollo', async () => {
        const { c, calls } = client([]);
        const result = await c.moveAccounts([], 'Cold', 'Warm');
        expect(result).toEqual({ movedCount: 0, failedCount: 0, possiblyStuckCount: 0, items: [] });
        expect(calls).toHaveLength(0);
    });

    it('patches contacts on the contact path with the same label math', async () => {
        const contact: ApolloContact = {
            id: 'con-1',
            firstName: 'A',
            lastName: 'B',
            name: 'A B',
            title: 'VP',
            email: 'a@b.com',
            organizationName: 'Acme',
            labelIds: ['lab-people'],
            labelNames: ['Qualified People'],
        };
        const { c, calls } = client((call) => {
            if (call.url.endsWith('/labels')) return { body: LABELS_BODY };
            if (call.method === 'PATCH') return { body: {} };
            return { body: { contacts: [{ id: 'con-1', label_ids: ['lab-warm'] }], pagination: {} } };
        });
        const result = await c.moveContacts([contact], 'Qualified People', 'Warm', { verify: true });
        const patches = calls.filter((x) => x.method === 'PATCH');
        expect(patches[0].url).toBe('https://api.apollo.io/api/v1/contacts/con-1');
        expect(patches[0].body).toEqual({ label_names: ['Qualified People', 'Warm'] });
        expect(patches[1].body).toEqual({ label_names: ['Warm'] });
        expect(result.movedCount).toBe(1);
    });

    it('processes a batch in order, and one failed record does not stop the rest', async () => {
        const globex: ApolloAccount = { ...acme, id: 'acc-2', labelNames: ['Cold'] };
        const { c } = client((call) => {
            if (call.url.endsWith('/labels')) return { body: LABELS_BODY };
            if (call.method === 'PATCH') {
                return call.url.endsWith('acc-1') ? { status: 500, body: { error: 'boom' } } : { body: {} };
            }
            return { body: { accounts: [{ id: 'acc-2', label_ids: ['lab-warm'] }], pagination: {} } };
        });
        const result = await c.moveAccounts([acme, globex], 'Cold', 'Warm', { verify: true });
        expect(result).toMatchObject({ failedCount: 1, movedCount: 1 });
        expect(result.items.map((i) => i.id)).toEqual(['acc-1', 'acc-2']);
    });
});

// ── Params ────────────────────────────────────────────────────────────────────

describe('param parsing', () => {
    const withParams = (list: Array<{ Name: string; Value: unknown }>) =>
        ({ Params: list } as unknown as Parameters<typeof getParam>[0]);

    it('finds a param case-insensitively and trims it', () => {
        expect(getParam(withParams([{ Name: 'listname', Value: '  Cold  ' }]), 'ListName')).toBe('Cold');
    });

    it('treats whitespace as absent, so a required check catches a blank list name', () => {
        expect(getParam(withParams([{ Name: 'ListName', Value: '   ' }]), 'ListName')).toBeNull();
        expect(getParam(withParams([]), 'ListName')).toBeNull();
    });

    it('returns a raw value untouched, for the array/JSON/CSV parsers', () => {
        expect(getParamRaw(withParams([{ Name: 'Titles', Value: ['CEO'] }]), 'Titles')).toEqual(['CEO']);
    });

    it('accepts a list as an array, a JSON string, or a comma-separated string', () => {
        expect(parseStringArrayParam(['CEO', 'CTO'], 'Titles').value).toEqual(['CEO', 'CTO']);
        expect(parseStringArrayParam('["CEO","CTO"]', 'Titles').value).toEqual(['CEO', 'CTO']);
        expect(parseStringArrayParam(' owner , founder ', 'Seniorities').value).toEqual(['owner', 'founder']);
    });

    it('treats an absent or empty list as unsupplied rather than as an empty filter', () => {
        for (const raw of [null, undefined, '', '  ,  ', []]) {
            expect(parseStringArrayParam(raw, 'Titles')).toEqual({ value: undefined, error: null });
        }
    });

    it('reports a malformed JSON array instead of silently dropping the filter', () => {
        expect(parseStringArrayParam('["CEO"', 'Titles').error).toMatch(/unparseable/);
        expect(parseStringArrayParam([1, 2], 'Titles').error).toMatch(/JSON array of strings/);
    });

    it('parses an integer from a number or a numeric string, and enforces the range', () => {
        expect(parseOptionalIntegerParam(5, 'Page', { min: 1, max: 500 }).value).toBe(5);
        expect(parseOptionalIntegerParam(' 5 ', 'Page').value).toBe(5);
        expect(parseOptionalIntegerParam(0, 'Page', { min: 1 }).error).toMatch(/>= 1/);
        expect(parseOptionalIntegerParam(501, 'Page', { max: 500 }).error).toMatch(/<= 500/);
    });

    it('rejects a fractional page rather than rounding it into a plausible wrong answer', () => {
        expect(parseOptionalIntegerParam(1.5, 'Page').error).toMatch(/must be an integer/);
        expect(parseOptionalIntegerParam('abc', 'Page').error).toMatch(/must be an integer/);
    });

    it("does not treat the string 'false' as true", () => {
        expect(parseOptionalBooleanParam('false', 'Verify').value).toBe(false);
        expect(parseOptionalBooleanParam('TRUE', 'Verify').value).toBe(true);
        expect(parseOptionalBooleanParam(false, 'Verify').value).toBe(false);
        expect(parseOptionalBooleanParam('yes', 'Verify').error).toMatch(/must be a boolean/);
    });
});

// ── Credentials ───────────────────────────────────────────────────────────────

describe('credential parsing', () => {
    it('accepts the key under any of the casings a hand-authored credential uses', () => {
        for (const key of ['apiKey', 'APIKey', 'api_key', 'ApiKey', 'masterApiKey']) {
            expect(extractApolloKey(JSON.stringify({ [key]: 'k-1' }), 'Apollo')).toBe('k-1');
        }
    });

    it('trims the key and treats a blank one as absent', () => {
        expect(extractApolloKey(JSON.stringify({ apiKey: '  k-1 ' }), 'Apollo')).toBe('k-1');
        expect(extractApolloKey(JSON.stringify({ apiKey: '   ' }), 'Apollo')).toBeNull();
        expect(extractApolloKey('', 'Apollo')).toBeNull();
        expect(extractApolloKey(null, 'Apollo')).toBeNull();
    });

    it('throws on a broken Values payload rather than falling through to another workspace key', () => {
        expect(() => extractApolloKey('{not json', 'Apollo')).toThrow(/not valid JSON/);
        expect(() => extractApolloKey('"a string"', 'Apollo')).toThrow(/must be a JSON object/);
    });

    it('reports no key when the payload holds something unrelated', () => {
        expect(extractApolloKey(JSON.stringify({ token: 'k-1' }), 'Apollo')).toBeNull();
    });
});

// ── Actions ───────────────────────────────────────────────────────────────────

/** A fake client whose every method is a spy; unimplemented ones throw. */
function fakeClient(overrides: Partial<IApolloRESTClient>): IApolloRESTClient {
    const notImplemented = (name: string) => async () => {
        throw new Error(`fakeClient.${name} was not expected to be called`);
    };
    return {
        listLabels: notImplemented('listLabels'),
        createLabel: notImplemented('createLabel'),
        findLabelByName: notImplemented('findLabelByName'),
        searchAccounts: notImplemented('searchAccounts'),
        searchContacts: notImplemented('searchContacts'),
        searchPeople: notImplemented('searchPeople'),
        moveAccounts: notImplemented('moveAccounts'),
        moveContacts: notImplemented('moveContacts'),
        ...overrides,
    } as IApolloRESTClient;
}

const LABELS: ApolloLabel[] = [
    { id: 'lab-cold', name: 'Cold', kind: 'accounts', cachedCount: 40, createdAt: '', updatedAt: '' },
    { id: 'lab-warm', name: 'Warm', kind: 'accounts', cachedCount: 3, createdAt: '', updatedAt: '' },
];

/**
 * Run an action against a fake client, with `APOLLO_API_KEY` set so credential
 * resolution takes the environment path and never touches the database.
 */
async function run(
    ActionClass: new () => { Run(params: RunActionParams): Promise<ActionResultSimple> },
    inputs: Record<string, unknown>,
    client: IApolloRESTClient,
) {
    const params = {
        Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Value, Type: 'Input' })),
        ContextUser: {},
    };
    const action = new ActionClass();
    // The only seam: substitute the client so no transport is constructed.
    (action as unknown as { CreateClient: (key: string) => IApolloRESTClient }).CreateClient = () => client;
    const result = await action.Run(params as unknown as RunActionParams);
    return { result, params };
}

/** Read an output param the action pushed. */
function output(params: { Params: Array<{ Name: string; Value: unknown }> }, name: string): unknown {
    return params.Params.find((p) => p.Name === name)?.Value;
}

beforeEach(() => {
    process.env.APOLLO_API_KEY = 'env-key';
    vi.resetModules();
});

describe('ApolloGetListsAction', () => {
    it('returns the labels and their count', async () => {
        const { result, params } = await run(ApolloGetListsAction, {}, fakeClient({ listLabels: async () => LABELS }));
        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(output(params, 'Count')).toBe(2);
        expect(output(params, 'Lists')).toEqual(LABELS);
    });

    it('turns a client failure into a result rather than throwing', async () => {
        const { result } = await run(
            ApolloGetListsAction,
            {},
            fakeClient({
                listLabels: async () => {
                    throw new Error('requires a MASTER Apollo API key');
                },
            }),
        );
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('ERROR');
        expect(result.Message).toMatch(/MASTER Apollo API key/);
    });
});

describe('ApolloCreateListAction', () => {
    it('requires a list name', async () => {
        const { result } = await run(ApolloCreateListAction, {}, fakeClient({}));
        expect(result.ResultCode).toBe('MISSING_REQUIRED_FIELDS');
    });

    it('returns an existing same-named list instead of creating a duplicate', async () => {
        // Two labels with one name would make every name-based lookup ambiguous.
        const createLabel = vi.fn();
        const { result, params } = await run(
            ApolloCreateListAction,
            { ListName: '  cold  ' },
            fakeClient({ listLabels: async () => LABELS, createLabel: createLabel as never }),
        );
        expect(result.Success).toBe(true);
        expect(output(params, 'AlreadyExisted')).toBe(true);
        expect(output(params, 'ListID')).toBe('lab-cold');
        expect(createLabel).not.toHaveBeenCalled();
    });

    it('creates the list when no label matches', async () => {
        const created: ApolloLabel = { id: 'lab-new', name: 'Fresh', kind: 'contacts', cachedCount: 0, createdAt: '', updatedAt: '' };
        const createLabel = vi.fn(async () => created);
        const { result, params } = await run(
            ApolloCreateListAction,
            { ListName: 'Fresh' },
            fakeClient({ listLabels: async () => LABELS, createLabel }),
        );
        expect(result.Success).toBe(true);
        expect(output(params, 'AlreadyExisted')).toBe(false);
        expect(createLabel).toHaveBeenCalledWith('Fresh', 'contacts');
    });

    it('passes the requested modality through, and rejects any other value', async () => {
        const createLabel = vi.fn(async () => LABELS[0]);
        await run(
            ApolloCreateListAction,
            { ListName: 'Fresh', Modality: 'Accounts' },
            fakeClient({ listLabels: async () => [], createLabel }),
        );
        expect(createLabel).toHaveBeenCalledWith('Fresh', 'accounts');

        const { result } = await run(ApolloCreateListAction, { ListName: 'Fresh', Modality: 'people' }, fakeClient({}));
        expect(result.ResultCode).toBe('VALIDATION_ERROR');
    });
});

describe('ApolloGetListAccountsAction', () => {
    const page: ApolloAccountsPage = {
        accounts: [{ id: 'acc-1', name: 'Acme', primaryDomain: 'acme.com', labelIds: ['lab-cold'], labelNames: ['Cold'] }],
        pagination: { page: 1, perPage: 100, totalEntries: 1, totalPages: 1 },
    };

    it('requires a list name', async () => {
        const { result } = await run(ApolloGetListAccountsAction, {}, fakeClient({}));
        expect(result.ResultCode).toBe('MISSING_REQUIRED_FIELDS');
    });

    it('resolves the list name to an id and filters on it', async () => {
        const searchAccounts = vi.fn(async () => page);
        const { result, params } = await run(
            ApolloGetListAccountsAction,
            { ListName: 'Cold', Keywords: 'assoc', Page: '2', PerPage: '50' },
            fakeClient({ findLabelByName: async () => LABELS[0], searchAccounts }),
        );
        expect(result.Success).toBe(true);
        expect(searchAccounts).toHaveBeenCalledWith({ labelIds: ['lab-cold'], keywords: 'assoc' }, { page: 2, perPage: 50 });
        expect(output(params, 'ListID')).toBe('lab-cold');
        expect(output(params, 'ResolvedListName')).toBe('Cold');
        expect(output(params, 'Count')).toBe(1);
    });

    it('points the caller at Get Lists when the name does not resolve', async () => {
        const { result } = await run(
            ApolloGetListAccountsAction,
            { ListName: 'Typo' },
            fakeClient({ findLabelByName: async () => null }),
        );
        expect(result.ResultCode).toBe('NOT_FOUND');
        expect(result.Message).toMatch(/Get Lists/);
    });

    it('rejects bad paging before resolving anything', async () => {
        const findLabelByName = vi.fn();
        const { result } = await run(
            ApolloGetListAccountsAction,
            { ListName: 'Cold', Page: '0' },
            fakeClient({ findLabelByName: findLabelByName as never }),
        );
        expect(result.ResultCode).toBe('VALIDATION_ERROR');
        expect(findLabelByName).not.toHaveBeenCalled();
    });

    it('returns the labels a move will need to preserve', async () => {
        const { params } = await run(
            ApolloGetListAccountsAction,
            { ListName: 'Cold' },
            fakeClient({ findLabelByName: async () => LABELS[0], searchAccounts: async () => page }),
        );
        expect((output(params, 'Accounts') as ApolloAccount[])[0].labelNames).toEqual(['Cold']);
    });
});

describe('ApolloGetListContactsAction', () => {
    const page: ApolloContactsPage = {
        contacts: [
            {
                id: 'con-1',
                firstName: 'A',
                lastName: 'B',
                name: 'A B',
                title: 'VP',
                email: 'a@b.com',
                organizationName: 'Acme',
                labelIds: ['lab-cold'],
                labelNames: ['Cold'],
            },
        ],
        pagination: { page: 1, perPage: 100, totalEntries: 1, totalPages: 1 },
    };

    it('filters contacts on the resolved list id', async () => {
        const searchContacts = vi.fn(async () => page);
        const { result, params } = await run(
            ApolloGetListContactsAction,
            { ListName: 'Cold', Keywords: 'director' },
            fakeClient({ findLabelByName: async () => LABELS[0], searchContacts }),
        );
        expect(result.Success).toBe(true);
        expect(searchContacts).toHaveBeenCalledWith({ labelIds: ['lab-cold'], keywords: 'director' }, {});
        expect(output(params, 'Count')).toBe(1);
    });
});

describe('ApolloSearchPeopleAction', () => {
    const page: ApolloPeoplePage = {
        people: [
            { id: 'p-1', firstName: 'A', lastName: 'B', name: 'A B', title: 'VP', linkedinUrl: '', organizationId: 'org-1', organizationName: 'Acme' },
        ],
        pagination: { page: 1, perPage: 100, totalEntries: 1, totalPages: 1 },
    };

    it('refuses an unscoped search rather than burning the rate limit', async () => {
        const searchPeople = vi.fn();
        const { result } = await run(ApolloSearchPeopleAction, {}, fakeClient({ searchPeople: searchPeople as never }));
        expect(result.ResultCode).toBe('VALIDATION_ERROR');
        expect(result.Message).toMatch(/at least one of/);
        expect(searchPeople).not.toHaveBeenCalled();
    });

    it('builds the filter from whichever inputs were supplied', async () => {
        const searchPeople = vi.fn(async () => page);
        await run(
            ApolloSearchPeopleAction,
            { Titles: 'VP of Marketing, CMO', Seniorities: '["vp"]' },
            fakeClient({ searchPeople }),
        );
        expect(searchPeople).toHaveBeenCalledWith({ titles: ['VP of Marketing', 'CMO'], seniorities: ['vp'] }, {});
    });

    it('says in the message that emails are not part of this answer', async () => {
        const { result } = await run(ApolloSearchPeopleAction, { Titles: 'CEO' }, fakeClient({ searchPeople: async () => page }));
        expect(result.Success).toBe(true);
        expect(result.Message).toMatch(/Emails and phones are not returned/);
    });

    it('reports a malformed list input as a validation error', async () => {
        const { result } = await run(ApolloSearchPeopleAction, { Titles: '["CEO"' }, fakeClient({}));
        expect(result.ResultCode).toBe('VALIDATION_ERROR');
    });
});

describe('ApolloMoveListAccountsAction', () => {
    const sourcePage: ApolloAccountsPage = {
        accounts: [
            { id: 'acc-1', name: 'Acme', primaryDomain: '', labelIds: ['lab-cold'], labelNames: ['Cold', 'Do Not Touch'] },
            { id: 'acc-2', name: 'Globex', primaryDomain: '', labelIds: ['lab-cold'], labelNames: ['Cold'] },
        ],
        pagination: { page: 1, perPage: 100, totalEntries: 2, totalPages: 1 },
    };
    const moveResult: ApolloMoveResult = {
        movedCount: 1,
        failedCount: 0,
        possiblyStuckCount: 0,
        items: [{ id: 'acc-1', added: true, removed: true, possiblyStuck: false, error: null }],
    };

    function moveClient(overrides: Partial<IApolloRESTClient> = {}) {
        return fakeClient({
            findLabelByName: async (name: string) => LABELS.find((l) => l.name === name) ?? null,
            searchAccounts: async () => sourcePage,
            moveAccounts: async () => moveResult,
            ...overrides,
        });
    }

    it('requires the ids and both list names', async () => {
        expect((await run(ApolloMoveListAccountsAction, { FromList: 'Cold', ToList: 'Warm' }, fakeClient({}))).result.ResultCode).toBe(
            'MISSING_REQUIRED_FIELDS',
        );
        expect((await run(ApolloMoveListAccountsAction, { AccountIDs: 'acc-1', ToList: 'Warm' }, fakeClient({}))).result.ResultCode).toBe(
            'MISSING_REQUIRED_FIELDS',
        );
        expect((await run(ApolloMoveListAccountsAction, { AccountIDs: 'acc-1', FromList: 'Cold' }, fakeClient({}))).result.ResultCode).toBe(
            'MISSING_REQUIRED_FIELDS',
        );
    });

    it('refuses a move onto the same list', async () => {
        const { result } = await run(
            ApolloMoveListAccountsAction,
            { AccountIDs: 'acc-1', FromList: 'Cold', ToList: ' cold ' },
            fakeClient({}),
        );
        expect(result.ResultCode).toBe('VALIDATION_ERROR');
    });

    it('resolves both list names before writing anything', async () => {
        // A typo in ToList caught halfway through would leave the batch split.
        const moveAccounts = vi.fn();
        const { result } = await run(
            ApolloMoveListAccountsAction,
            { AccountIDs: 'acc-1', FromList: 'Cold', ToList: 'Typo' },
            moveClient({ moveAccounts: moveAccounts as never }),
        );
        expect(result.ResultCode).toBe('NOT_FOUND');
        expect(result.Message).toMatch(/'Typo' \(ToList\)/);
        expect(moveAccounts).not.toHaveBeenCalled();
    });

    it('moves the records with the labels it just read, not with anything the caller supplied', async () => {
        const moveAccounts = vi.fn(async () => moveResult);
        const { result } = await run(
            ApolloMoveListAccountsAction,
            { AccountIDs: '["acc-1"]', FromList: 'Cold', ToList: 'Warm' },
            moveClient({ moveAccounts }),
        );
        expect(result.Success).toBe(true);
        const [records, from, to, options] = moveAccounts.mock.calls[0] as unknown as [ApolloAccount[], string, string, { verify: boolean }];
        expect(records).toEqual([sourcePage.accounts[0]]);
        expect(records[0].labelNames).toEqual(['Cold', 'Do Not Touch']);
        expect([from, to]).toEqual(['Cold', 'Warm']);
        expect(options).toEqual({ verify: true });
    });

    it('reads page 1 of the source list, because removals shift later pages', async () => {
        const searchAccounts = vi.fn(async () => sourcePage);
        await run(
            ApolloMoveListAccountsAction,
            { AccountIDs: 'acc-1', FromList: 'Cold', ToList: 'Warm' },
            moveClient({ searchAccounts }),
        );
        expect(searchAccounts).toHaveBeenCalledWith({ labelIds: ['lab-cold'] }, { page: 1, perPage: 100 });
    });

    it('reports skipped ids as a PARTIAL_FAILURE rather than a clean success', async () => {
        // The batch is still NOT aborted — acc-1 moves, and NotOnSourcePage names what did not.
        // But it is no longer `Success: true`: only page 1 of the source list is read, so ids
        // beyond it are never attempted, and the caller asked for work that did not happen.
        //
        // The message used to read `Moved 1 of 1`, counted against what page 1 contained rather
        // than what was requested — so 300 ids could report `Moved 100 of 100` with Success true
        // while 200 were silently skipped.
        const { result, params } = await run(
            ApolloMoveListAccountsAction,
            { AccountIDs: 'acc-1, acc-999', FromList: 'Cold', ToList: 'Warm' },
            moveClient(),
        );
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('PARTIAL_FAILURE');
        expect(output(params, 'NotOnSourcePage')).toEqual(['acc-999']);
        // Counted against what was REQUESTED (2), with the skip named in the caller-facing message.
        expect(result.Message).toContain('of 2');
        expect(result.Message).toMatch(/1 not on page 1 .*NOT attempted/);
    });

    it('de-duplicates the supplied ids', async () => {
        const moveAccounts = vi.fn(async () => moveResult);
        await run(
            ApolloMoveListAccountsAction,
            { AccountIDs: 'acc-1, acc-1', FromList: 'Cold', ToList: 'Warm' },
            moveClient({ moveAccounts }),
        );
        expect((moveAccounts.mock.calls[0] as unknown as [ApolloAccount[]])[0]).toHaveLength(1);
    });

    it('explains what to do when none of the ids are on the source page', async () => {
        const { result } = await run(
            ApolloMoveListAccountsAction,
            { AccountIDs: 'acc-999', FromList: 'Cold', ToList: 'Warm' },
            moveClient(),
        );
        expect(result.ResultCode).toBe('NOT_FOUND');
        expect(result.Message).toMatch(/re-read page 1/);
    });

    it('reports a partial failure when a write failed', async () => {
        const { result, params } = await run(
            ApolloMoveListAccountsAction,
            { AccountIDs: 'acc-1', FromList: 'Cold', ToList: 'Warm' },
            moveClient({
                moveAccounts: async () => ({
                    movedCount: 0,
                    failedCount: 1,
                    possiblyStuckCount: 0,
                    items: [{ id: 'acc-1', added: true, removed: false, possiblyStuck: null, error: 'remove phase: boom' }],
                }),
            }),
        );
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('PARTIAL_FAILURE');
        expect(output(params, 'FailedCount')).toBe(1);
    });

    it('treats a stuck record as a success with an explanation, not as a failure', async () => {
        // The write succeeded; Apollo did not honour it. Reporting it as a failure
        // would send the caller looking for a bug in the request.
        const { result, params } = await run(
            ApolloMoveListAccountsAction,
            { AccountIDs: 'acc-1', FromList: 'Cold', ToList: 'Warm' },
            moveClient({
                moveAccounts: async () => ({
                    movedCount: 0,
                    failedCount: 0,
                    possiblyStuckCount: 1,
                    items: [{ id: 'acc-1', added: true, removed: true, possiblyStuck: true, error: null }],
                }),
            }),
        );
        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(output(params, 'PossiblyStuckCount')).toBe(1);
        expect(result.Message).toMatch(/next page-1 drain/);
        expect(result.Message).toMatch(/does not attempt one/);
    });
});

describe('ApolloMoveListContactsAction', () => {
    const sourcePage: ApolloContactsPage = {
        contacts: [
            {
                id: 'con-1',
                firstName: 'A',
                lastName: 'B',
                name: 'A B',
                title: 'VP',
                email: 'a@b.com',
                organizationName: 'Acme',
                labelIds: ['lab-cold'],
                labelNames: ['Cold'],
            },
        ],
        pagination: { page: 1, perPage: 100, totalEntries: 1, totalPages: 1 },
    };

    it('moves contacts through the contact search and move surface', async () => {
        const moveContacts = vi.fn(async () => ({
            movedCount: 1,
            failedCount: 0,
            possiblyStuckCount: 0,
            items: [{ id: 'con-1', added: true, removed: true, possiblyStuck: false, error: null }],
        }));
        const { result, params } = await run(
            ApolloMoveListContactsAction,
            { ContactIDs: 'con-1', FromList: 'Cold', ToList: 'Warm' },
            fakeClient({
                findLabelByName: async (name: string) => LABELS.find((l) => l.name === name) ?? null,
                searchContacts: async () => sourcePage,
                moveContacts,
            }),
        );
        expect(result.Success).toBe(true);
        expect(output(params, 'MovedCount')).toBe(1);
        expect((moveContacts.mock.calls[0] as unknown as [ApolloContact[]])[0]).toEqual([sourcePage.contacts[0]]);
    });

    it('names its own id param in the missing-field message', async () => {
        const { result } = await run(ApolloMoveListContactsAction, { FromList: 'Cold', ToList: 'Warm' }, fakeClient({}));
        expect(result.Message).toMatch(/ContactIDs/);
    });
});

// ── Credential resolution through an action ───────────────────────────────────

describe('key resolution', () => {
    it('falls back to the environment when no CompanyID is supplied', async () => {
        const { result, params } = await run(ApolloGetListsAction, {}, fakeClient({ listLabels: async () => LABELS }));
        expect(result.Success).toBe(true);
        expect(output(params, 'KeySource')).toBe('environment');
    });

    it('fails with CREDENTIALS_NOT_FOUND when nothing is configured at all', async () => {
        delete process.env.APOLLO_API_KEY;
        vi.resetModules();
        const { ApolloGetListsAction: Fresh } = await import('../lists/ApolloListActions.js');
        const { result } = await run(Fresh as never, {}, fakeClient({}));
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('CREDENTIALS_NOT_FOUND');
        expect(result.Message).toMatch(/MASTER Apollo key/);
        expect(result.Message).toMatch(/APOLLO_API_KEY/);
    });
});
