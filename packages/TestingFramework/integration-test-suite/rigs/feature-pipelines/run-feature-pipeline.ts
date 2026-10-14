/**
 * run-feature-pipeline.ts — feature-pipeline rig: runs one Record Process in-process against the database in the
 * current env and prints the run result as JSON. Usage (from the MJ repo root, private env loaded):
 *   npx tsx packages/TestingFramework/integration-test-suite/rigs/feature-pipelines/run-feature-pipeline.ts <RecordProcessID> \
 *     [--dry-run] [--trigger OnChange|Schedule|OnDemand|Manual] [--records id1,id2] [--backfill] [--overwrite-human]
 *   --backfill: scope = every record this pipeline already has Pipeline Feature Values for (the controlled backfill
 *               after a version change; a pipeline's own ScopeFilter may exclude records it already classified).
 *   --overwrite-human: write-back overwrites values a person entered and retires their Human Feature Values
 *               (default: they are kept and recorded as Human Feature Values).
 * Works on any database platform: the backfill scope is read through the provider, not with platform SQL.
 * Exit: 0 = run returned (any status), 2 = bootstrap or usage error (a flag's value may not start with `--`).
 */
import { RunView } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { MJFeatureValueEntity, RecordProcessScopeOverride } from '@memberjunction/core-entities';
import { BootstrapIntegrationServer, type IntegrationBootstrapContext } from '@memberjunction/testing-integration';
import { RecordProcessExecutor } from '@memberjunction/record-set-processor';
import type { TriggeredByValue } from '@memberjunction/record-set-processor-base';
import { RigCLI, RigFixtures, RigUsageError } from '../lib/rig-cli';

const TRIGGERS: ReadonlyArray<TriggeredByValue> = ['OnChange', 'Schedule', 'OnDemand', 'Manual'];

const USAGE = 'usage: run-feature-pipeline.ts <RecordProcessID> [--dry-run] [--trigger OnChange|Schedule|OnDemand|Manual] [--records a,b] [--backfill] [--overwrite-human]';

/** The parsed command line. */
interface RigArgs {
    RecordProcessID: string;
    Trigger: TriggeredByValue;
    Records: string[] | undefined;
    Backfill: boolean;
    DryRun: boolean;
    OverwriteHumanValues: boolean;
}

/**
 * The value following a flag, or undefined when the flag is absent.
 * @throws RigUsageError when the flag is last or followed by another flag (e.g. `--records --dry-run`).
 */
function argValue(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    if (i < 0) {
        return undefined;
    }
    const value = process.argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
        throw new RigUsageError(`${name} needs a value${value === undefined ? '' : `, got the flag '${value}'`}`);
    }
    return value;
}

/** Parses and checks the command line. @throws RigUsageError on a missing or invalid argument. */
function parseArgs(): RigArgs {
    const recordProcessID = process.argv[2];
    if (!recordProcessID || recordProcessID.startsWith('--')) {
        throw new RigUsageError('the first argument must be the Record Process ID');
    }
    const rawTrigger = argValue('--trigger') || 'OnDemand';
    const trigger = TRIGGERS.find((t) => t === rawTrigger);
    if (!trigger) {
        throw new RigUsageError(`--trigger must be one of ${TRIGGERS.join(', ')}; got '${rawTrigger}'`);
    }
    const records = argValue('--records')?.split(',').map((id) => id.trim()).filter((id) => id.length > 0);
    if (records && records.length === 0) {
        throw new RigUsageError('--records needs at least one record ID');
    }
    const backfill = process.argv.includes('--backfill');
    if (records && backfill) {
        throw new RigUsageError('--records and --backfill cannot be combined');
    }
    return {
        RecordProcessID: recordProcessID, Trigger: trigger, Records: records, Backfill: backfill, DryRun: process.argv.includes('--dry-run'),
        OverwriteHumanValues: process.argv.includes('--overwrite-human'),
    };
}

/**
 * The backfill scope: every record the pipeline already has Pipeline Feature Values for, as an explicit record list.
 * @throws Error when the Record Process does not exist or the Feature Values cannot be read.
 */
async function backfillScope(ctx: IntegrationBootstrapContext, recordProcessID: string): Promise<RecordProcessScopeOverride> {
    const rp = await RigFixtures.LoadRecordProcess(ctx, recordProcessID);
    const values = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJFeatureValueEntity, 'RecordID'>>({
        EntityName: 'MJ: Feature Values',
        ExtraFilter: `RecordProcessID = '${EscapeSQLString(rp.ID)}' AND Source = 'Pipeline'`,
        Fields: ['RecordID'],
    }, ctx.User);
    if (!values.Success) {
        throw new Error(`could not read the Feature Values of Record Process '${rp.Name}': ${values.ErrorMessage}`);
    }
    // One run per record: a record has one Feature Value per feature, all with the same RecordID.
    const recordIDs = [...new Set(values.Results.map((v) => v.RecordID))];
    return { Kind: 'records', RecordIDs: recordIDs };
}

async function main(): Promise<number> {
    const args = parseArgs();
    const ctx = await BootstrapIntegrationServer();
    try {
        const scope: RecordProcessScopeOverride | undefined = args.Records
            ? { Kind: 'records', RecordIDs: args.Records }
            : args.Backfill ? await backfillScope(ctx, args.RecordProcessID) : undefined;
        if (scope?.Kind === 'records' && scope.RecordIDs.length === 0) {
            console.log('nothing to backfill: the pipeline has no Pipeline Feature Values yet');
            return 0;
        }
        const result = await new RecordProcessExecutor().RunByID(args.RecordProcessID, {
            contextUser: ctx.User,
            provider: ctx.Provider,
            triggeredBy: args.Trigger,
            dryRun: args.DryRun,
            overwriteHumanValues: args.OverwriteHumanValues,
            ...(scope ? { scope } : {}),
        });
        console.log(JSON.stringify(result, null, 2));
        return 0;
    } finally {
        await ctx.ClosePool();
    }
}

void RigCLI.Main(main, USAGE);
