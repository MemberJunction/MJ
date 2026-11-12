/**
 * @fileoverview Report of pending replay scripts as console text, markdown, or JSON
 * @module @memberjunction/testing-cli
 */

import chalk from 'chalk';
import { OutputFormat } from '../types';
import { ScriptDrift } from './script-drift';

/** One test that has a pending replay script. */
export interface ScriptDriftReportEntry {
    TestName: string;
    Drift: ScriptDrift;
}

/** The most step changes listed per test in console and markdown output. */
const MAX_LISTED_CHANGES = 8;

/** Format the pending-script report. Markdown is for a PR body; JSON is for scripts. */
export function FormatScriptDriftReport(entries: ReadonlyArray<ScriptDriftReportEntry>, format: OutputFormat): string {
    switch (format) {
        case 'json':
            return formatJson(entries);
        case 'markdown':
            return formatMarkdown(entries);
        default:
            return formatConsole(entries);
    }
}

function formatJson(entries: ReadonlyArray<ScriptDriftReportEntry>): string {
    const tests = entries.map(e => ({
        TestName: e.TestName,
        MeaningfulDrift: e.Drift.MeaningfulDrift,
        AddedSteps: e.Drift.AddedSteps,
        RemovedSteps: e.Drift.RemovedSteps,
        Summary: e.Drift.Summary,
        Changes: e.Drift.Changes.map(c => ({ Step: c.index + 1, Kind: c.kind, Detail: c.detail })),
    }));
    return JSON.stringify({ PendingCount: entries.length, Tests: tests }, null, 2);
}

function formatMarkdown(entries: ReadonlyArray<ScriptDriftReportEntry>): string {
    if (entries.length === 0) {
        return 'No pending replay scripts.\n';
    }
    const lines = [
        `### Pending replay scripts (${entries.length})`,
        '',
        '| Test | Meaningful drift | Summary |',
        '|---|---|---|',
        ...entries.map(e => `| ${escapeCell(e.TestName)} | ${e.Drift.MeaningfulDrift} | ${escapeCell(e.Drift.Summary)} |`),
    ];
    for (const e of entries.filter(x => x.Drift.Changes.length > 0)) {
        lines.push('', `**${escapeCell(e.TestName)}**`, '');
        for (const change of e.Drift.Changes.slice(0, MAX_LISTED_CHANGES)) {
            lines.push(`- Step ${change.index + 1}: ${change.kind} — ${change.detail}`);
        }
        if (e.Drift.Changes.length > MAX_LISTED_CHANGES) {
            lines.push(`- … and ${e.Drift.Changes.length - MAX_LISTED_CHANGES} more`);
        }
    }
    return lines.join('\n') + '\n';
}

function formatConsole(entries: ReadonlyArray<ScriptDriftReportEntry>): string {
    const lines = [chalk.bold(`\nPending replay scripts (${entries.length}):\n`)];
    for (const e of entries) {
        lines.push(`  ${e.Drift.MeaningfulDrift > 0 ? chalk.yellow(e.TestName) : chalk.cyan(e.TestName)}`);
        lines.push(chalk.gray(`    ${e.Drift.Summary}`));
        for (const change of e.Drift.Changes.slice(0, MAX_LISTED_CHANGES)) {
            lines.push(chalk.gray(`      step ${change.index + 1}: ${change.kind} — ${change.detail}`));
        }
        if (e.Drift.Changes.length > MAX_LISTED_CHANGES) {
            lines.push(chalk.gray(`      … and ${e.Drift.Changes.length - MAX_LISTED_CHANGES} more`));
        }
    }
    lines.push(chalk.gray('\n  Promote with --promote (add --test "<name>" to pick one), or drop with --discard.\n'));
    return lines.join('\n');
}

/** Escape a value for a markdown table cell. */
function escapeCell(value: string): string {
    return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
