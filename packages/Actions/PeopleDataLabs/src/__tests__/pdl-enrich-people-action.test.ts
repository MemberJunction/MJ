import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunActionParams } from '@memberjunction/actions-base';

vi.mock('@memberjunction/actions', () => ({ BaseAction: class { async Run(params: RunActionParams) { return (this as unknown as { InternalRunAction: (p: RunActionParams) => Promise<unknown> }).InternalRunAction(params); } } }));
vi.mock('@memberjunction/global', () => ({ RegisterClass: () => (target: unknown) => target }));
vi.mock('@memberjunction/core', () => ({ LogError: vi.fn(), LogStatus: vi.fn(), RunView: class { RunView() { throw new Error('no database in unit tests'); } } }));
vi.mock('@memberjunction/credentials', () => ({ CredentialEngine: { Instance: { Config: vi.fn(), Credentials: [], GetCredential: vi.fn() } } }));

process.env.PDL_API_KEY = 'env-key';
const { PDLEnrichPeopleAction } = await import('../PDLEnrichPeopleAction.js');
const { PDLCreditsExhaustedError, PDLRateLimitError, PDLAuthError } = await import('../PDLPersonClient.js');
type Client = import('../PDLPersonClient.js').PDLPersonClient;
type Match = import('../PDLPersonClient.js').PDLPersonMatch;

function params(values: Record<string, unknown>): RunActionParams {
    return { Params: Object.entries(values).map(([Name, Value]) => ({ Name, Value, Type: 'Input' })), ContextUser: undefined } as unknown as RunActionParams;
}
function match(key: string, matched: boolean): Match {
    return { Key: key, Matched: matched, PDLID: matched ? 'id' : null, Likelihood: matched ? 8 : null, LinkedInURL: null, Education: [], Experience: [], ErrorMessage: null };
}
function action(fake: Partial<Client>): PDLEnrichPeopleAction {
    const a = new PDLEnrichPeopleAction();
    (a as unknown as { CreateClient: () => Partial<Client> }).CreateClient = () => fake;
    return a;
}

describe('PDLEnrichPeopleAction', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('validates People: missing, unparseable, over 100', async () => {
        const a = action({});
        expect((await a.Run(params({}))).ResultCode).toBe('VALIDATION_ERROR');
        expect((await a.Run(params({ People: '[not json' }))).ResultCode).toBe('VALIDATION_ERROR');
        expect((await a.Run(params({ People: Array.from({ length: 101 }, () => ({ Email: 'x@y.z' })) }))).ResultCode).toBe('VALIDATION_ERROR');
        expect((await a.Run(params({ People: [{ Email: 'x@y.z' }], MinLikelihood: 11 }))).ResultCode).toBe('VALIDATION_ERROR');
    });

    it('passes typed inputs and the likelihood to the client and reports outputs on SUCCESS', async () => {
        const bulk = vi.fn(async () => ({ Matches: [match('0', true), match('k2', false)], CreditsConsumed: 1 }));
        const a = action({ BulkEnrich: bulk as unknown as Client['BulkEnrich'] });
        const p = params({ people: '[{"email":"a@b.c","firstName":"A"},{"Key":"k2","LinkedInURL":"https://linkedin.com/in/x"}]', minlikelihood: '8' });
        const result = await a.Run(p);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(bulk).toHaveBeenCalledWith([{ Key: '0', Email: 'a@b.c', FirstName: 'A' }, { Key: 'k2', LinkedInURL: 'https://linkedin.com/in/x' }], { MinLikelihood: 8 });
        const outputs = Object.fromEntries(p.Params.filter((x) => x.Type === 'Output').map((x) => [x.Name, x.Value]));
        expect(outputs.MatchedCount).toBe(1);
        expect(outputs.CreditsConsumed).toBe(1);
        expect(outputs.KeySource).toBe('environment');
        expect(outputs.Matches).toHaveLength(2);
    });

    it('answers NO_MATCHES when nothing matched, still a success', async () => {
        const a = action({ BulkEnrich: async () => ({ Matches: [match('0', false)], CreditsConsumed: 0 }) });
        const result = await a.Run(params({ People: [{ Email: 'a@b.c' }] }));
        expect(result).toMatchObject({ Success: true, ResultCode: 'NO_MATCHES' });
    });

    it('maps the client errors onto result codes', async () => {
        const run = (error: Error) => action({ BulkEnrich: async () => { throw error; } }).Run(params({ People: [{ Email: 'a@b.c' }] }));
        expect((await run(new PDLRateLimitError('429', 30))).ResultCode).toBe('RATE_LIMITED');
        expect((await run(new PDLCreditsExhaustedError('402'))).ResultCode).toBe('CREDITS_EXHAUSTED');
        expect((await run(new PDLAuthError('401', 401))).ResultCode).toBe('CREDENTIALS_NOT_FOUND');
        expect((await run(new Error('input 0 has no identifying field'))).ResultCode).toBe('VALIDATION_ERROR');
    });

    it('answers CREDENTIALS_NOT_FOUND when no key resolves', async () => {
        const saved = process.env.PDL_API_KEY;
        vi.resetModules();
        process.env.PDL_API_KEY = '';
        const { PDLEnrichPeopleAction: Fresh } = await import('../PDLEnrichPeopleAction.js');
        const result = await new Fresh().Run(params({ People: [{ Email: 'a@b.c' }] }));
        expect(result.ResultCode).toBe('CREDENTIALS_NOT_FOUND');
        process.env.PDL_API_KEY = saved;
    });
});
