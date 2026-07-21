/**
 * remote-op-ai-authoring.checks.ts — the 'remote-op-ai-authoring' bundle (RO4-1→RO4-3): the LIVE,
 * end-to-end test for RO-4 (AI-from-Description operation bodies). Graduated verbatim from
 * integration-test-scripts/remote-op-ai-authoring-tests.ts.
 *
 * GATED behind RUN_AGENT_TESTS=1 (live model call, costs tokens). Proves the whole authoring loop over
 * ONE shared GenerationType='AI' Remote Operation (built unsaved by the bundle Setup, torn down after):
 *   - RO4-1: Save() authors the InternalExecute body → Code set, CodeApprovalStatus='Pending'
 *   - RO4-2: approve + Save() again does NOT regenerate (Description unchanged)
 *   - RO4-3: the RO-2 emitter produces a complete registered class with the authored body
 *
 * Ordered lifecycle bundle: Setup creates + populates the op (UNSAVED — RO4-1 saves it), Teardown
 * deletes it if saved.
 */
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, mkdtempSync } from 'fs';
import { MJRemoteOperationEntity } from '@memberjunction/core-entities';
import { RemoteOperationGeneratorBase } from '@memberjunction/codegen-lib';
import { Assert, AssertEqual } from '../test-runner';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext } from '../check';

const OP_KEY = 'Test.AIAuthoredCount';
const INPUT_DEF = 'export interface AIAuthoredCountInput {\n    /** The entity to count rows of. */\n    entityName: string;\n}';
const OUTPUT_DEF = 'export interface AIAuthoredCountOutput {\n    /** Number of rows in the entity. */\n    count: number;\n}';

/** Fetch the fixture (thrown if the lifecycle Setup didn't run — a wiring bug, not a test failure). */
function fx(ctx: IntegrationCheckContext) {
    Assert(ctx.RemoteOpAiAuthoringFixture != null, 'remote-op-ai-authoring fixture missing (bundle Setup did not run)');
    return ctx.RemoteOpAiAuthoringFixture!;
}

export const RemoteOpAiAuthoringChecks: NamedCheck[] = [
    {
        Id: 'remote-op-ai-authoring.RO4-1',
        Name: 'RO4-1: saving an AI op authors a body and sets CodeApprovalStatus=Pending',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Op } = fx(ctx);
            // The server subclass (MJRemoteOperationEntityServer) must be the resolved class for the generation to fire.
            Assert(Op.constructor.name === 'MJRemoteOperationEntityServer', `expected MJRemoteOperationEntityServer, got ${Op.constructor.name}`);
            const saved = await Op.Save();
            Assert(saved, `save failed: ${Op.LatestResult?.CompleteMessage}`);
            Assert(!!Op.Code && Op.Code.trim().length > 0, 'Code was authored by the model');
            AssertEqual(Op.CodeApprovalStatus, 'Pending', 'new code is Pending review');
            Assert(Op.CodeApprovedAt === null, 'approval timestamp cleared');
            console.log(`      → authored ${Op.Code!.length} chars; libraries declared: ${(Op.LibrariesObject ?? []).map((l) => l.Library).join(', ') || '(none — defaults only)'}`);
        }
    },
    {
        Id: 'remote-op-ai-authoring.RO4-2',
        Name: 'RO4-2: approving + saving does NOT regenerate (Description unchanged)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Op } = fx(ctx);
            const before = Op.Code;
            Op.CodeApprovalStatus = 'Approved';
            const saved = await Op.Save();
            Assert(saved, `approve-save failed: ${Op.LatestResult?.CompleteMessage}`);
            AssertEqual(Op.Code, before, 'code unchanged on approve (no regeneration)');
            AssertEqual(Op.CodeApprovalStatus, 'Approved', 'status is Approved');
        }
    },
    {
        Id: 'remote-op-ai-authoring.RO4-3',
        Name: 'RO4-3: the emitter produces a complete registered class with the authored body',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Op } = fx(ctx);
            const dir = mkdtempSync(join(tmpdir(), 'mj-ro4-'));
            const ok = await new RemoteOperationGeneratorBase().generateRemoteOperations([Op], dir);
            Assert(ok, 'emitter returned false');
            const text = readFileSync(join(dir, 'remote_operations.ts'), 'utf8');
            Assert(text.includes(`@RegisterClass(BaseRemotableOperation, "${OP_KEY}")`), 'class is registered under the op key');
            Assert(text.includes('export class TestAIAuthoredCountOperation extends BaseRemotableOperation<AIAuthoredCountInput, AIAuthoredCountOutput>'), 'typed class emitted');
            Assert(text.includes('protected async InternalExecute(input: AIAuthoredCountInput, provider: IMetadataProvider, user: UserInfo): Promise<AIAuthoredCountOutput>'), 'InternalExecute body emitted');
            Assert(text.includes('export interface AIAuthoredCountInput'), 'input type definition emitted');
            console.log('      → emitted a complete @RegisterClass class with the model-authored InternalExecute body');
        }
    }
];

for (const check of RemoteOpAiAuthoringChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('remote-op-ai-authoring', {
    Setup: async (ctx: IntegrationCheckContext) => {
        const op = await ctx.Provider.GetEntityObject<MJRemoteOperationEntity>('MJ: Remote Operations', ctx.User);
        op.NewRecord();
        op.Name = 'Test AI-Authored Count (safe to delete)';
        op.OperationKey = OP_KEY;
        op.GenerationType = 'AI';
        op.ExecutionMode = 'Sync';
        op.Status = 'Active';
        op.RequiresSystemUser = false;
        op.Description =
            'Count the number of records in the MemberJunction entity named by input.entityName (use RunView with ' +
            'ResultType simple and the provider + user that are in scope) and return { count } where count is that number.';
        op.InputTypeName = 'AIAuthoredCountInput';
        op.InputTypeDefinition = INPUT_DEF;
        op.InputTypeIsArray = false;
        op.OutputTypeName = 'AIAuthoredCountOutput';
        op.OutputTypeDefinition = OUTPUT_DEF;
        op.OutputTypeIsArray = false;
        // NOT saved here — RO4-1 asserts the resolved class name then Save()s it (authoring fires on save).
        ctx.RemoteOpAiAuthoringFixture = { Op: op };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = ctx.RemoteOpAiAuthoringFixture;
        if (!f) {
            return;
        }
        if (f.Op.IsSaved) {
            await f.Op.Delete().catch(() => undefined);
        }
        ctx.RemoteOpAiAuthoringFixture = undefined;
    }
});
