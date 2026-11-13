/**
 * The MJ_Metadata dataset a client receives carries each row once (IT174, client transport,
 * non-mutating).
 *
 * The server builds its own metadata from this dataset, and the dataset cache then answers every
 * client from the same rows. The server's assembly attaches child collections while it builds, so
 * it must work on copies: rows edited in place would reach every client with each entity's fields,
 * permissions and relationships nested inside it, on top of the flat items that carry them —
 * roughly doubling every cold-boot metadata download.
 *
 * - MP1: entity rows carry no nested child collections.
 * - MP2: entity field rows carry no nested field values or field permissions.
 * - MP3: application rows carry no nested application entities or settings.
 */
import type { DatasetResultType } from '@memberjunction/core';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { Assert, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { NamedCheck } from '@memberjunction/testing-integration';
import { CloseWireSession, OpenWireSession } from './wire-sessions';

const BUNDLE = 'metadata-payload-client';

interface PayloadFixture {
    Session: GraphQLDataProvider;
    /** The dataset as the server sent it, read after the server has built its own metadata. */
    Dataset: DatasetResultType;
}

let fixture: PayloadFixture | undefined;

function fx(): PayloadFixture {
    Assert(fixture != null, `${BUNDLE} fixture missing (bundle Setup did not run)`);
    return fixture!;
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    // Read-only: one session and one dataset read.
    Setup: async () => {
        const session = await OpenWireSession(false);
        const dataset = await session.GetDatasetByName('MJ_Metadata');
        Assert(dataset?.Success === true, `MJ_Metadata read failed: ${dataset?.Status ?? 'no result'}`);
        fixture = { Session: session, Dataset: dataset };
    },
    Teardown: async () => {
        const f = fixture;
        fixture = undefined;
        if (f) {
            CloseWireSession(f.Session);
        }
    }
});

function itemRows(code: string): Record<string, unknown>[] {
    const item = fx().Dataset.Results.find(r => r.Code === code);
    Assert(item != null && Array.isArray(item.Results) && item.Results.length > 0, `MJ_Metadata item ${code} is missing or empty`);
    return item!.Results as Record<string, unknown>[];
}

/** Fails naming the first row that carries any of `keys`, and how many rows do. */
function assertNoNestedKeys(code: string, keys: string[], label: string): void {
    const rows = itemRows(code);
    const carrying = rows.filter(row => keys.some(key => key in row));
    const first = carrying[0];
    const nested = first ? keys.filter(key => key in first).join(', ') : '';
    Assert(carrying.length === 0, `${label}: ${carrying.length} of ${rows.length} ${code} rows arrive with nested ${nested} (first: ${String(first?.['Name'] ?? first?.['ID'])})`);
}

async function checkMp1EntityRowsFlat(): Promise<void> {
    assertNoNestedKeys('Entities', ['EntityFields', 'EntityPermissions', 'EntityRelationships', 'EntitySettings', 'EntityOrganicKeys', 'EntityAlternateBaseViews', 'EntityUniqueKeys'], 'MP1');
}

async function checkMp2FieldRowsFlat(): Promise<void> {
    assertNoNestedKeys('EntityFields', ['EntityFieldValues', 'EntityFieldPermissions'], 'MP2');
}

async function checkMp3ApplicationRowsFlat(): Promise<void> {
    assertNoNestedKeys('Applications', ['ApplicationEntities', 'ApplicationSettings'], 'MP3');
}

export const MetadataPayloadClientChecks: NamedCheck[] = [
    { Id: `${BUNDLE}.MP1`, Name: 'MP1: entity rows a client receives carry no nested child collections', Fn: checkMp1EntityRowsFlat },
    { Id: `${BUNDLE}.MP2`, Name: 'MP2: entity field rows a client receives carry no nested values or permissions', Fn: checkMp2FieldRowsFlat },
    { Id: `${BUNDLE}.MP3`, Name: 'MP3: application rows a client receives carry no nested entities or settings', Fn: checkMp3ApplicationRowsFlat }
];

for (const check of MetadataPayloadClientChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
