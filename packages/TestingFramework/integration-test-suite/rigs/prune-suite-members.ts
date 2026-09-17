/**
 * prune-suite-members.ts — removes suite memberships whose Test name matches a pattern, through the
 * entity layer (BaseEntity.Delete), never direct SQL.
 *
 * Why it exists: `mj sync push` creates and updates records from files but never deletes rows that
 * a regenerated file set no longer contains. When the comparison matrix dropped Cerebras,
 * 114 memberships stayed behind and the suite would have run them anyway.
 *
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/prune-suite-members.ts \
 *       --suite "Native Tool Calling — Envelope vs Native" --test-like "%Cerebras%" [--dry-run]
 */
import { RunView } from '@memberjunction/core';
import type { MJTestSuiteTestEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { bootstrapAI } from './lib/ai-bootstrap';

const arg = (name: string): string | undefined => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
};

(async () => {
    const suite = arg('suite');
    const like = arg('test-like');
    if (!suite || !like) {
        console.error('usage: --suite <name> --test-like <pattern> [--dry-run]');
        process.exit(2);
    }
    const dryRun = process.argv.includes('--dry-run');
    const ctx = await bootstrapAI();
    const rv = new RunView(ctx.provider);
    const result = await rv.RunView<MJTestSuiteTestEntity>({
        EntityName: 'MJ: Test Suite Tests',
        ExtraFilter: `Suite = '${EscapeSQLString(suite)}' AND Test LIKE '${EscapeSQLString(like)}'`,
        ResultType: 'entity_object'
    }, ctx.user);
    if (!result.Success) {
        console.error('RunView failed:', result.ErrorMessage);
        process.exit(1);
    }
    console.log(`${result.Results.length} membership row(s) match "${like}" in suite "${suite}"${dryRun ? ' (dry run)' : ''}`);
    let deleted = 0;
    for (const row of result.Results) {
        if (dryRun) continue;
        const ok = await row.Delete();
        if (!ok) {
            console.error(`delete failed for ${row.ID}: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            continue;
        }
        deleted++;
    }
    console.log(`deleted ${deleted}`);
    await ctx.pool.close();
    process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
