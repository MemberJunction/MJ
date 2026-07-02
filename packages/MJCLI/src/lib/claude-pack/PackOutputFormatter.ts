/**
 * Output formatters for `mj install:claude` and `mj update:claude`.
 *
 * Two shapes:
 *   - `formatPretty(result)` — human-readable colored summary for terminals
 *   - `formatJson(result)`   — machine-readable schema from plan §7.5
 *
 * Lives in `lib/claude-pack/` (not in the command files) because both commands
 * use the same renderer.
 */

import chalk from 'chalk';
import type { InstallResult } from './PackTypes.js';

/** Plain `--json` output. */
export function formatJson(result: InstallResult): string {
    return JSON.stringify(result, null, 2);
}

/**
 * Multi-line colored summary for terminals. Sections:
 *
 *   ✓ Claude Code pack v5.1.0 installed (MJ v5.33.0)
 *   added:   N
 *     <list>
 *   updated: N
 *     <list>
 *   skipped: N (truncated to first few)
 *   warnings: N
 *     <list>
 *
 * Failure mode: a red banner + the errors[] list.
 */
export function formatPretty(result: InstallResult): string {
    const lines: string[] = [];

    if (!result.ok) {
        lines.push(chalk.red.bold('✗ Claude Code pack operation failed.'));
        if (result.actions.errors.length > 0) {
            lines.push(chalk.red('errors:'));
            for (const err of result.actions.errors) {
                lines.push(chalk.red(`  - ${err}`));
            }
        }
        if (result.warnings.length > 0) {
            lines.push(chalk.yellow('warnings:'));
            for (const w of result.warnings) {
                lines.push(chalk.yellow(`  - ${w}`));
            }
        }
        return lines.join('\n');
    }

    const version = result.packVersion ? `v${result.packVersion}` : '(check only)';
    const mjLabel = result.installedMJVersion
        ? `for MJ v${result.installedMJVersion}`
        : 'no local MJ detected';
    lines.push(chalk.green.bold(`✓ Claude Code pack ${version} ${mjLabel}`));

    appendBucket(lines, 'added', result.actions.added, chalk.green);
    appendBucket(lines, 'updated', result.actions.updated, chalk.cyan);
    appendBucket(lines, 'skipped', result.actions.skipped, chalk.dim, 5);

    if (result.notes.length > 0) {
        lines.push(chalk.cyan(`notes (${result.notes.length}):`));
        for (const n of result.notes) {
            lines.push(chalk.cyan(`  - ${n}`));
        }
    }

    if (result.warnings.length > 0) {
        lines.push(chalk.yellow(`warnings (${result.warnings.length}):`));
        for (const w of result.warnings) {
            lines.push(chalk.yellow(`  - ${w}`));
        }
    }

    return lines.join('\n');
}

function appendBucket(
    lines: string[],
    label: string,
    entries: string[],
    color: (s: string) => string,
    maxList = Number.POSITIVE_INFINITY
): void {
    if (entries.length === 0) return;
    lines.push(color(`${label} (${entries.length}):`));
    const shown = entries.slice(0, maxList);
    for (const e of shown) {
        lines.push(color(`  - ${e}`));
    }
    if (entries.length > shown.length) {
        lines.push(color(`  … ${entries.length - shown.length} more`));
    }
}
