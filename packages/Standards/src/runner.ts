/**
 * @fileoverview Running the adopted standards and formatting the result.
 *
 * @module @memberjunction/standards
 */

import { GetCheck, STANDARD_CHECKS } from './registry.js';
import type { CheckOutcome, RunSummary, Severity, StandardsConfig, Violation } from './types.js';
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

    // Counted per VIOLATION, not per outcome: a check may stamp its own severity on individual
    // findings (see Violation.Severity) to hard-fail the trees a repo has cleaned while still only
    // reporting the ones it has not. A violation without one takes its check's severity.
    const countBy = (want: Exclude<Severity, 'off'>): number =>
        outcomes.reduce((n, o) => n + o.Violations.filter((v) => (v.Severity ?? o.Severity) === want).length, 0);
    const errorCount = countBy('error');
    const warningCount = countBy('warn');

    return { Outcomes: outcomes, Available: available, UnknownCheckIds: unknownCheckIds, ErrorCount: errorCount, WarningCount: warningCount };
}

/**
 * One finding, one line.
 *
 * The severity prefix appears only when the finding disagrees with its check's configured severity.
 * A check whose findings are uniform therefore prints exactly as it always did, and a mixed check
 * makes the build-failing subset obvious without the reader cross-referencing the config.
 */
function formatViolation(v: Violation, checkSeverity: Exclude<Severity, 'off'>): string {
    const location = v.Line > 0 ? `${v.File}:${v.Line}` : v.File;
    const effective = v.Severity ?? checkSeverity;
    const prefix = effective === checkSeverity ? '' : `[${effective}] `;
    return `    ${prefix}${location}  ${v.Message}`;
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
        // The mark reflects what this check does to the BUILD, so it keys off whether any finding
        // is actually an error — not off the configured severity, which a mixed check overrides
        // per violation.
        const errors = outcome.Violations.filter((v) => (v.Severity ?? outcome.Severity) === 'error').length;
        const mark = outcome.Violations.length === 0 ? '✓' : errors > 0 ? '✗' : '!';
        const counts = errors > 0 && errors < outcome.Violations.length
            ? ` — ${outcome.Violations.length} violation(s), ${errors} failing`
            : outcome.Violations.length === 0
              ? ''
              : ` — ${outcome.Violations.length} violation(s)`;
        lines.push(`${mark} ${outcome.Check.Id} [${outcome.Severity}]${counts}`);
        for (const note of outcome.Notes) lines.push(`    ${note}`);

        // Both lists are capped. Errors were once printed in full, on the reasoning that every one
        // is something a human has to act on — true at ten, false at eighteen thousand, where the
        // log is megabytes, GitHub stops rendering it in the UI, and the summary above scrolls out
        // of reach. A standard adopted against a large existing codebase is a worklist, and a
        // worklist needs a count and a starting point, not a transcript. The full set is still
        // available from the check's own output when a caller wants it.
        const failing = outcome.Violations.filter((v) => (v.Severity ?? outcome.Severity) === 'error');
        const warning = outcome.Violations.filter((v) => (v.Severity ?? outcome.Severity) !== 'error');
        const show = (list: Violation[], label: string): void => {
            for (const violation of list.slice(0, DISPLAY_LIMIT)) lines.push(formatViolation(violation, outcome.Severity));
            if (list.length > DISPLAY_LIMIT) lines.push(`    … and ${list.length - DISPLAY_LIMIT} more ${label}(s) not shown`);
        };
        show(failing, 'error');
        show(warning, 'warning');
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

/**
 * How many violations of one severity a check prints before the rest are summarised.
 *
 * Enough to show the shape of the problem and give a reader somewhere to start; far short of what
 * it takes to bury the summary above it.
 */
const DISPLAY_LIMIT = 50;

/** Exit code for a run: non-zero only for `error`-severity violations. */
export function ExitCodeFor(summary: RunSummary): number {
    return summary.ErrorCount > 0 ? 1 : 0;
}
