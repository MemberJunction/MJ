import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
//
// `initializeOAuth` succeeds and hands back a tenant token, so every test here is
// about what happens *after* the CompanyIntegration resolved — which token the
// calls end up using, and what reaches the createPost mutation.
// ---------------------------------------------------------------------------

const TENANT_TOKEN = 'tenant-company-integration-token';

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
    BaseOAuthAction: class BaseOAuthAction {
        protected oauthParams: unknown[] = [{ Name: 'CompanyIntegrationID', Type: 'Input', Value: null }];
        public initializeOAuthCalls: unknown[] = [];
        protected async initializeOAuth(companyIntegrationId: string): Promise<boolean> {
            this.initializeOAuthCalls.push(companyIntegrationId);
            return true;
        }
        protected getAccessToken(): string | null {
            return TENANT_TOKEN;
        }
        protected getCustomAttribute(): string | null {
            return null;
        }
        protected getParamValue(params: Array<{ Name: string; Value: unknown }>, name: string): unknown {
            return params.find(p => p.Name === name)?.Value ?? null;
        }
    },
    OAuth2Manager: class OAuth2Manager {},
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
}));

/**
 * Stands in for `CredentialEngine`, which extends `BaseEngine` and reaches for a provider these
 * suites deliberately do not have.
 *
 * `rows` is what the engine has cached; `values` is what `getCredential` resolves to. Both are
 * settable per test. `getCredential` is a spy, so "did the credential path go through the engine"
 * is itself an assertion — a regression to a raw `RunView` would show up as it never being called.
 */
const credentialStore = {
    rows: [] as Array<{ ID: string; Name: string; IsActive: boolean }>,
    values: {} as Record<string, string>,
    config: vi.fn(async () => undefined),
    getCredential: vi.fn(async () => ({ values: credentialStore.values })),
};

/**
 * `CredentialEngine` is mocked, not exercised: it extends `BaseEngine` and reaches for a provider,
 * which these suites deliberately do not have. What IS asserted is that the credential path goes
 * THROUGH the engine — `getCredential` is a spy, so a regression back to a raw `RunView` would show
 * up as this never being called.
 */
vi.mock('@memberjunction/credentials', () => ({
  CredentialEngine: {
    Instance: {
      Config: (...args: unknown[]) => credentialStore.config(...args),
      get Credentials() {
        return credentialStore.rows;
      },
      getCredential: (...args: unknown[]) => credentialStore.getCredential(...args),
    },
  },
}));

vi.mock('@memberjunction/core', () => ({
    UserInfo: class UserInfo {},
    Metadata: vi.fn(),
    LogStatus: vi.fn(),
    LogError: vi.fn(),
    RunView: class RunView {
        public async RunView(params: { ExtraFilter?: string }): Promise<unknown> {
            credentialView.filters.push(params.ExtraFilter ?? '');
            return credentialView.reply;
        }
    },
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJCompanyIntegrationEntity: class MJCompanyIntegrationEntity {},
}));

vi.mock('@memberjunction/actions-base', () => ({}));

vi.mock('axios', () => ({
    default: { post: vi.fn(), isAxiosError: vi.fn(() => false) },
}));

import { BufferCreatePostAction } from '../providers/buffer/actions/create-post.action';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

interface GraphQLCall {
    token: string | null;
    variables: Record<string, unknown> | undefined;
}

/**
 * The action with its one network method replaced. `executeGraphQL` is the single
 * point every Buffer call funnels through, so recording the token it resolved at
 * that moment is exactly the assertion the credential override needs.
 */
class TestCreatePostAction extends BufferCreatePostAction {
    public Calls: GraphQLCall[] = [];
    public FailWith: Error | null = null;

    protected override async executeGraphQL<T>(_query: string, variables?: Record<string, unknown>): Promise<T> {
        this.Calls.push({ token: this.getAccessToken(), variables });
        if (this.FailWith) throw this.FailWith;
        const input = (variables?.input ?? {}) as { channelId?: string; text?: string };
        return {
            createPost: {
                post: {
                    id: `post-${this.Calls.length}`,
                    text: input.text ?? '',
                    status: 'buffer',
                    dueAt: null,
                    sentAt: null,
                    createdAt: '2026-08-05T00:00:00Z',
                    updatedAt: '2026-08-05T00:00:00Z',
                    channelId: input.channelId ?? '',
                    channelService: 'linkedin',
                    schedulingType: 'automatic',
                    via: 'api',
                    assets: null,
                    tags: [],
                },
            },
        } as T;
    }
}

type Params = { Params: Array<{ Name: string; Type: string; Value: unknown }>; ContextUser: unknown };

async function run(inputs: Record<string, unknown>, configure?: (a: TestCreatePostAction) => void) {
    const action = new TestCreatePostAction();
    configure?.(action);
    const params: Params = {
        Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Value, Type: 'Input' })),
        ContextUser: {},
    };
    const result = await (action as unknown as {
        InternalRunAction(p: Params): Promise<{ Success: boolean; ResultCode?: string; Message?: string }>;
    }).InternalRunAction(params);
    return { result, action, params };
}

/** The `input` object of the nth createPost mutation. */
function mutationInput(action: TestCreatePostAction, index = 0): Record<string, unknown> {
    return action.Calls[index].variables?.input as Record<string, unknown>;
}

/** An active credential the engine can resolve, carrying `values`. */
function credentialRow(values: Record<string, string>, opts: { active?: boolean } = {}) {
    credentialStore.rows = [{ ID: 'cred-1', Name: 'Employee Buffer', IsActive: opts.active !== false }];
    credentialStore.values = values;
}

const BASE = { CompanyIntegrationID: 'ci-1', ChannelIDs: ['chan-1'], Content: 'Hello' };

beforeEach(() => {
    credentialStore.rows = [];
    credentialStore.values = {};
    credentialStore.config.mockClear();
    credentialStore.getCredential.mockClear();
});

// ---------------------------------------------------------------------------
// Identity: whose token the calls are made with
// ---------------------------------------------------------------------------

describe('Buffer CredentialID — acting as another identity', () => {
    it("uses the CompanyIntegration's own token when no CredentialID is given", async () => {
        const { result, action } = await run(BASE);
        expect(result.Success).toBe(true);
        expect(action.Calls[0].token).toBe(TENANT_TOKEN);
        // Nothing should have been asked of the credential store at all.
        expect(credentialStore.getCredential).not.toHaveBeenCalled();
    });

    it('uses the credential token when a CredentialID is given', async () => {
        credentialRow({ accessToken: 'employee-personal-token' });
        const { result, action } = await run({ ...BASE, CredentialID: 'cred-1' });
        expect(result.Success).toBe(true);
        expect(action.Calls[0].token).toBe('employee-personal-token');
    });

    it('still requires CompanyIntegrationID, which says which integration this is', async () => {
        credentialRow({ accessToken: 'employee-personal-token' });
        const { result } = await run({ ChannelIDs: ['chan-1'], Content: 'Hello', CredentialID: 'cred-1' });
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('MISSING_PARAM');
    });

    it('resolves through CredentialEngine, so the access is audited', async () => {
        // The engine's getCredential writes an MJ: Audit Logs row and stamps LastUsedAt. For a
        // feature whose whole purpose is publishing as SOMEONE ELSE, that record is the point --
        // so "went through the engine" is asserted directly rather than assumed.
        credentialRow({ accessToken: 'tok' });
        await run({ ...BASE, CredentialID: 'cred-1' });
        expect(credentialStore.getCredential).toHaveBeenCalledTimes(1);
        expect(credentialStore.getCredential.mock.calls[0][1]).toMatchObject({
            credentialId: 'cred-1',
            subsystem: 'Buffer',
        });
    });

    it('refuses an INACTIVE credential, which the engine does not check on the by-id path', async () => {
        // CredentialEngine filters IsActive on its by-NAME path only; this resolves by ID. Dropping
        // the explicit check while adopting the engine would have silently widened what is accepted.
        credentialRow({ accessToken: 'tok' }, { active: false });
        const { result, action } = await run({ ...BASE, CredentialID: 'cred-1' });
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('INVALID_CREDENTIAL');
        expect(result.Message).toMatch(/not active/);
        expect(action.Calls).toHaveLength(0);
        expect(credentialStore.getCredential).not.toHaveBeenCalled();
    });

    it('fails rather than falling back to the tenant token when the credential is missing', async () => {
        // Falling back would publish under the wrong identity with nothing to notice.
        credentialStore.rows = [];
        const { result, action } = await run({ ...BASE, CredentialID: 'cred-1' });
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('INVALID_CREDENTIAL');
        expect(result.Message).toMatch(/not found/);
        expect(action.Calls).toHaveLength(0);
    });

    it('fails when the engine cannot resolve the credential', async () => {
        // Previously this asserted a decrypt-shaped message from a manual JSON.parse. The engine
        // owns parsing and schema validation now, so what matters is that a resolution failure is
        // fatal rather than a silent fallback to the tenant token.
        credentialRow({ accessToken: 'tok' });
        credentialStore.getCredential.mockRejectedValueOnce(new Error('values failed schema validation'));
        const { result, action } = await run({ ...BASE, CredentialID: 'cred-1' });
        expect(result.ResultCode).toBe('INVALID_CREDENTIAL');
        expect(result.Message).toMatch(/could not be resolved/);
        expect(action.Calls).toHaveLength(0);
    });

    it('fails when the credential carries no accessToken', async () => {
        credentialRow({ apiKey: 'wrong-field' });
        const { result } = await run({ ...BASE, CredentialID: 'cred-1' });
        expect(result.ResultCode).toBe('INVALID_CREDENTIAL');
        expect(result.Message).toMatch(/no accessToken/);
    });

    it('fails on an empty accessToken rather than sending an empty bearer header', async () => {
        credentialRow({ accessToken: '' });
        const { result } = await run({ ...BASE, CredentialID: 'cred-1' });
        expect(result.ResultCode).toBe('INVALID_CREDENTIAL');
    });

    it('applies the credential token to every channel in a multi-channel post', async () => {
        credentialRow({ accessToken: 'employee-personal-token' });
        const { action } = await run({ ...BASE, ChannelIDs: ['chan-1', 'chan-2', 'chan-3'], CredentialID: 'cred-1' });
        expect(action.Calls).toHaveLength(3);
        expect(action.Calls.map(c => c.token)).toEqual(Array(3).fill('employee-personal-token'));
    });

    it('does not leak one action run\'s credential token into another', async () => {
        credentialRow({ accessToken: 'employee-personal-token' });
        await run({ ...BASE, CredentialID: 'cred-1' });

        const { action } = await run(BASE);
        expect(action.Calls[0].token).toBe(TENANT_TOKEN);
    });

    it('advertises CredentialID as an input param', () => {
        const names = new TestCreatePostAction().Params.map(p => p.Name);
        expect(names).toContain('CredentialID');
    });
});

// ---------------------------------------------------------------------------
// PlatformMetadata
// ---------------------------------------------------------------------------

describe('Buffer PlatformMetadata — per-service extras', () => {
    it('sends no metadata when none was given', async () => {
        // Undefined, like the sibling `dueAt`/`assets` inputs — JSON serialization
        // drops it, so nothing reaches Buffer.
        const { action } = await run(BASE);
        expect(mutationInput(action).metadata).toBeUndefined();
        expect(JSON.parse(JSON.stringify(mutationInput(action)))).not.toHaveProperty('metadata');
    });

    it('passes an object through untouched', async () => {
        const metadata = { linkedin: { annotations: [{ entity: 'urn:li:organization:1', start: 0, length: 5 }] } };
        const { action } = await run({ ...BASE, PlatformMetadata: metadata });
        expect(mutationInput(action).metadata).toEqual(metadata);
    });

    it('accepts a JSON string, which is how UI and agent inputs arrive', async () => {
        const { action } = await run({ ...BASE, PlatformMetadata: '{"linkedin":{"annotations":[]}}' });
        expect(mutationInput(action).metadata).toEqual({ linkedin: { annotations: [] } });
    });

    it('treats an empty string as absent rather than as bad input', async () => {
        const { result, action } = await run({ ...BASE, PlatformMetadata: '' });
        expect(result.Success).toBe(true);
        expect(mutationInput(action).metadata).toBeUndefined();
    });

    it('fails on unparseable JSON instead of silently posting without the metadata', async () => {
        // Dropping it would publish plain text where the caller composed a mention.
        const { result, action } = await run({ ...BASE, PlatformMetadata: '{linkedin:' });
        expect(result.Success).toBe(false);
        expect(result.Message).toMatch(/not valid JSON/);
        expect(action.Calls).toHaveLength(0);
    });

    it('rejects a non-object, since Buffer keys metadata by service name', async () => {
        for (const bad of [['linkedin'], '["linkedin"]', 42]) {
            const { result } = await run({ ...BASE, PlatformMetadata: bad });
            expect(result.Success).toBe(false);
            expect(result.Message).toMatch(/keyed by service name/);
        }
    });

    it('sends the same metadata to each channel of a multi-channel post', async () => {
        const metadata = { linkedin: { annotations: [] } };
        const { action } = await run({ ...BASE, ChannelIDs: ['chan-1', 'chan-2'], PlatformMetadata: metadata });
        expect(action.Calls).toHaveLength(2);
        expect(mutationInput(action, 0).metadata).toEqual(metadata);
        expect(mutationInput(action, 1).metadata).toEqual(metadata);
    });

    it('advertises PlatformMetadata as an input param', () => {
        const names = new TestCreatePostAction().Params.map(p => p.Name);
        expect(names).toContain('PlatformMetadata');
    });
});

// ---------------------------------------------------------------------------
// Asset input shape
// ---------------------------------------------------------------------------

describe('Buffer assets — the AssetInput array shape', () => {
    it('sends one array entry per image, each naming its kind', async () => {
        // Buffer moved createPost to `[AssetInput!]` on 2026-05-25 and rejects the
        // older { images: [...] } object outright, so the shape is the whole point.
        const { action } = await run({ ...BASE, ImageURLs: ['https://example.org/a.png', 'https://example.org/b.png'] });
        expect(mutationInput(action).assets).toEqual([
            { image: { url: 'https://example.org/a.png' } },
            { image: { url: 'https://example.org/b.png' } },
        ]);
    });

    it('names videos and links by their own kinds', async () => {
        const { action } = await run({
            ...BASE,
            VideoURLs: ['https://example.org/v.mp4'],
            MediaLink: 'https://example.org/article',
            MediaDescription: 'An article',
        });
        expect(mutationInput(action).assets).toEqual([
            { video: { url: 'https://example.org/v.mp4' } },
            { link: { url: 'https://example.org/article', description: 'An article' } },
        ]);
    });

    it('keeps images, then videos, then the link in one flat array', async () => {
        const { action } = await run({
            ...BASE,
            ImageURLs: ['https://example.org/a.png'],
            VideoURLs: ['https://example.org/v.mp4'],
            MediaLink: 'https://example.org/article',
        });
        expect(mutationInput(action).assets).toEqual([
            { image: { url: 'https://example.org/a.png' } },
            { video: { url: 'https://example.org/v.mp4' } },
            { link: { url: 'https://example.org/article', description: undefined } },
        ]);
    });

    it('sends no assets when there is no media', async () => {
        const { action } = await run(BASE);
        expect(mutationInput(action).assets).toBeUndefined();
    });

    it('skips an empty URL rather than sending an asset with no url', async () => {
        const { action } = await run({ ...BASE, ImageURLs: ['', 'https://example.org/a.png'] });
        expect(mutationInput(action).assets).toEqual([{ image: { url: 'https://example.org/a.png' } }]);
    });
});

// ---------------------------------------------------------------------------
// The two together — the employee-mention publish this exists for
// ---------------------------------------------------------------------------

describe('Buffer create post — publishing as an employee with a mention', () => {
    it('sends the employee token and the LinkedIn annotations in one call', async () => {
        credentialRow({ accessToken: 'employee-personal-token' });
        const annotations = [{ entity: 'urn:li:organization:42', start: 6, length: 9 }];
        const { result, action } = await run({
            CompanyIntegrationID: 'ci-1',
            CredentialID: 'cred-1',
            ChannelIDs: ['chan-1'],
            Content: 'Thanks @Acme Corp for hosting',
            ImageURLs: ['https://example.org/card.png'],
            PlatformMetadata: { linkedin: { annotations } },
        });

        expect(result.Success).toBe(true);
        expect(action.Calls[0].token).toBe('employee-personal-token');
        expect(mutationInput(action)).toMatchObject({
            channelId: 'chan-1',
            text: 'Thanks @Acme Corp for hosting',
            mode: 'addToQueue',
            metadata: { linkedin: { annotations } },
        });
    });

    it('reports a mutation failure without claiming a post was made', async () => {
        credentialRow({ accessToken: 'employee-personal-token' });
        const { result } = await run(
            { ...BASE, CredentialID: 'cred-1' },
            a => { a.FailWith = new Error('channel is disconnected'); },
        );
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('CREATE_FAILED');
        expect(result.Message).toMatch(/channel is disconnected/);
    });
});
