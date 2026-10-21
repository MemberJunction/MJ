/**
 * A table selection's ids resolve against the CONNECTION's catalog, and an apply that resolves
 * nothing builds nothing.
 *
 * Inside a catalog scope, `IntegrationListSourceObjects` hands the picker per-connection
 * (CompanyIntegrationObject) ids. Every name lookup the apply paths ran read only the shared
 * `MJ: Integration Objects` catalog, so an id-only selection was dropped with a LogError, the
 * migration ran with an empty table list, CodeGen and the restart still ran, and the apply reported
 * Success with 0 tables — 118 picked, 0 built, twice, on a WordPress connection.
 *
 * These pin the lookup the four resolver paths now share, and — against the source, because the
 * resolver needs a provider, a connector and an RSU pipeline to invoke — that the apply refuses an
 * empty resolution before it builds anything.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RunView, type UserInfo } from '@memberjunction/core';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import { WithCatalogScope } from '@memberjunction/integration-engine';
import { LookupObjectNamesByID, OBJECT_ID_LOOKUP_CHUNK } from '../integration/ObjectNamesByID.js';

const USER = { ID: 'user-1' } as UserInfo;
type RunViewParams = Parameters<RunView['RunView']>[0];
type RunViewResult = Awaited<ReturnType<RunView['RunView']>>;

/** An engine holding a per-connection catalog: each row is a CIO id, its shared IO id, and a name. */
function installEngine(rows: Array<{ ID: string; IntegrationObjectID: string | null; Name: string }>, hasCatalog = true) {
    vi.spyOn(IntegrationEngineBase, 'Instance', 'get').mockReturnValue({
        HasCompanyIntegrationCatalog: () => hasCatalog,
        GetCompanyIntegrationObjects: () => rows,
    } as unknown as IntegrationEngineBase);
}

describe('LookupObjectNamesByID', () => {
    let runView: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        runView = vi.spyOn(RunView.prototype, 'RunView');
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('resolves per-connection ids from the scope\'s catalog with no query, whatever their case', async () => {
        installEngine([
            { ID: 'cio-aaa', IntegrationObjectID: 'io-111', Name: 'posts' },
            { ID: 'cio-bbb', IntegrationObjectID: null, Name: 'pages' },
        ]);

        const map = await WithCatalogScope('CI-1', () => LookupObjectNamesByID(['CIO-AAA', 'cio-bbb'], USER));

        expect(map.get('CIO-AAA')).toBe('posts');
        expect(map.get('CIO-BBB')).toBe('pages');
        expect(runView).not.toHaveBeenCalled();
    });

    it('also resolves a shared IntegrationObject id through the row that carries it', async () => {
        installEngine([{ ID: 'cio-aaa', IntegrationObjectID: 'io-111', Name: 'posts' }]);

        const map = await WithCatalogScope('CI-1', () => LookupObjectNamesByID(['IO-111'], USER));

        expect(map.get('IO-111')).toBe('posts');
        expect(runView).not.toHaveBeenCalled();
    });

    it('reads a cache miss straight from the connection\'s catalog: one uncached query, scoped to the connection', async () => {
        installEngine([{ ID: 'cio-aaa', IntegrationObjectID: null, Name: 'posts' }]);
        runView.mockResolvedValue({ Success: true, Results: [{ ID: 'cio-new', Name: 'comments' }] } as unknown as RunViewResult);

        const map = await WithCatalogScope('CI-1', () => LookupObjectNamesByID(['cio-aaa', 'cio-new'], USER));

        expect(runView).toHaveBeenCalledTimes(1);
        const params = runView.mock.calls[0][0] as RunViewParams;
        expect(params.EntityName).toBe('MJ: Company Integration Objects');
        expect(params.ExtraFilter).toBe("CompanyIntegrationID='CI-1' AND ID IN ('CIO-NEW')");
        expect(params.BypassCache).toBe(true);
        expect(params.IgnoreMaxRows).toBe(true);
        expect(map.get('CIO-NEW')).toBe('comments');
        expect(map.get('CIO-AAA')).toBe('posts');
    });

    it(`reads cache misses ${OBJECT_ID_LOOKUP_CHUNK} ids per query`, async () => {
        installEngine([]);
        runView.mockResolvedValue({ Success: true, Results: [] } as unknown as RunViewResult);
        const ids = Array.from({ length: OBJECT_ID_LOOKUP_CHUNK + 1 }, (_, i) => `cio-${i}`);

        await WithCatalogScope('CI-1', () => LookupObjectNamesByID(ids, USER));

        const perConnection = runView.mock.calls.filter(c => (c[0] as RunViewParams).EntityName === 'MJ: Company Integration Objects');
        expect(perConnection).toHaveLength(2);
    });

    it('falls through to the shared catalog only for ids neither tier resolved', async () => {
        installEngine([]);
        runView
            .mockResolvedValueOnce({ Success: true, Results: [] } as unknown as RunViewResult)
            .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'io-9', Name: 'users' }] } as unknown as RunViewResult);

        const map = await WithCatalogScope('CI-1', () => LookupObjectNamesByID(['io-9'], USER));

        expect(runView).toHaveBeenCalledTimes(2);
        expect((runView.mock.calls[1][0] as RunViewParams).EntityName).toBe('MJ: Integration Objects');
        expect(map.get('IO-9')).toBe('users');
    });

    it('outside a catalog scope, queries only the shared catalog — exactly as before', async () => {
        installEngine([{ ID: 'cio-aaa', IntegrationObjectID: null, Name: 'posts' }]);
        runView.mockResolvedValue({ Success: true, Results: [{ ID: 'io-1', Name: 'users' }] } as unknown as RunViewResult);

        const map = await LookupObjectNamesByID(['io-1'], USER);

        expect(runView).toHaveBeenCalledTimes(1);
        const params = runView.mock.calls[0][0] as RunViewParams;
        expect(params.EntityName).toBe('MJ: Integration Objects');
        expect(params.ExtraFilter).toBe("ID='IO-1'");
        expect(map.get('IO-1')).toBe('users');
    });

    it('quotes ids, so a stray quote cannot break out of the filter', async () => {
        installEngine([]);
        runView.mockResolvedValue({ Success: true, Results: [] } as unknown as RunViewResult);

        await LookupObjectNamesByID(["x' OR 1=1 --"], USER);

        expect((runView.mock.calls[0][0] as RunViewParams).ExtraFilter).toBe("ID='X'' OR 1=1 --'");
    });

    it('asks nothing for an empty selection', async () => {
        installEngine([]);
        expect((await LookupObjectNamesByID([], USER)).size).toBe(0);
        expect(runView).not.toHaveBeenCalled();
    });
});

describe('the resolver uses the lookup, and refuses to build an empty resolution', () => {
    const source = readFileSync(join(__dirname, '../resolvers/IntegrationDiscoveryResolver.ts'), 'utf8');
    const body = (signature: string): string => {
        const start = source.indexOf(signature);
        expect(start, `not found: ${signature}`).toBeGreaterThan(-1);
        return source.slice(start, source.indexOf('\n    }\n', start));
    };

    it.each([
        'private async resolveSelectionPlan(',
        'private async resolveSourceObjectNames(',
        'private async resolveSourceObjectsToNames(',
        'private async resolveObjectInputs(',
    ])('%s resolves ids through LookupObjectNamesByID, never the shared catalog alone', (signature) => {
        const fn = body(signature);
        expect(fn).toContain('LookupObjectNamesByID(');
        expect(fn).not.toContain("EntityName: 'MJ: Integration Objects'");
    });

    it('IntegrationApplyAll refuses an empty resolution BEFORE the schema build', () => {
        const resolve = source.indexOf('const resolved = await this.resolveSourceObjectsToNames(input.SourceObjects, sourceSchema, user);');
        expect(resolve).toBeGreaterThan(-1);
        const refusal = source.indexOf('input.SourceObjects.length > 0 && resolvedNames.length === 0', resolve);
        const build = source.indexOf('this.buildSchemaForConnector(', resolve);
        expect(refusal).toBeGreaterThan(resolve);
        expect(refusal).toBeLessThan(build);
        expect(source.slice(refusal, build)).toContain('Success: false');
        expect(source.slice(refusal, build)).toContain('Apply refused');
    });

    it('the batch flow throws on an empty resolution, mirroring the filtered flow', () => {
        expect(source).toContain('connInput.SourceObjects.length > 0 && resolvedNames.length === 0');
        expect(source).toContain('No source objects resolved');
    });
});
