/**
 * No-Console-Errors Oracle (CU-D2) — a deterministic oracle over the browser
 * diagnostics already collected during the run (CU-A7).
 *
 * Fails when the run recorded any signal-bearing diagnostic — a console error,
 * an uncaught page error, a failed request, or a renderer crash. This turns the
 * Feature-Pipelines/Routines bundling class (a `ChunkLoadError` on a lazy route,
 * a `POST /graphql 500`) into a deterministic FAIL instead of something the LLM
 * judge has to guess at from blank pixels.
 *
 * Config (all optional):
 * - `ignore: string[]` — substrings; a diagnostic whose message OR url contains
 *   any of them is treated as benign and excluded (for known-noisy requests).
 *
 * Pure over `actualOutput.browserDiagnostics`; no live browser needed at
 * evaluation time.
 */

import { IOracle, OracleInput, OracleResult } from '@memberjunction/testing-engine';
import type { OracleConfig } from '@memberjunction/testing-engine';
import type { BrowserDiagnosticEvent } from '@memberjunction/computer-use';

export class NoConsoleErrorsOracle implements IOracle {
    readonly type = 'no-console-errors';

    async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
        const actual = input.actualOutput as Record<string, unknown> | undefined;
        const raw = actual?.browserDiagnostics;
        const diagnostics: BrowserDiagnosticEvent[] = Array.isArray(raw) ? raw as BrowserDiagnosticEvent[] : [];

        const ignore = Array.isArray(config.ignore) ? (config.ignore as string[]) : [];
        const isIgnored = (d: BrowserDiagnosticEvent): boolean =>
            ignore.some(pat => (d.message ?? '').includes(pat) || (d.url ?? '').includes(pat));

        const offending = diagnostics.filter(d => !isIgnored(d));

        if (offending.length === 0) {
            return {
                oracleType: this.type,
                passed: true,
                score: 1.0,
                message: diagnostics.length === 0
                    ? 'No browser errors during the run'
                    : `No browser errors (all ${diagnostics.length} diagnostic(s) matched the ignore list)`,
            };
        }

        // Summarize the offenders compactly for triage.
        const summary = offending.slice(0, 5)
            .map(d => `${d.type}${d.level ? `/${d.level}` : ''}: ${(d.message ?? '').slice(0, 120)}`)
            .join(' | ');
        return {
            oracleType: this.type,
            passed: false,
            score: 0,
            message: `${offending.length} browser error(s) during the run: ${summary}${offending.length > 5 ? ' …' : ''}`,
            details: { count: offending.length, events: offending },
        };
    }
}
