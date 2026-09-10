/**
 * @fileoverview Replay-script review and promotion
 * @module @memberjunction/testing-cli
 */

import { TestEngine } from '@memberjunction/testing-engine';
import { UserInfo } from '@memberjunction/core';
import { MJTestEntity, MJTestEntity_IReplayScript, MJTestEntity_ITestConfiguration } from '@memberjunction/core-entities';
import { ScriptsFlags } from '../types';
import { OutputFormatter } from '../utils/output-formatter';
import { initializeMJProvider, closeMJProvider, getContextUser } from '../lib/mj-provider';
import { summarizeScriptDrift, ScriptDrift } from '../utils/script-drift';
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
 */
export class ScriptsCommand {
    async execute(flags: ScriptsFlags, contextUser?: UserInfo): Promise<void> {
        try {
            await initializeMJProvider();
            if (!contextUser) {
                contextUser = await getContextUser();
            }
            const engine = TestEngine.Instance;
            await engine.Config(false, contextUser);

            const entries = this.collectPending(engine, flags.test);

            if (entries.length === 0) {
                console.log(chalk.gray(flags.test
                    ? `\nNo pending replay script for "${flags.test}".\n`
                    : '\nNo pending replay scripts — every recorded script matches what replay is using.\n'));
                await closeMJProvider();
                return;
            }

            if (flags.promote || flags.discard) {
                await this.resolve(entries, flags);
            } else {
                this.report(entries);
            }

            await closeMJProvider();
        } catch (error) {
            console.error(OutputFormatter.formatError('Failed to review replay scripts', error as Error));
            try {
                await closeMJProvider();
            } catch {
                // Ignore cleanup errors
            }
            process.exit(1);
        }
    }

    /** Tests carrying a pending script, optionally narrowed to one by name or ID. */
    private collectPending(engine: TestEngine, testFilter?: string): PendingEntry[] {
        const entries: PendingEntry[] = [];
        for (const test of engine.Tests) {
            if (testFilter && test.Name !== testFilter && test.ID !== testFilter) {
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
                drift: summarizeScriptDrift(config.ReplayScript, pending),
            });
        }
        return entries;
    }

    /** Print the drift each pending script represents, newest information first. */
    private report(entries: PendingEntry[]): void {
        console.log(chalk.bold(`\nPending replay scripts (${entries.length}):\n`));
        for (const e of entries) {
            const heading = e.drift.meaningfulDrift > 0 ? chalk.yellow(e.test.Name) : chalk.cyan(e.test.Name);
            console.log(`  ${heading}`);
            console.log(chalk.gray(`    ${e.drift.summary}`));
            for (const change of e.drift.changes.slice(0, 8)) {
                console.log(chalk.gray(`      step ${change.index + 1}: ${change.kind} — ${change.detail}`));
            }
            if (e.drift.changes.length > 8) {
                console.log(chalk.gray(`      … and ${e.drift.changes.length - 8} more`));
            }
        }
        console.log(chalk.gray('\n  Promote with --promote (add --test "<name>" to pick one), or drop with --discard.\n'));
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
