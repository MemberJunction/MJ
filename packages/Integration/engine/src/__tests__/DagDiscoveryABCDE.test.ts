import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJIntegrationObjectEntity, MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import { BaseRESTIntegrationConnector, type RESTAuthContext, type RESTResponse, type PaginationState } from '../BaseRESTIntegrationConnector.js';

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    return { ...actual, RunView: class { async RunView() { return { Success: true, Results: [] }; } } };
});

/**
 * THE DAG EXERCISE, executed rather than described.
 *
 *   A, B, C   top-level objects
 *   D         depends on A AND B      → /a/{aId}/b/{bId}/d   (TWO template vars)
 *   E         depends on D            → /d/{dId}/e           (one template var)
 *
 * Discovery samples ~50 records per table. This measures what each object ACTUALLY gets.
 */
const f = (o: Partial<MJIntegrationObjectFieldEntity>) => o as unknown as MJIntegrationObjectFieldEntity;
const FIELDS: Record<string, MJIntegrationObjectFieldEntity[]> = {
    objA: [f({ Name: 'aId', IsPrimaryKey: true, Status: 'Active', Sequence: 1 })],
    objB: [f({ Name: 'bId', IsPrimaryKey: true, Status: 'Active', Sequence: 1 })],
    objC: [f({ Name: 'cId', IsPrimaryKey: true, Status: 'Active', Sequence: 1 })],
    objD: [
        f({ Name: 'dId', IsPrimaryKey: true, Status: 'Active', Sequence: 1 }),
        f({ Name: 'aId', RelatedIntegrationObjectID: 'objA', Status: 'Active', Sequence: 2 }),
        f({ Name: 'bId', RelatedIntegrationObjectID: 'objB', Status: 'Active', Sequence: 3 }),
    ],
    objE: [
        f({ Name: 'eId', IsPrimaryKey: true, Status: 'Active', Sequence: 1 }),
        f({ Name: 'dId', RelatedIntegrationObjectID: 'objD', Status: 'Active', Sequence: 2 }),
    ],
};
const mk = (ID: string, Name: string, APIPath: string) =>
    ({ ID, Name, APIPath, SupportsPagination: false, PaginationType: 'None', ResponseDataKey: null } as unknown as MJIntegrationObjectEntity);
const objA = mk('objA', 'A', '/a');
const objB = mk('objB', 'B', '/b');
const objC = mk('objC', 'C', '/c');
const objD = mk('objD', 'D', '/a/{aId}/b/{bId}/d');   // multi-parent
const objE = mk('objE', 'E', '/d/{dId}/e');
const BY_ID: Record<string, MJIntegrationObjectEntity> = { objA, objB, objC, objD, objE };
const BY_NAME: Record<string, MJIntegrationObjectEntity> = { A: objA, B: objB, C: objC, D: objD, E: objE };

const rows = (n: number, key: string, prefix: string) =>
    Array.from({ length: n }, (_v, i) => ({ [key]: `${prefix}${i}` }));

class TestConnector extends BaseRESTIntegrationConnector {
    public urls: string[] = [];
    public get IntegrationName(): string { return 'DagExercise'; }
    protected GetCachedObject(_i: string, name: string): MJIntegrationObjectEntity {
        const o = BY_NAME[name]; if (!o) throw new Error(`no object ${name}`); return o;
    }
    protected GetCachedFields(objectID: string): MJIntegrationObjectFieldEntity[] { return FIELDS[objectID] ?? []; }
    protected async Authenticate(): Promise<RESTAuthContext> { return { Token: 't' } as RESTAuthContext; }
    protected BuildHeaders(): Record<string, string> { return {}; }
    protected GetBaseURL(): string { return 'https://api.test'; }
    protected async MakeHTTPRequest(_a: RESTAuthContext, url: string): Promise<RESTResponse> {
        this.urls.push(url);
        const p = url.replace('https://api.test', '');
        // Each top-level endpoint has plenty of rows — more than the 50 target.
        if (p === '/a') return { Status: 200, Body: rows(200, 'aId', 'a'), Headers: {} } as RESTResponse;
        if (p === '/b') return { Status: 200, Body: rows(200, 'bId', 'b'), Headers: {} } as RESTResponse;
        if (p === '/c') return { Status: 200, Body: rows(200, 'cId', 'c'), Headers: {} } as RESTResponse;
        const d = /^\/a\/([^/]+)\/b\/([^/]+)\/d$/.exec(p);
        if (d) return { Status: 200, Body: rows(3, 'dId', `d-${d[1]}-${d[2]}-`), Headers: {} } as RESTResponse;
        const e = /^\/d\/([^/]+)\/e$/.exec(p);
        if (e) return { Status: 200, Body: rows(3, 'eId', `e-${e[1]}-`), Headers: {} } as RESTResponse;
        return { Status: 404, Body: [], Headers: {} } as RESTResponse;
    }
    protected NormalizeResponse(b: unknown): Record<string, unknown>[] { return Array.isArray(b) ? b as Record<string, unknown>[] : []; }
    protected ExtractPaginationInfo(): PaginationState { return { HasMore: false } as PaginationState; }
}

const CI = { IntegrationID: 'int1' } as unknown as MJCompanyIntegrationEntity;
const TARGET = 50;

describe('DAG discovery — A, B, C top-level; D depends on A AND B; E depends on D', () => {
    beforeEach(() => {
        vi.spyOn(IntegrationEngineBase, 'Instance', 'get').mockReturnValue({
            GetIntegrationObjectByID: (id: string) => BY_ID[id],
            GetIntegrationObject: (_i: string, n: string) => BY_NAME[n],
            GetIntegrationObjectFields: (id: string) => FIELDS[id] ?? [],
            GetActiveIntegrationObjects: () => [objA, objB, objC, objD, objE],
        } as unknown as IntegrationEngineBase);
    });

    it('reports what every object in the DAG actually gets sampled', async () => {
        const report: Array<{ object: string; fields: string[]; httpCalls: number }> = [];
        for (const name of ['A', 'B', 'C', 'D', 'E']) {
            const c = new TestConnector();
            const fields = await c.DiscoverFieldsViaFetch(CI, name, {} as UserInfo, { MaxRecords: TARGET });
            report.push({ object: name, fields: fields.map(x => x.Name).sort(), httpCalls: c.urls.length });
        }
        // eslint-disable-next-line no-console
        console.log('\n  object | sampled fields          | http calls\n' +
            report.map(r => `  ${r.object.padEnd(6)} | ${(r.fields.join(',') || '(NONE)').padEnd(23)} | ${r.httpCalls}`).join('\n') + '\n');

        const byName = Object.fromEntries(report.map(r => [r.object, r]));

        // A, B, C — flat endpoints, sampled directly.
        for (const n of ['A', 'B', 'C']) {
            expect(byName[n].fields.length).toBeGreaterThan(0);
            expect(byName[n].httpCalls).toBe(1);
        }

        // D — TWO template vars. Deliberate deferral: resolving only the first var would leave a
        // literal `{bId}` in the URL and fire malformed requests at the vendor. D is not sampled at
        // all and makes ZERO http calls.
        expect(byName['D'].fields).toEqual([]);
        expect(byName['D'].httpCalls).toBe(0);

        // E — ONE template var, so E itself is sampleable in principle. But its parent is D, and the
        // recursion cannot walk D, so E yields nothing either.
        //
        // THE DEFERRAL CASCADES. It is not "multi-parent objects go unsampled" — it is "multi-parent
        // objects AND EVERYTHING BENEATH THEM go unsampled", however deep. Every such object falls
        // back to its declared metadata alone: no custom columns discovered, no observed widths (so
        // declared widths stand and long values are dropped at sync time), and an object with no
        // DECLARED primary key is dropped entirely, because sampling was its only route to one.
        expect(byName['E'].fields).toEqual([]);
        expect(byName['E'].httpCalls).toBe(0);
    });

    it('the dead branch costs nothing at runtime — it fails closed, not expensively', async () => {
        const c = new TestConnector();
        await c.DiscoverFieldsViaFetch(CI, 'E', {} as UserInfo, { MaxRecords: TARGET });
        const path = (re: RegExp) => c.urls.filter(u => re.test(u.replace('https://api.test', ''))).length;
        // eslint-disable-next-line no-console
        console.log(`\n  E's chain: /a=${path(/^\/a$/)} /b=${path(/^\/b$/)} ` +
            `/a/*/b/*/d=${path(/^\/a\/[^/]+\/b\/[^/]+\/d$/)} /d/*/e=${path(/^\/d\/[^/]+\/e$/)}\n`);
        // Nothing above E is touched either: the walk stops at the multi-var boundary rather than
        // pulling ancestors it can never use. Wrong result, but not a wasteful one.
        expect(path(/^\/d\/[^/]+\/e$/)).toBe(0);
        expect(path(/^\/a$/)).toBe(0);
        expect(path(/^\/b$/)).toBe(0);
    });
});
