/**
 * @fileoverview Running the adopted standards and formatting the result.
 *
 * @module @memberjunction/standards
 */

import { GetCheck, STANDARD_CHECKS } from './registry.js';
import type { CheckOutcome, RunSummary, StandardsConfig, Violation } from './types.js';
import { IsNewerThan } from './version.js';

/**
 * Run every standard this repo has adopted.
 *
 * **Only adopted checks run.** A registered check absent from the config is reported as available
 * and not executed — which is what makes it safe to add standards to this package at any time.
 * A check present but `off` is likewise not executed, but is not reported as available either:
 * the repo has seen it and said no.
 */
export async function RunStandards(repoRoot: string, config: StandardsConfig): Promise<RunSummary> {
    const outcomes: CheckOutcome[] = [];
    const unknownCheckIds: string[] = [];

    for (const [id, entry] of Object.entries(config.Checks)) {
        const check = GetCheck(id);
        if (!check) {
            // Named but unregistered: a typo, or a standard removed from the package. Either way
            // the repo believes it is enforcing something it is not, so say so out loud.
            unknownCheckIds.push(id);
            continue;
        }
        if (entry.Severity === 'off') continue;

        const roots = entry.Roots ?? config.Roots ?? check.DefaultRoots;
        const options = { ...(check.DefaultOptions ?? {}), ...(entry.Options ?? {}) };
        const result = await check.Run({ RepoRoot: repoRoot, Roots: roots, Options: options });

        outcomes.push({
            Check: check,
            Severity: entry.Severity,
            Violations: result.Violations,
            Notes: result.Notes ?? [],
        });
    }

    const available = STANDARD_CHECKS.filter((c) => !(c.Id in config.Checks)).map((Check) => ({
        Check,
        PostdatesAdoption: IsNewerThan(Check.Since, config.StandardsVersion),
    }));

    const errorCount = outcomes.filter((o) => o.Severity === 'error').reduce((n, o) => n + o.Violations.length, 0);
    const warningCount = outcomes.filter((o) => o.Severity === 'warn').reduce((n, o) => n + o.Violations.length, 0);

    return { Outcomes: outcomes, Available: available, UnknownCheckIds: unknownCheckIds, ErrorCount: errorCount, WarningCount: warningCount };
}

function formatViolation(v: Violation): string {
    const location = v.Line > 0 ? `${v.File}:${v.Line}` : v.File;
    return `    ${location}  ${v.Message}`;
}

/**
 * Render a run for a terminal.
 *
 * Every failing check prints its docs URL. A rule whose reasoning is one search away gets followed;
 * one that just says "no" gets worked around.
 */
export function FormatSummary(summary: RunSummary, config: StandardsConfig): string {
    const lines: string[] = [];

    for (const outcome of summary.Outcomes) {
        const mark = outcome.Violations.length === 0 ? '✓' : outcome.Severity === 'error' ? '✗' : '!';
        const label = outcome.Violations.length === 0 ? '' : ` — ${outcome.Violations.length} violation(s)`;
        lines.push(`${mark} ${outcome.Check.Id} [${outcome.Severity}]${label}`);
        for (const note of outcome.Notes) lines.push(`    ${note}`);
        for (const violation of outcome.Violations) lines.push(formatViolation(violation));
        if (outcome.Violations.length > 0) lines.push(`    → ${outcome.Check.DocsUrl}`);
    }

    if (summary.UnknownCheckIds.length > 0) {
        lines.push('');
        lines.push(`! ${CONFIG_LABEL} names ${summary.UnknownCheckIds.length} check(s) this version does not know:`);
        for (const id of summary.UnknownCheckIds) lines.push(`    ${id}`);
        lines.push('    They are NOT being enforced. Fix the name, or remove the entry.');
    }

    const newer = summary.Available.filter((a) => a.PostdatesAdoption);
    const older = summary.Available.filter((a) => !a.PostdatesAdoption);

    if (newer.length > 0) {
        lines.push('');
        lines.push(`${newer.length} standard(s) added since this repo adopted ${config.StandardsVersion}:`);
        for (const { Check } of newer) lines.push(`    ${Check.Id}  (since ${Check.Since})  ${Check.Title}`);
        lines.push('    They are NOT active. Review with `mj standards adopt --upgrade`.');
    }
    if (older.length > 0) {
        lines.push('');
        lines.push(`${older.length} standard(s) available but not adopted:`);
        for (const { Check } of older) lines.push(`    ${Check.Id}  ${Check.Title}`);
        lines.push('    Enable with `mj standards adopt --check <id>`.');
    }

    lines.push('');
    if (summary.ErrorCount > 0) {
        lines.push(`✗ ${summary.ErrorCount} error(s), ${summary.WarningCount} warning(s).`);
    } else if (summary.WarningCount > 0) {
        lines.push(`✓ No errors. ${summary.WarningCount} warning(s) — not failing the build.`);
    } else {
        lines.push('✓ All adopted standards pass.');
    }
    return lines.join('\n');
}

const CONFIG_LABEL = '.mj-standards.json';

/** Exit code for a run: non-zero only for `error`-severity violations. */
export function ExitCodeFor(summary: RunSummary): number {
    return summary.ErrorCount > 0 ? 1 : 0;
}
