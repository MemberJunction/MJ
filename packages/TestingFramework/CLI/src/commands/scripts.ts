/**
 * @fileoverview Replay-script review and promotion
 * @module @memberjunction/testing-cli
 */

import { TestEngine } from '@memberjunction/testing-engine';
import { UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJTestEntity, MJTestEntity_IReplayScript, MJTestEntity_ITestConfiguration } from '@memberjunction/core-entities';
import { ScriptsFlags } from '../types';
import { OutputFormatter } from '../utils/output-formatter';
import { InitializeMJProvider, CloseMJProvider, GetContextUser } from '../lib/mj-provider';
import { SummarizeScriptDrift, ScriptDrift } from '../utils/script-drift';
import { FormatScriptDriftReport } from '../utils/script-drift-report';
import { FlushAndExit } from '../utils/flush-and-exit';
import chalk from 'chalk';

/** A test whose recorded script differs from the one replay is using. */
interface PendingEntry {
    test: MJTestEntity;
    config: MJTestEntity_ITestConfiguration;
    pending: MJTestEntity_IReplayScript;
    current?: MJTestEntity_IReplayScript;
    drift: ScriptDrift;
}

/**
 * `mj test scripts` — the review gate for replay scripts.
 *
 * A run that re-derives a test which already had a script writes the new one to
 * `Configuration.PendingReplayScript` rather than replacing what replay uses. This
 * command is where a human sees what changed and decides. Without it, a UI change
 * would silently rewrite the suite's scripts and stay green.
 *
 * The command exits the process when it is done: engines loaded during startup can keep
 * the event loop open after the database connection closes.
 */
export class ScriptsCommand {
    async Execute(flags: ScriptsFlags, contextUser?: UserInfo): Promise<void> {
        try {
            await InitializeMJProvider();
            const user = contextUser ?? await GetContextUser();
            const engine = TestEngine.Instance;
            await engine.Config(false, user);
            await this.review(engine, flags);
            await CloseMJProvider();
            await FlushAndExit(typeof process.exitCode === 'number' ? process.exitCode : 0);
        } catch (error) {
            console.error(OutputFormatter.formatError('Failed to review replay scripts', error as Error));
            try {
                await CloseMJProvider();
            } catch {
                // Ignore cleanup errors
            }
            await FlushAndExit(1);
        }
    }

    /** @deprecated Use {@link Execute}. */
    async execute(flags: ScriptsFlags, contextUser?: UserInfo): Promise<void> {
        return this.Execute(flags, contextUser);
    }

    /** Report the pending scripts, or promote or discard them. Sets `process.exitCode` on failure. */
    private async review(engine: TestEngine, flags: ScriptsFlags): Promise<void> {
        if (flags.test && this.findTests(engine, flags.test).length === 0) {
            // A name nobody has is not the same as a test with nothing pending.
            // Reporting both as "no pending script" made a typo look like success.
            console.log(chalk.yellow(`\nNo test matches "${flags.test}".\n`));
            process.exitCode = 1;
            return;
        }

        const entries = this.collectPending(engine, flags.test);
        const resolving = flags.promote || flags.discard;

        if (resolving && entries.length > 0 && !flags.test && !flags.yes && entries.length > 1) {
            // Resolving every pending script at once is the operation you least
            // want to perform by accident: promoting ratifies UI changes nobody
            // looked at, discarding throws away recordings that cost model time.
            this.report(entries, { ...flags, format: 'console', output: undefined });
            console.log(chalk.yellow(
                `This would ${flags.promote ? 'promote' : 'discard'} all ${entries.length} pending script(s) at once.\n` +
                `Re-run with --yes to confirm, or narrow it with --test "<name>".\n`));
            process.exitCode = 1;
        } else if (resolving && entries.length > 0) {
            await this.resolve(entries, flags);
        } else {
            this.report(entries, flags);
        }
    }

    /** Every test matching a name-or-ID filter, regardless of pending state. */
    private findTests(engine: TestEngine, testFilter: string): MJTestEntity[] {
        return engine.Tests.filter(t => t.Name === testFilter || UUIDsEqual(t.ID, testFilter));
    }

    /** Tests carrying a pending script, optionally narrowed to one by name or ID. */
    private collectPending(engine: TestEngine, testFilter?: string): PendingEntry[] {
        const entries: PendingEntry[] = [];
        for (const test of engine.Tests) {
            if (testFilter && test.Name !== testFilter && !UUIDsEqual(test.ID, testFilter)) {
                continue;
            }
            let config: MJTestEntity_ITestConfiguration | null;
            try {
                config = test.ConfigurationObject;
            } catch {
                continue;   // malformed Configuration — not this command's problem to report
            }
            const pending = config?.PendingReplayScript;
            if (!config || !pending) {
                continue;
            }
            entries.push({
                test,
                config,
                pending,
                current: config.ReplayScript,
                drift: SummarizeScriptDrift(config.ReplayScript, pending),
            });
        }
        return entries;
    }

    /** Print the drift each pending script represents, or write it to `--output` in `--format`. */
    private report(entries: PendingEntry[], flags: ScriptsFlags): void {
        const format = flags.format ?? 'console';
        if (entries.length === 0 && format === 'console') {
            console.log(chalk.gray(flags.test
                ? `\nNo pending replay script for "${flags.test}".\n`
                : '\nNo pending replay scripts — every recorded script matches what replay is using.\n'));
            return;
        }
        const text = FormatScriptDriftReport(entries.map(e => ({ TestName: e.test.Name, Drift: e.drift })), format);
        if (flags.output) {
            OutputFormatter.WriteToFile(text, flags.output);
        } else {
            console.log(text);
        }
    }


    /** Promote or discard, one save per test. */
    private async resolve(entries: PendingEntry[], flags: ScriptsFlags): Promise<void> {
        const promoting = !!flags.promote;
        const verb = promoting ? 'Promoted' : 'Discarded';
        let failures = 0;

        for (const e of entries) {
            const next: MJTestEntity_ITestConfiguration = { ...e.config };
            delete next.PendingReplayScript;
            if (promoting) {
                next.ReplayScript = e.pending;
            }
            e.test.ConfigurationObject = next;

            if (await e.test.Save()) {
                console.log(chalk.green(`  ${verb}: ${e.test.Name}`));
            } else {
                failures++;
                console.log(chalk.red(`  Failed: ${e.test.Name} — ${e.test.LatestResult?.CompleteMessage ?? 'Save() returned false'}`));
            }
        }

        console.log(failures === 0
            ? chalk.bold(`\n${verb} ${entries.length} script(s).\n`)
            : chalk.bold.red(`\n${verb} ${entries.length - failures} of ${entries.length}; ${failures} failed.\n`));

        if (failures > 0) {
            process.exitCode = 1;
        }
    }
}
