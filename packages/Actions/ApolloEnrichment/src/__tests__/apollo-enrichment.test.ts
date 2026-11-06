/**
 * Tests for the two enrichment actions, driven with fake clients, a fake metadata provider and a
 * fake RunView. Each case is one row of the Apollo action bug inventory (plan Appendix A).
 * Nothing here may reach api.apollo.io.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {
        public async Run(params: unknown): Promise<unknown> {
            return (this as unknown as { InternalRunAction(p: unknown): Promise<unknown> }).InternalRunAction(params);
        }
        protected async InternalRunAction(): Promise<unknown> { return {}; }
    },
}));
vi.mock('@memberjunction/global', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), RegisterClass: () => (target: unknown) => target }));
vi.mock('@memberjunction/credentials', () => ({ CredentialEngine: { Instance: { Config: vi.fn(), Credentials: [], getCredential: vi.fn() } } }));

const runViewMock = vi.fn();
vi.mock('@memberjunction/core', () => ({
    BaseEntity: class BaseEntity {},
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    Metadata: class Metadata { static Provider = null; },
    RunView: class RunView {
        static FromMetadataProvider() { return { RunView: runViewMock }; }
        RunView(...args: unknown[]) { return runViewMock(...args); }
    },
    UserInfo: class UserInfo {},
    CompositeKey: {
        FromEntityRecord: (entity: { PrimaryKeys: { Name: string }[] }, row: Record<string, unknown>) => ({
            KeyValuePairs: entity.PrimaryKeys.map((pk) => ({ FieldName: pk.Name, Value: row[pk.Name] })),
        }),
    },
}));

process.env.APOLLO_API_KEY = 'env-key';
const { ApolloEnrichmentContactsAction, BuildMatchInput, ContactKeyOf, ParseEmploymentMapping } = await import('../contacts');
const { ApolloEnrichmentAccountsAction, FieldPredicate } = await import('../accounts');
const { ApolloRateLimitError } = await import('../http/ApolloHttp');
const { MapMatch } = await import('../people/ApolloPeopleClient');
type ApolloPersonMatch = ReturnType<typeof MapMatch>;
type PeopleClient = InstanceType<(typeof import('../people/ApolloPeopleClient'))['ApolloPeopleClient']>;
type SearchClient = import('../generic/apollo-lists.types').IApolloRESTClient;
type Organization = import('../generic/apollo.types').OrganizationEnrichmentOrganization;

// ── Fakes ─────────────────────────────────────────────────────────────────────

interface FieldDef { Name: string; NeedsQuotes: boolean; Length: number }
interface EntityDef { Name: string; PrimaryKeys: { Name: string }[]; Fields: FieldDef[]; FirstPrimaryKey: { Name: string } }
function entityDef(name: string, pks: string[], fields: Partial<FieldDef>[] = []): EntityDef {
    const all = [...pks.map((pk) => ({ Name: pk, NeedsQuotes: pk === 'ID', Length: 0 })), ...fields.map((f) => ({ Name: f.Name as string, NeedsQuotes: f.NeedsQuotes ?? true, Length: f.Length ?? 0 }))];
    return { Name: name, PrimaryKeys: pks.map((Name) => ({ Name })), Fields: all, FirstPrimaryKey: { Name: pks[0] } };
}

/** A saved-row store per entity, so a fake RunView can answer from what the action wrote. */
class FakeEntity {
    public Values: Record<string, unknown>;
    public LatestResult: { CompleteMessage: string } | null = null;
    public SaveCount = 0;
    public readonly Sets: [string, unknown][] = [];
    constructor(public readonly EntityInfo: EntityDef, row: Record<string, unknown> | null, private readonly world: FakeWorld) {
        this.Values = row ? { ...row } : {};
    }
    get PrimaryKeys() { return this.EntityInfo.PrimaryKeys; }
    get FirstPrimaryKey() { const name = this.EntityInfo.FirstPrimaryKey.Name; return { Name: name, Value: this.Values[name], NeedsQuotes: name === 'ID' }; }
    NewRecord() { this.Values = {}; }
    Set(field: string, value: unknown) { this.Values[field] = value; this.Sets.push([field, value]); }
    Get(field: string) { return this.Values[field]; }
    async Save(): Promise<boolean> {
        this.SaveCount++;
        if (this.world.failSave(this)) { this.LatestResult = { CompleteMessage: 'simulated save failure' }; return false; }
        this.world.saved(this);
        return true;
    }
}

class FakeWorld {
    public readonly entities = new Map<string, EntityDef>();
    public readonly rows = new Map<string, Record<string, unknown>[]>();
    public readonly savedEntities: FakeEntity[] = [];
    public failSave: (e: FakeEntity) => boolean = () => false;
    public readonly md = {
        EntityByName: (name: string) => this.entities.get(name) ?? null,
        GetEntityObject: async (name: string, keyOrUser: unknown) => {
            const info = this.entities.get(name) as EntityDef;
            const key = keyOrUser as { KeyValuePairs?: { FieldName: string; Value: unknown }[] };
            if (!key?.KeyValuePairs) return new FakeEntity(info, null, this);
            const row = (this.rows.get(name) ?? []).find((r) => key.KeyValuePairs?.every((kv) => r[kv.FieldName] === kv.Value));
            if (!row) throw new Error(`no row for ${name} ${JSON.stringify(key.KeyValuePairs)}`);
            return new FakeEntity(info, row, this);
        },
    };
    define(def: EntityDef, rows: Record<string, unknown>[] = []) { this.entities.set(def.Name, def); this.rows.set(def.Name, rows); }
    saved(e: FakeEntity) {
        this.savedEntities.push(e);
        const list = this.rows.get(e.EntityInfo.Name) ?? [];
        const pk = e.EntityInfo.PrimaryKeys.map((p) => p.Name);
        const existing = list.find((r) => pk.every((p) => r[p] === e.Values[p]) && pk.every((p) => e.Values[p] !== undefined));
        if (existing) Object.assign(existing, e.Values);
        else { if (e.Values.ID === undefined) e.Values.ID = `new-${list.length + 1}`; list.push({ ...e.Values }); }
        this.rows.set(e.EntityInfo.Name, list);
    }
    savedFor(entityName: string) { return this.savedEntities.filter((e) => e.EntityInfo.Name === entityName); }
}

function match(over: Partial<ApolloPersonMatch>): ApolloPersonMatch {
    return { ...MapMatch(null, over.Key ?? 'k', false), Matched: true, ApolloPersonID: 'ap-1', FirstName: 'Ada', LastName: 'Lovelace', Title: 'Engineer', Email: 'ada@acme.com', ...over };
}
const miss = (key: string): ApolloPersonMatch => MapMatch(null, key, false);

function contactsAction(client: Partial<PeopleClient>) {
    const action = new ApolloEnrichmentContactsAction();
    const createClient = vi.fn(async () => client as PeopleClient);
    (action as unknown as { CreateClient: typeof createClient }).CreateClient = createClient;
    return { action, createClient };
}
const CONTACT_PARAMS = [
    ['EntityName', 'Contacts'], ['EmailField', 'Email'], ['FirstNameField', 'FirstName'], ['LastNameField', 'LastName'],
    ['TitleField', 'Title'], ['EnrichedAtField', 'EnrichedAt'], ['Filter', 'EnrichedAt IS NULL'], ['DomainField', 'Domain'],
].map(([Name, Value]) => ({ Name, Value, Type: 'Input' }));
async function runContacts(action: InstanceType<typeof ApolloEnrichmentContactsAction>, world: FakeWorld, extra: { Name: string; Value: unknown }[] = []) {
    return (action as unknown as { Run(p: unknown): Promise<{ Success: boolean; ResultCode: string; Message: string }> }).Run({ Params: [...CONTACT_PARAMS, ...extra.map((p) => ({ ...p, Type: 'Input' }))], ContextUser: {}, Provider: world.md });
}
/** Contacts whose filter drains: unstamped rows, ordered by ID, after the key. */
function contactsRunView(world: FakeWorld, pageSize = 500) {
    runViewMock.mockImplementation(async (p: { EntityName: string; ExtraFilter: string; AfterKey?: { KeyValuePairs: { Value: unknown }[] }; MaxRows?: number }) => {
        if (p.EntityName !== 'Contacts') {
            const [, field, value] = /\[(\w+)\] = ('?[^' ]+'?)/.exec(p.ExtraFilter) ?? [];
            const rows = (world.rows.get(p.EntityName) ?? []).filter((r) => String(r[field]) === String(value).replace(/^'|'$/g, ''));
            return { Success: true, Results: rows.map((r) => ({ ...r })) };
        }
        const after = p.AfterKey?.KeyValuePairs[0].Value as string | undefined;
        const rows = (world.rows.get('Contacts') ?? []).filter((r) => r.EnrichedAt === undefined && (after === undefined || String(r.ID) > after)).sort((a, b) => String(a.ID).localeCompare(String(b.ID)));
        return { Success: true, Results: rows.slice(0, p.MaxRows ?? pageSize).map((r) => ({ ...r })) };
    });
}
const pad = (n: number) => String(n).padStart(5, '0');

describe('ApolloEnrichmentContactsAction', () => {
    let world: FakeWorld;
    beforeEach(() => {
        world = new FakeWorld();
        world.define(entityDef('Contacts', ['ID'], [{ Name: 'Email' }, { Name: 'FirstName' }, { Name: 'LastName' }, { Name: 'Title' }, { Name: 'EnrichedAt' }, { Name: 'Domain' }]));
        runViewMock.mockReset();
    });

    it('A-9: resolves the client through the CompanyID param and header auth lives in the client', async () => {
        world.define(entityDef('Contacts', ['ID']), []);
        contactsRunView(world);
        const bulk = vi.fn(async () => ({ Matches: [], CreditsConsumed: 0 }));
        const { action, createClient } = contactsAction({ BulkMatch: bulk });
        const result = await runContacts(action, world, [{ Name: 'CompanyID', Value: 'co-1' }]);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(createClient).toHaveBeenCalledWith('co-1', {});
    });

    it('A-6 and A-3: every row sent is stamped, a miss too, and a failed save does not skip the rows after it', async () => {
        const rows = [1, 2, 3].map((n) => ({ ID: `c${n}`, Email: `p${n}@acme.com` }));
        world.define(entityDef('Contacts', ['ID'], [{ Name: 'Email' }, { Name: 'EnrichedAt' }]), rows);
        contactsRunView(world);
        world.failSave = (e) => e.Values.ID === 'c1';
        const bulk = vi.fn(async (inputs: { Key: string }[]) => ({ Matches: inputs.map((i, n) => (n === 1 ? miss(i.Key) : match({ Key: i.Key, Email: `p${n + 1}@acme.com` }))), CreditsConsumed: 2 }));
        const { action } = contactsAction({ BulkMatch: bulk });
        const result = await runContacts(action, world);
        expect(result.ResultCode).toBe('FAILED');
        expect(result.Message).toContain('1 save failures');
        const contacts = world.rows.get('Contacts') as Record<string, unknown>[];
        expect(contacts[0].EnrichedAt).toBeUndefined();               // c1's save failed
        expect(contacts[1].EnrichedAt).toBeInstanceOf(Date);           // the miss is stamped
        expect(contacts[2].EnrichedAt).toBeInstanceOf(Date);           // and the row after the failure was still written
        expect(contacts[2].Title).toBe('Engineer');
    });

    it('A-5: keyset paging over a filter that drains processes 1,203 rows exactly once', async () => {
        const rows = Array.from({ length: 1203 }, (_, n) => ({ ID: `c${pad(n)}`, Email: `p${n}@acme.com` }));
        world.define(entityDef('Contacts', ['ID'], [{ Name: 'Email' }, { Name: 'EnrichedAt' }]), rows);
        contactsRunView(world);
        const seen: string[] = [];
        const bulk = vi.fn(async (inputs: { Key: string; Email?: string }[]) => { inputs.forEach((i) => seen.push(i.Email as string)); return { Matches: inputs.map((i) => miss(i.Key)), CreditsConsumed: 0 }; });
        const { action } = contactsAction({ BulkMatch: bulk });
        const result = await runContacts(action, world);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(seen).toHaveLength(1203);
        expect(new Set(seen).size).toBe(1203);
        expect(bulk).toHaveBeenCalledTimes(121);
        expect(runViewMock.mock.calls.filter((c) => c[0].EntityName === 'Contacts').length).toBe(3);
        expect(runViewMock.mock.calls[1][0].AfterKey).toEqual({ KeyValuePairs: [{ FieldName: 'ID', Value: 'c00499' }] });
    });

    it('stamps a row nothing identifies without sending it', async () => {
        world.define(entityDef('Contacts', ['ID'], [{ Name: 'EnrichedAt' }]), [{ ID: 'c1', FirstName: 'Only' }]);
        contactsRunView(world);
        const bulk = vi.fn();
        const { action } = contactsAction({ BulkMatch: bulk });
        const result = await runContacts(action, world);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(bulk).not.toHaveBeenCalled();
        expect((world.rows.get('Contacts') as Record<string, unknown>[])[0].EnrichedAt).toBeInstanceOf(Date);
    });

    it('A-10: an hourly rate limit returns RATE_LIMIT_EXCEEDED at once, with no sleep in the action', async () => {
        world.define(entityDef('Contacts', ['ID'], [{ Name: 'EnrichedAt' }]), [{ ID: 'c1', Email: 'a@acme.com' }]);
        contactsRunView(world);
        const { action } = contactsAction({ BulkMatch: vi.fn(async () => { throw new ApolloRateLimitError('hourly', '{"error":"Hourly rate limit exceeded"}', null, 'hour'); }) });
        const started = Date.now();
        const result = await runContacts(action, world);
        expect(result.ResultCode).toBe('RATE_LIMIT_EXCEEDED');
        expect(Date.now() - started).toBeLessThan(1000);
    });

    describe('history (A-4, A-7, A-8)', () => {
        const employmentMapping = { EntityName: 'Employment', ContactIDFieldName: 'ContactID', OrganizationFieldName: 'Org', TitleFieldName: 'Role', StartDateFieldName: 'Began' };
        const educationMapping = { EntityName: 'Education', ContactIDFieldName: 'ContactID', InstitutionFieldName: 'School', DegreeFieldName: 'Award' };
        const withHistory = () => {
            world.define(entityDef('Contacts', ['ID'], [{ Name: 'EnrichedAt' }]), [{ ID: 'c1', Email: 'a@acme.com' }]);
            world.define(entityDef('Employment', ['ID'], [{ Name: 'ContactID' }, { Name: 'Org', Length: 50 }, { Name: 'Role' }, { Name: 'Began' }]));
            world.define(entityDef('Education', ['ID'], [{ Name: 'ContactID' }, { Name: 'School' }, { Name: 'Award' }]));
            contactsRunView(world);
        };
        const enriched = match({
            Key: '0',
            Employment: [{ OrganizationName: "O'Reilly Media", ApolloOrganizationID: null, OrganizationDomain: null, Title: 'Editor', StartDate: '2010-01-01', EndDate: null, IsCurrent: true }],
            Education: [{ InstitutionName: 'MIT', ApolloOrganizationID: null, Degree: 'MS', FieldOfStudy: null, GradeLevel: null, StartDate: null, EndDate: null }],
        });

        it('A-7: education-only mappings write education rows and no employment rows', async () => {
            withHistory();
            const { action } = contactsAction({ BulkMatch: vi.fn(async () => ({ Matches: [enriched], CreditsConsumed: 1 })) });
            const result = await runContacts(action, world, [{ Name: 'EducationHistoryFieldMappings', Value: JSON.stringify(educationMapping) }]);
            expect(result.ResultCode).toBe('SUCCESS');
            expect(world.savedFor('Education')).toHaveLength(1);
            expect(world.savedFor('Employment')).toHaveLength(0);
            expect(world.savedFor('Education')[0].Values).toMatchObject({ ContactID: 'c1', School: 'MIT', Award: 'MS' });
        });

        it("A-4 and A-8: stores O'Reilly with one quote, escapes it only in the filter, and writes only mapped columns", async () => {
            withHistory();
            const { action } = contactsAction({ BulkMatch: vi.fn(async () => ({ Matches: [enriched], CreditsConsumed: 1 })) });
            await runContacts(action, world, [{ Name: 'EmploymentHistoryFieldMappings', Value: employmentMapping }]);
            const row = world.savedFor('Employment')[0];
            expect(row.Values.Org).toBe("O'Reilly Media");
            expect(row.Values.Role).toBe('Editor');
            expect(row.Values.Began).toBeInstanceOf(Date);
            expect(row.Sets.map(([f]) => f).sort()).toEqual(['Began', 'ContactID', 'Org', 'Role']);
            const lookup = runViewMock.mock.calls.find((c) => c[0].EntityName === 'Employment')?.[0].ExtraFilter as string;
            expect(lookup).toContain("[Org] = 'O''Reilly Media'");
            expect(lookup).toContain("[ContactID] = 'c1'");
            expect(lookup).toContain('[Role] =');
        });

        it('a second run on the same history finds the row and updates it instead of inserting a duplicate', async () => {
            withHistory();
            const { action } = contactsAction({ BulkMatch: vi.fn(async () => ({ Matches: [enriched], CreditsConsumed: 1 })) });
            await runContacts(action, world, [{ Name: 'EmploymentHistoryFieldMappings', Value: employmentMapping }]);
            (world.rows.get('Contacts') as Record<string, unknown>[])[0].EnrichedAt = undefined;
            await runContacts(action, world, [{ Name: 'EmploymentHistoryFieldMappings', Value: employmentMapping }]);
            expect(world.rows.get('Employment')).toHaveLength(1);
        });

        it('refuses to build a single-column FK filter for a composite-keyed contact entity', async () => {
            withHistory();
            world.define(entityDef('Contacts', ['OrgID', 'PersonNo'], [{ Name: 'EnrichedAt' }]), [{ OrgID: 1, PersonNo: 2, Email: 'a@acme.com' }]);
            runViewMock.mockImplementation(async (p: { EntityName: string }) => ({ Success: true, Results: p.EntityName === 'Contacts' ? [{ OrgID: 1, PersonNo: 2, Email: 'a@acme.com' }] : [] }));
            const { action } = contactsAction({ BulkMatch: vi.fn(async () => ({ Matches: [enriched], CreditsConsumed: 1 })) });
            const { LogError } = await import('@memberjunction/core');
            await runContacts(action, world, [{ Name: 'EmploymentHistoryFieldMappings', Value: employmentMapping }]);
            expect(world.savedFor('Employment')).toHaveLength(0);
            expect(LogError).toHaveBeenCalledWith(expect.stringContaining('composite primary key'));
        });
    });

    it('A-12: reads the mapping keys the metadata documents (EntityName, ContactIDFieldName, …), case-insensitively', () => {
        expect(ParseEmploymentMapping({ entityname: 'E', contactidfieldname: 'C', organizationfieldname: 'O', titlefieldname: 'T' })).toMatchObject({ EntityName: 'E', TitleFieldName: 'T' });
        expect(ParseEmploymentMapping({ EmploymentHistoryEntityName: 'E' })).toBeNull();
    });

    it('BuildMatchInput needs an email, or a name with a domain or an account name', () => {
        const p = { EntityName: 'C', EmailField: 'Email', FirstNameField: 'First', LastNameField: 'Last', TitleField: 'T', EnrichedAtField: 'E', Filter: '', DomainField: 'Domain', AccountNameField: 'Account', CompanyID: null };
        expect(BuildMatchInput(p, { Email: 'a@b.c' }, '0')).toMatchObject({ Email: 'a@b.c' });
        expect(BuildMatchInput(p, { First: 'A', Last: 'B', Account: 'Acme' }, '0')).toMatchObject({ OrganizationName: 'Acme' });
        expect(BuildMatchInput(p, { First: 'A', Last: 'B' }, '0')).toBeNull();
    });

    it('ContactKeyOf quotes a string key and not an integer key', () => {
        const stringKey = { PrimaryKeys: [{ Name: 'ID' }], FirstPrimaryKey: { Name: 'ID', Value: "o'k", NeedsQuotes: true } };
        const intKey = { PrimaryKeys: [{ Name: 'individual_id' }], FirstPrimaryKey: { Name: 'individual_id', Value: 9001, NeedsQuotes: false } };
        type Contact = Parameters<typeof ContactKeyOf>[0];
        expect(ContactKeyOf(stringKey as unknown as Contact)?.Predicate('ContactKey')).toBe("[ContactKey] = 'o''k'");
        expect(ContactKeyOf(intKey as unknown as Contact)?.Predicate('ContactKey')).toBe('[ContactKey] = 9001');
        expect(ContactKeyOf({ PrimaryKeys: [{}, {}] } as unknown as Contact)).toBeNull();
    });
});

// ── Accounts ──────────────────────────────────────────────────────────────────

interface SearchFixture { body: { total_entries: number; people: { id: string }[] } }
const apiSearch: SearchFixture = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/api-search.redacted.json', import.meta.url)), 'utf8'));

function accountsAction(people: Partial<PeopleClient>, search: Partial<SearchClient>) {
    const action = new ApolloEnrichmentAccountsAction();
    (action as unknown as { CreateClients: unknown }).CreateClients = vi.fn(async () => ({ People: people, Search: search }));
    return action;
}
const ACCOUNT_MAPPING = { EntityName: 'Accounts', DomainField: 'Domain', AccountIDField: 'ID', EnrichedAtField: 'EnrichedAt', Filter: 'EnrichedAt IS NULL', CityField: 'City' };
const CONTACT_MAPPING = { EntityName: 'Contacts', EmailField: 'Email', AccountIDField: 'AccountID', EnrichedAtField: 'EnrichedAt', FirstNameField: 'FirstName', LastNameField: 'LastName', TitleField: 'Title', EmailSourceField: 'EmailSource', ActivityCountField: 'ActivityCount' };
async function runAccounts(action: InstanceType<typeof ApolloEnrichmentAccountsAction>, world: FakeWorld, extra: { Name: string; Value: unknown }[] = []) {
    return (action as unknown as { Run(p: unknown): Promise<{ Success: boolean; ResultCode: string; Message: string }> }).Run({
        Params: [{ Name: 'AccountEntityFieldMappings', Value: ACCOUNT_MAPPING, Type: 'Input' }, ...extra.map((p) => ({ ...p, Type: 'Input' }))], ContextUser: {}, Provider: world.md,
    });
}
/** Accounts whose filter drains; contacts answered from the store by the predicates in the filter. */
function accountsRunView(world: FakeWorld) {
    runViewMock.mockImplementation(async (p: { EntityName: string; ExtraFilter: string }) => {
        if (p.EntityName === 'Accounts') return { Success: true, Results: (world.rows.get('Accounts') ?? []).filter((r) => r.EnrichedAt === undefined).map((r) => ({ ...r })) };
        const rows = world.rows.get(p.EntityName) ?? [];
        const email = /\[Email\] = '([^']*)'/.exec(p.ExtraFilter)?.[1];
        const account = /\[AccountID\] (=|<>) ('?)([^' ]+)\2/.exec(p.ExtraFilter);
        const hits = rows.filter((r) => (email === undefined || r.Email === email) && (!account || (account[1] === '=' ? String(r.AccountID) === account[3] : String(r.AccountID) !== account[3])));
        return { Success: true, Results: hits.map((r) => ({ ...r })) };
    });
}

describe('ApolloEnrichmentAccountsAction', () => {
    let world: FakeWorld;
    beforeEach(() => {
        world = new FakeWorld();
        world.define(entityDef('Accounts', ['ID'], [{ Name: 'Domain' }, { Name: 'EnrichedAt' }, { Name: 'City' }]), [{ ID: 'acc-uuid-1', Domain: 'leoninepa.com' }]);
        world.define(entityDef('Contacts', ['ID'], [{ Name: 'Email' }, { Name: 'AccountID', NeedsQuotes: true }, { Name: 'FirstName' }, { Name: 'LastName' }, { Name: 'Title' }, { Name: 'EnrichedAt' }]));
        runViewMock.mockReset();
        accountsRunView(world);
    });

    it('A-13: discovers people through api_search and matches them by Apollo id, creating contacts for in-domain emails', async () => {
        const searchPeople = vi.fn(async () => ({ people: apiSearch.body.people.map((p) => ({ id: p.id, firstName: 'x', lastName: '', lastNameObfuscated: 'D***', name: '', title: 'Analyst', linkedinUrl: '', hasEmail: true, organizationId: null, organizationName: '' })), pagination: { page: 1, perPage: 100, totalEntries: 1, totalPages: 1 } }));
        const bulk = vi.fn(async (inputs: { Key: string; ApolloPersonID?: string }[]) => ({ Matches: inputs.map((i) => match({ Key: i.Key, ApolloPersonID: i.ApolloPersonID ?? null, Email: 'ana@leoninepa.com', LastName: 'Dean' })), CreditsConsumed: inputs.length }));
        const action = accountsAction({ EnrichOrganization: vi.fn(async () => ({ city: 'Montpelier', current_technologies: [] } as unknown as Organization)), BulkMatch: bulk }, { searchPeople });
        const result = await runAccounts(action, world, [{ Name: 'ContactEntityFieldMappings', Value: CONTACT_MAPPING }]);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(searchPeople).toHaveBeenCalledWith({ organizationDomains: ['leoninepa.com'] }, { page: 1, perPage: 100 });
        expect(bulk).toHaveBeenCalledWith([{ Key: 'pdl-fixture-9', ApolloPersonID: 'pdl-fixture-9' }], { RevealPersonalEmails: true });
        const contacts = world.rows.get('Contacts') as Record<string, unknown>[];
        expect(contacts).toHaveLength(1);
        expect(contacts[0]).toMatchObject({ Email: 'ana@leoninepa.com', AccountID: 'acc-uuid-1', LastName: 'Dean', EmailSource: 'Apollo.io' });
        expect((world.rows.get('Accounts') as Record<string, unknown>[])[0]).toMatchObject({ City: 'Montpelier' });
    });

    it('A-1: the contact lookups quote a UUID account key', async () => {
        const searchPeople = vi.fn(async () => ({ people: [{ id: 'p1', firstName: 'x', lastName: '', lastNameObfuscated: '', name: '', title: '', linkedinUrl: '', hasEmail: true, organizationId: null, organizationName: '' }], pagination: { page: 1, perPage: 100, totalEntries: 1, totalPages: 1 } }));
        const action = accountsAction({ EnrichOrganization: vi.fn(async () => null), BulkMatch: vi.fn(async () => ({ Matches: [match({ Key: 'p1', Email: 'a@leoninepa.com' })], CreditsConsumed: 1 })) }, { searchPeople });
        await runAccounts(action, world, [{ Name: 'ContactEntityFieldMappings', Value: CONTACT_MAPPING }]);
        const filters = runViewMock.mock.calls.filter((c) => c[0].EntityName === 'Contacts').map((c) => c[0].ExtraFilter as string);
        expect(filters[0]).toContain("[AccountID] <> 'acc-uuid-1'");
        expect(filters[1]).toContain("[AccountID] = 'acc-uuid-1'");
    });

    it('A-2: an existing contact is loaded by its real key and updated, not replaced by a blank object', async () => {
        world.define(world.entities.get('Contacts') as EntityDef, [{ ID: 'existing-7', Email: 'a@leoninepa.com', AccountID: 'acc-uuid-1', Title: 'Old' }]);
        const searchPeople = vi.fn(async () => ({ people: [{ id: 'p1', firstName: 'x', lastName: '', lastNameObfuscated: '', name: '', title: '', linkedinUrl: '', hasEmail: true, organizationId: null, organizationName: '' }], pagination: { page: 1, perPage: 100, totalEntries: 1, totalPages: 1 } }));
        const action = accountsAction({ EnrichOrganization: vi.fn(async () => null), BulkMatch: vi.fn(async () => ({ Matches: [match({ Key: 'p1', Email: 'a@leoninepa.com', Title: 'New' })], CreditsConsumed: 1 })) }, { searchPeople });
        await runAccounts(action, world, [{ Name: 'ContactEntityFieldMappings', Value: CONTACT_MAPPING }]);
        const contacts = world.rows.get('Contacts') as Record<string, unknown>[];
        expect(contacts).toHaveLength(1);
        expect(contacts[0]).toMatchObject({ ID: 'existing-7', Title: 'New' });
    });

    it('A-3: a failed contact save does not skip the people after it', async () => {
        const people = ['p1', 'p2', 'p3'].map((id) => ({ id, firstName: 'x', lastName: '', lastNameObfuscated: '', name: '', title: '', linkedinUrl: '', hasEmail: true, organizationId: null, organizationName: '' }));
        const bulk = vi.fn(async (inputs: { Key: string }[]) => ({ Matches: inputs.map((i) => match({ Key: i.Key, Email: `${i.Key}@leoninepa.com`, LastName: i.Key })), CreditsConsumed: 3 }));
        world.failSave = (e) => e.Values.Email === 'p1@leoninepa.com';
        const action = accountsAction({ EnrichOrganization: vi.fn(async () => null), BulkMatch: bulk }, { searchPeople: vi.fn(async () => ({ people, pagination: { page: 1, perPage: 100, totalEntries: 3, totalPages: 1 } })) });
        const result = await runAccounts(action, world, [{ Name: 'ContactEntityFieldMappings', Value: CONTACT_MAPPING }]);
        expect(result.ResultCode).toBe('FAILED');
        expect((world.rows.get('Contacts') as Record<string, unknown>[]).map((c) => c.Email)).toEqual(['p2@leoninepa.com', 'p3@leoninepa.com']);
    });

    it('A-10: an hourly rate limit on organizations/enrich returns RATE_LIMIT_EXCEEDED at once', async () => {
        const action = accountsAction({ EnrichOrganization: vi.fn(async () => { throw new ApolloRateLimitError('hourly', '', null, 'hour'); }) }, {});
        const result = await runAccounts(action, world);
        expect(result.ResultCode).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('stamps an account Apollo has no organization for, with its real (composite) key', async () => {
        world.define(entityDef('Accounts', ['OrgID', 'Region'], [{ Name: 'Domain' }, { Name: 'EnrichedAt' }]), [{ OrgID: 42, Region: 'EMEA', Domain: 'example.com' }]);
        const action = accountsAction({ EnrichOrganization: vi.fn(async () => null) }, {});
        const result = await runAccounts(action, world);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(world.savedFor('Accounts')[0].Values).toMatchObject({ OrgID: 42, Region: 'EMEA', EnrichedAt: expect.any(Date) });
    });

    it('FieldPredicate quotes per the column type: UUID and string keys quoted, integer keys bare', () => {
        const md = { EntityByName: () => ({ Fields: [{ Name: 'AccountID', NeedsQuotes: true }, { Name: 'ContactID', NeedsQuotes: false }] }) } as unknown as Parameters<typeof FieldPredicate>[0];
        expect(FieldPredicate(md, 'X', 'AccountID', "6F9619FF-8B86-D011-B42D-00C04FC964FF")).toBe("[AccountID] = '6F9619FF-8B86-D011-B42D-00C04FC964FF'");
        expect(FieldPredicate(md, 'X', 'ContactID', 9001)).toBe('[ContactID] = 9001');
        expect(FieldPredicate(md, 'X', 'AccountID', "o'k", '<>')).toBe("[AccountID] <> 'o''k'");
    });

    it('IsExcludedTitle and IsValidDate keep their behaviour', () => {
        const action = new ApolloEnrichmentAccountsAction() as unknown as { IsExcludedTitle(t: string): boolean; IsValidDate(d: string): boolean };
        expect(action.IsExcludedTitle(' Student ')).toBe(true);
        expect(action.IsExcludedTitle('CEO')).toBe(false);
        expect(action.IsValidDate('2024-01-15')).toBe(true);
        expect(action.IsValidDate('not-a-date')).toBe(false);
    });
});
