/**
 * MJ-RUN-35 needs the source's stated total to reach the engine. The REST base parsed it into its
 * pagination state and stopped there, so FETCH_SHORT_OF_SOURCE_TOTAL never ran for a REST connector.
 */
import { describe, it, expect } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJIntegrationObjectEntity, MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
import { BaseRESTIntegrationConnector, type RESTAuthContext, type RESTResponse, type PaginationState } from '../BaseRESTIntegrationConnector.js';
import type { FetchContext } from '../BaseIntegrationConnector.js';

const things = {
    ID: 'io-things',
    Name: 'things',
    APIPath: '/things',
    SupportsPagination: true,
    PaginationType: 'Offset',
    DefaultPageSize: 2,
    ResponseDataKey: null,
} as unknown as MJIntegrationObjectEntity;

/** Serves `rows` two at a time; `statedTotal` is what each page says the object holds, or undefined. */
class PagedConnector extends BaseRESTIntegrationConnector {
    constructor(private readonly rows: Record<string, unknown>[], private readonly statedTotal: number | undefined) {
        super();
    }
    public get IntegrationName(): string { return 'Test'; }
    protected GetCachedObject(): MJIntegrationObjectEntity { return things; }
    protected GetCachedFields(): MJIntegrationObjectFieldEntity[] { return []; }
    protected async Authenticate(): Promise<RESTAuthContext> { return { Token: 't' } as RESTAuthContext; }
    protected BuildHeaders(): Record<string, string> { return {}; }
    protected GetBaseURL(): string { return 'https://api.test'; }
    protected async MakeHTTPRequest(_a: RESTAuthContext, url: string): Promise<RESTResponse> {
        const offset = Number(new URL(url).searchParams.get('offset') ?? 0);
        return { Status: 200, Body: this.rows.slice(offset, offset + 2), Headers: {} } as RESTResponse;
    }
    protected NormalizeResponse(body: unknown): Record<string, unknown>[] {
        return Array.isArray(body) ? body as Record<string, unknown>[] : [];
    }
    protected ExtractPaginationInfo(_body: unknown, _type: string, page: number, offset: number, pageSize: number): PaginationState {
        const next = offset + pageSize;
        return { HasMore: next < this.rows.length, NextOffset: next, NextPage: page + 1, TotalRecords: this.statedTotal };
    }
}

const ctx: FetchContext = {
    CompanyIntegration: { IntegrationID: 'int1' } as unknown as MJCompanyIntegrationEntity,
    ObjectName: 'things',
    WatermarkValue: null,
    BatchSize: 100,
    ContextUser: {} as UserInfo,
};

const rows = (n: number) => Array.from({ length: n }, (_v, i) => ({ id: `t${i}` }));

describe('BaseRESTIntegrationConnector carries the stated total out', () => {
    it('returns the total the API stated as SourceTotalRecords', async () => {
        const out = await new PagedConnector(rows(5), 7).FetchChanges(ctx);
        expect(out.Records).toHaveLength(5);
        expect(out.SourceTotalRecords).toBe(7);
    });

    it('leaves it absent when the API never stated one — absent is not zero', async () => {
        const out = await new PagedConnector(rows(3), undefined).FetchChanges(ctx);
        expect(out.Records).toHaveLength(3);
        expect(out.SourceTotalRecords).toBeUndefined();
    });
});
