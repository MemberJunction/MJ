/**
 * Regression pin: a declarative REST connector's DiscoverFields must report the DECLARED
 * primary key.
 *
 * The bug: `FieldEntityToSchema` — the converter DiscoverFields runs every cached field through —
 * set `IsUniqueKey: f.IsUniqueKey || f.IsPrimaryKey` and never set `IsPrimaryKey` at all. An apply
 * builds field maps with `fm.IsKeyField = field.IsPrimaryKey ?? false`, so EVERY field map of
 * EVERY declarative REST connector came out keyless, and object-state reported "NO KEY FIELD:
 * every row is unmatchable, so writes cannot be reconciled" — for objects whose catalog declared
 * the key correctly. `IsUniqueKey` is not a stand-in: IsKeyField was deliberately narrowed from
 * unique to primary (PK ≠ unique), which is what made the omission stop syncing rather than merely
 * lose a flag.
 */
import { describe, it, expect } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntity,
    MJIntegrationObjectEntity,
    MJIntegrationObjectFieldEntity,
} from '@memberjunction/core-entities';
import { BaseRESTIntegrationConnector } from '../BaseRESTIntegrationConnector';
import type { FetchContext, FetchBatchResult, ConnectionTestResult, ExternalObjectSchema } from '../BaseIntegrationConnector';

const field = (name: string, over: Partial<MJIntegrationObjectFieldEntity> = {}) =>
    ({
        Name: name,
        DisplayName: name,
        Description: null,
        Type: 'String',
        IsRequired: false,
        IsReadOnly: false,
        IsPrimaryKey: false,
        IsUniqueKey: false,
        RelatedIntegrationObjectID: null,
        RelatedIntegrationObject: null,
        Sequence: 0,
        ...over,
    }) as unknown as MJIntegrationObjectFieldEntity;

/** A declarative REST connector whose catalog says: mediaId is the key, alias is merely unique. */
class StubRESTConnector extends BaseRESTIntegrationConnector {
    protected override GetCachedObject(): MJIntegrationObjectEntity {
        return { ID: 'obj-1', Name: 'ApplicationFile' } as unknown as MJIntegrationObjectEntity;
    }
    protected override GetCachedFields(): MJIntegrationObjectFieldEntity[] {
        return [
            field('mediaId', { IsPrimaryKey: true, IsRequired: true }),
            field('alias', { IsUniqueKey: true }),
            field('caption'),
        ];
    }

    // Abstract transport members — unused by DiscoverFields, which is cache-driven.
    protected async Authenticate(): Promise<Record<string, unknown>> { return {}; }
    protected BuildHeaders(): Record<string, string> { return {}; }
    protected async MakeHTTPRequest(): Promise<unknown> { return {}; }
    protected NormalizeResponse(): Record<string, unknown>[] { return []; }
    protected ExtractPaginationInfo(): { HasMore: boolean; NextCursor?: string } { return { HasMore: false }; }
    protected GetBaseURL(): string { return 'https://example.invalid'; }
    public async TestConnection(): Promise<ConnectionTestResult> { return { Success: true, Message: 'ok' }; }
    public async DiscoverObjects(): Promise<ExternalObjectSchema[]> { return []; }
    public override async FetchChanges(_ctx: FetchContext): Promise<FetchBatchResult> { return { Records: [], HasMore: false }; }
}

const ci = { IntegrationID: 'int-1' } as unknown as MJCompanyIntegrationEntity;
const user = {} as unknown as UserInfo;

describe('BaseRESTIntegrationConnector.DiscoverFields — declared PK propagation', () => {
    it('reports the declared primary key, which is what becomes IsKeyField on the field map', async () => {
        const fields = await new StubRESTConnector().DiscoverFields(ci, 'ApplicationFile', user);
        expect(fields.find(f => f.Name === 'mediaId')!.IsPrimaryKey).toBe(true);
    });

    it('does not promote a merely-unique field to primary key', async () => {
        const fields = await new StubRESTConnector().DiscoverFields(ci, 'ApplicationFile', user);
        const alias = fields.find(f => f.Name === 'alias')!;
        expect(alias.IsUniqueKey).toBe(true);
        expect(alias.IsPrimaryKey).toBe(false);
    });

    it('leaves an ordinary field neither key nor unique', async () => {
        const fields = await new StubRESTConnector().DiscoverFields(ci, 'ApplicationFile', user);
        const caption = fields.find(f => f.Name === 'caption')!;
        expect(caption.IsPrimaryKey).toBe(false);
        expect(caption.IsUniqueKey).toBe(false);
    });

    it('still treats the primary key as unique', async () => {
        const fields = await new StubRESTConnector().DiscoverFields(ci, 'ApplicationFile', user);
        expect(fields.find(f => f.Name === 'mediaId')!.IsUniqueKey).toBe(true);
    });
});
