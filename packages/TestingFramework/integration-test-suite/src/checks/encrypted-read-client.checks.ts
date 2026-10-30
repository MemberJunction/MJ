/**
 * Encrypted field read over the wire (IT149, client transport, mutating).
 *
 * `MJ: Credentials.Values` is encrypted at rest with `AllowDecryptInAPI` on, so a GraphQL caller
 * must receive plaintext on `Load`, on a first `RunView` (cache miss), on a repeated `RunView`
 * (server cache hit, materialized from the stored ciphertext), and the value must survive an
 * update that touches only a plain field.
 */
import { RunView } from '@memberjunction/core';
import type { RunViewParams } from '@memberjunction/core';
import { MJCredentialEntity } from '@memberjunction/core-entities';
import { Assert, AssertEqual, IntegrationCheckRegistry, SkipCheck } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { EncryptionUnavailableReason, MUTATION_TIER_OFF_REASON, MutationTierOn } from './fixture-gates';

const BUNDLE = 'encrypted-read-client';
const ENTITY = 'MJ: Credentials';

interface EncryptedReadFixture {
    RecordID: string;
    Secret: string;
}

let fixture: EncryptedReadFixture | undefined;
/** Set by Setup when the fixture was deliberately not created; every check then skips with it. */
let skipReason: string | undefined;

function fx(): EncryptedReadFixture {
    if (skipReason) {
        SkipCheck(skipReason);
    }
    Assert(fixture != null, `${BUNDLE} fixture missing (bundle Setup did not run)`);
    return fixture!;
}

function readParams(recordId: string): RunViewParams {
    return { EntityName: ENTITY, ExtraFilter: `ID='${recordId}'`, Fields: ['ID', 'Name', 'Values'], ResultType: 'simple' };
}

async function loadCredential(ctx: IntegrationCheckContext, id: string): Promise<MJCredentialEntity> {
    const entity = await ctx.Provider.GetEntityObject<MJCredentialEntity>(ENTITY, ctx.User);
    Assert(await entity.Load(id), `load of ${ENTITY} ${id} failed`);
    return entity;
}

async function firstCredentialTypeId(ctx: IntegrationCheckContext): Promise<string> {
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>({
        EntityName: 'MJ: Credential Types', Fields: ['ID'], MaxRows: 1, ResultType: 'simple'
    }, ctx.User);
    Assert(result.Success && result.Results.length > 0, 'no MJ: Credential Types row is seeded');
    return result.Results[0].ID;
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext) => {
        // Setup writes nothing on a deterministic-only run.
        if (!MutationTierOn(ctx)) {
            skipReason = MUTATION_TIER_OFF_REASON;
            return;
        }
        const secret = `{"token":"it149-${Date.now()}"}`;
        const credential = await ctx.Provider.GetEntityObject<MJCredentialEntity>(ENTITY, ctx.User);
        credential.NewRecord();
        credential.CredentialTypeID = await firstCredentialTypeId(ctx);
        credential.Name = `it149-credential-${Date.now()}`;
        credential.Values = secret;
        if (!await credential.Save()) {
            const message = credential.LatestResult?.CompleteMessage ?? '';
            // MJAPI without a base encryption key refuses the write; that is a missing credential, not a defect.
            skipReason = EncryptionUnavailableReason(message);
            Assert(skipReason != null, `fixture create failed: ${message}`);
            return;
        }
        fixture = { RecordID: credential.ID, Secret: secret };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = fixture;
        fixture = undefined;
        skipReason = undefined;
        if (!f) {
            return;
        }
        const row = await ctx.Provider.GetEntityObject<MJCredentialEntity>(ENTITY, ctx.User);
        if (await row.Load(f.RecordID)) {
            await row.Delete();
        }
    }
});

async function checkEr1LoadReturnsPlaintext(ctx: IntegrationCheckContext): Promise<void> {
    const f = fx();
    const entity = await loadCredential(ctx, f.RecordID);
    AssertEqual(entity.Values, f.Secret, 'ER1: Values after Load over GraphQL');
}

async function checkEr2RunViewMissReturnsPlaintext(ctx: IntegrationCheckContext): Promise<void> {
    const f = fx();
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ Values: string }>(readParams(f.RecordID), ctx.User);
    Assert(result.Success && result.Results.length === 1, `ER2: RunView failed: ${result.ErrorMessage ?? 'no row'}`);
    AssertEqual(result.Results[0].Values, f.Secret, 'ER2: Values on the first RunView');
}

async function checkEr3RunViewRepeatReturnsPlaintext(ctx: IntegrationCheckContext): Promise<void> {
    const f = fx();
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    await rv.RunView<{ Values: string }>(readParams(f.RecordID), ctx.User);
    const result = await rv.RunView<{ Values: string }>(readParams(f.RecordID), ctx.User);
    Assert(result.Success && result.Results.length === 1, `ER3: RunView failed: ${result.ErrorMessage ?? 'no row'}`);
    AssertEqual(result.Results[0].Values, f.Secret, 'ER3: Values on the repeated RunView (server cache hit)');
}

async function checkEr4UnrelatedUpdateKeepsEncryptedValue(ctx: IntegrationCheckContext): Promise<void> {
    const f = fx();
    const entity = await loadCredential(ctx, f.RecordID);
    entity.Description = 'it149 touched';
    Assert(await entity.Save(), `ER4: save failed: ${entity.LatestResult?.CompleteMessage ?? ''}`);
    const again = await loadCredential(ctx, f.RecordID);
    AssertEqual(again.Values, f.Secret, 'ER4: Values after a save that touched only Description');
}

export const EncryptedReadClientChecks: NamedCheck[] = [
    { Id: `${BUNDLE}.ER1`, Name: 'ER1: Load over GraphQL returns the decrypted value', Fn: checkEr1LoadReturnsPlaintext, RequiresMutation: true },
    { Id: `${BUNDLE}.ER2`, Name: 'ER2: a first RunView over GraphQL returns the decrypted value', Fn: checkEr2RunViewMissReturnsPlaintext, RequiresMutation: true },
    { Id: `${BUNDLE}.ER3`, Name: 'ER3: a repeated RunView (server cache hit) returns the decrypted value', Fn: checkEr3RunViewRepeatReturnsPlaintext, RequiresMutation: true },
    { Id: `${BUNDLE}.ER4`, Name: 'ER4: an update of a plain field keeps the encrypted value intact', Fn: checkEr4UnrelatedUpdateKeepsEncryptedValue, RequiresMutation: true }
];

for (const check of EncryptedReadClientChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
