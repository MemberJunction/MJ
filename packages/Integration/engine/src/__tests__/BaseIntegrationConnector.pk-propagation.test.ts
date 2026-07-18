/**
 * U1 regression pin — the default IntrospectSchema mapping must PROPAGATE `undefined`
 * PK/FK flags, never coerce them to `false`.
 *
 * The bug: `IsPrimaryKey: f.IsPrimaryKey ?? false` turned a sample's SILENCE (the source
 * has no opinion — e.g. a list API that doesn't report PKs) into a hard "not a PK" opinion.
 * The persist overlay (`decideBooleanOverlay`) then saw a DEFINED `false` that differed from
 * the Declared `true` and let "Discovered" win — wiping the curated primary key (the ACGI
 * keyless-entity root). The overlay itself was already correct; the coercion upstream of it
 * was the fabrication. These tests pin the mapping end of the contract.
 */
import { describe, it, expect } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    type ConnectionTestResult,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type FetchContext,
    type FetchBatchResult,
} from '../BaseIntegrationConnector';

/** Minimal stub connector: one object, three fields exercising the silence/affirmation matrix. */
class StubConnector extends BaseIntegrationConnector {
    public async TestConnection(): Promise<ConnectionTestResult> {
        return { Success: true, Message: 'ok' };
    }
    public async DiscoverObjects(): Promise<ExternalObjectSchema[]> {
        return [{ Name: 'contacts', Label: 'Contacts', SupportsIncrementalSync: false, SupportsWrite: false }];
    }
    public async DiscoverFields(): Promise<ExternalFieldSchema[]> {
        return [
            // Source SILENT on PK/FK — must stay undefined through the mapping.
            { Name: 'email', Label: 'Email', DataType: 'string', IsRequired: false, IsUniqueKey: true, IsReadOnly: false },
            // Source AFFIRMS PK — must stay true.
            { Name: 'id', Label: 'ID', DataType: 'string', IsRequired: true, IsUniqueKey: true, IsReadOnly: true, IsPrimaryKey: true },
            // Source AFFIRMS "not a PK" — an explicit false is a real opinion and must survive too.
            { Name: 'name', Label: 'Name', DataType: 'string', IsRequired: false, IsUniqueKey: false, IsReadOnly: false, IsPrimaryKey: false, IsForeignKey: false },
        ];
    }
    public async FetchChanges(_ctx: FetchContext): Promise<FetchBatchResult> {
        return { Records: [], HasMore: false };
    }
}

const ci = { Configuration: null } as unknown as MJCompanyIntegrationEntity;
const user = {} as unknown as UserInfo;

describe('BaseIntegrationConnector.IntrospectSchema PK/FK propagation (U1)', () => {
    it('propagates undefined (source silence) — never coerces to false', async () => {
        const schema = await new StubConnector().IntrospectSchema(ci, user);
        const fields = schema.Objects[0].Fields;
        const email = fields.find(f => f.Name === 'email')!;
        expect(email.IsPrimaryKey).toBeUndefined();
        expect(email.IsForeignKey).toBeUndefined();
    });

    it('propagates an affirmed true unchanged', async () => {
        const schema = await new StubConnector().IntrospectSchema(ci, user);
        const id = schema.Objects[0].Fields.find(f => f.Name === 'id')!;
        expect(id.IsPrimaryKey).toBe(true);
    });

    it('propagates an affirmed false unchanged (a real opinion, distinct from silence)', async () => {
        const schema = await new StubConnector().IntrospectSchema(ci, user);
        const name = schema.Objects[0].Fields.find(f => f.Name === 'name')!;
        expect(name.IsPrimaryKey).toBe(false);
        expect(name.IsForeignKey).toBe(false);
    });

    it('PrimaryKeyFields lists only affirmed PKs (silence and false both excluded)', async () => {
        const schema = await new StubConnector().IntrospectSchema(ci, user);
        expect(schema.Objects[0].PrimaryKeyFields).toEqual(['id']);
    });
});
