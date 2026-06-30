/**
 * remote-op-ai-authoring-tests.ts — live, end-to-end test for RO-4 (AI-from-Description operation bodies).
 *
 * GATED behind RUN_AGENT_TESTS=1 (live model call, costs tokens). Proves the whole authoring loop:
 *   1. Create a GenerationType='AI' Remote Operation with a Description + typed I/O, and Save() it.
 *      MJRemoteOperationEntityServer's Save-hook calls the "Generate Remote Operation Code" prompt to
 *      author the InternalExecute body → stores Code/CodeComments, sets CodeApprovalStatus='Pending',
 *      and records the declared libraries in LibrariesObject.
 *   2. Approve the code (CodeApprovalStatus='Approved') and Save() again (no regeneration — Description
 *      unchanged).
 *   3. Run the RO-2 emitter over the approved op and confirm it emits a COMPLETE, registered class with
 *      the authored body in InternalExecute — no hand-written subclass.
 *
 * Deterministic structure (creates + deletes its own op); the AI body content is model-authored so we
 * assert on shape, not exact text.
 *
 * USAGE (from the repo root):
 *   RUN_AGENT_TESTS=1 npx tsx packages/MJServer/integration-test-scripts/remote-op-ai-authoring-tests.ts
 *
 * Exit code: 0 = passed (or skipped), 1 = failures, 2 = bootstrap error.
 */
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync, mkdtempSync } from 'fs';
import { TestRunner, Assert, AssertEqual } from './lib/harness';
import { bootstrapAI } from './lib/ai-bootstrap';
import { MJRemoteOperationEntity } from '@memberjunction/core-entities';
import { RemoteOperationGeneratorBase } from '@memberjunction/codegen-lib';

const GATED = process.env.RUN_AGENT_TESTS === '1';
const OP_KEY = 'Test.AIAuthoredCount';
const INPUT_DEF = 'export interface AIAuthoredCountInput {\n    /** The entity to count rows of. */\n    entityName: string;\n}';
const OUTPUT_DEF = 'export interface AIAuthoredCountOutput {\n    /** Number of rows in the entity. */\n    count: number;\n}';

async function main(): Promise<void> {
    if (!GATED) {
        console.log('remote-op-ai-authoring-tests: SKIPPED — set RUN_AGENT_TESTS=1 to run the live AI-authoring loop (costs tokens, needs model credentials).');
        process.exit(0);
    }

    const { user, provider } = await bootstrapAI();
    const suite = new TestRunner('Remote Operations RO-4 AI-authoring (live: Description -> Code -> approve -> emit)');

    const op = await provider.GetEntityObject<MJRemoteOperationEntity>('MJ: Remote Operations', user);
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

    let failures = 0;
    try {
        suite.Test('RO4-1: saving an AI op authors a body and sets CodeApprovalStatus=Pending', async () => {
            // The server subclass (MJRemoteOperationEntityServer) must be the resolved class for the generation to fire.
            Assert(op.constructor.name === 'MJRemoteOperationEntityServer', `expected MJRemoteOperationEntityServer, got ${op.constructor.name}`);
            const saved = await op.Save();
            Assert(saved, `save failed: ${op.LatestResult?.CompleteMessage}`);
            Assert(!!op.Code && op.Code.trim().length > 0, 'Code was authored by the model');
            AssertEqual(op.CodeApprovalStatus, 'Pending', 'new code is Pending review');
            Assert(op.CodeApprovedAt === null, 'approval timestamp cleared');
            console.log(`      → authored ${op.Code!.length} chars; libraries declared: ${(op.LibrariesObject ?? []).map((l) => l.Library).join(', ') || '(none — defaults only)'}`);
        });

        suite.Test('RO4-2: approving + saving does NOT regenerate (Description unchanged)', async () => {
            const before = op.Code;
            op.CodeApprovalStatus = 'Approved';
            const saved = await op.Save();
            Assert(saved, `approve-save failed: ${op.LatestResult?.CompleteMessage}`);
            AssertEqual(op.Code, before, 'code unchanged on approve (no regeneration)');
            AssertEqual(op.CodeApprovalStatus, 'Approved', 'status is Approved');
        });

        suite.Test('RO4-3: the emitter produces a complete registered class with the authored body', async () => {
            const dir = mkdtempSync(join(tmpdir(), 'mj-ro4-'));
            const ok = await new RemoteOperationGeneratorBase().generateRemoteOperations([op], dir);
            Assert(ok, 'emitter returned false');
            const text = readFileSync(join(dir, 'remote_operations.ts'), 'utf8');
            Assert(text.includes(`@RegisterClass(BaseRemotableOperation, "${OP_KEY}")`), 'class is registered under the op key');
            Assert(text.includes('export class TestAIAuthoredCountOperation extends BaseRemotableOperation<AIAuthoredCountInput, AIAuthoredCountOutput>'), 'typed class emitted');
            Assert(text.includes('protected async InternalExecute(input: AIAuthoredCountInput, provider: IMetadataProvider, user: UserInfo): Promise<AIAuthoredCountOutput>'), 'InternalExecute body emitted');
            Assert(text.includes('export interface AIAuthoredCountInput'), 'input type definition emitted');
            console.log('      → emitted a complete @RegisterClass class with the model-authored InternalExecute body');
        });

        failures = await suite.Run();
    } finally {
        if (op.IsSaved) {
            await op.Delete().catch(() => undefined);
        }
    }

    process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('\nBOOTSTRAP / CONNECTIVITY ERROR:', error instanceof Error ? error.message : error);
    process.exit(2);
});
