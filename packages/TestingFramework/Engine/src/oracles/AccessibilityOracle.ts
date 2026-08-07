/**
 * @fileoverview Accessibility oracle implementation
 * @module @memberjunction/testing-engine
 */

import { IOracle } from './IOracle';
import { OracleInput, OracleConfig, OracleResult } from '../types';

/**
 * One accessibility violation in the shape drivers hand to {@link AccessibilityOracle}.
 * Deliberately mirrors an axe-core `Result` closely enough that a driver can map
 * `axe.run()` output with a one-line transform, without this package depending on
 * axe-core (the Testing Engine stays browser-free; browser work lives in drivers).
 */
export interface AccessibilityViolation {
    /** Rule id, e.g. 'color-contrast', 'label', 'button-name'. */
    ruleId: string;
    /** Impact severity as reported by the scanner. */
    impact: 'minor' | 'moderate' | 'serious' | 'critical';
    /** WCAG criterion tag(s), e.g. ['wcag2aa', 'wcag143']. */
    wcagTags: string[];
    /** Human-readable description of the failure. */
    description: string;
    /** CSS selector(s) of the offending DOM node(s). */
    selectors: string[];
    /** URL or route of the page the violation was found on. */
    pageUrl?: string;
}

/**
 * The `actualOutput` payload contract between an accessibility-scanning driver
 * and this oracle.
 */
export interface AccessibilityScanOutput {
    /** All violations found by the scan, across every scanned page/route. */
    violations: AccessibilityViolation[];
    /** Number of rules that passed (for reporting; not scored). */
    passedRuleCount?: number;
    /** Pages/routes that were scanned. */
    scannedPages?: string[];
}

/**
 * Accessibility Oracle.
 *
 * Evaluates structured accessibility-scan findings (axe-core-shaped, see
 * {@link AccessibilityViolation}) produced by a browser-based driver. The oracle is
 * deliberately DOM-agnostic: it never launches a browser or imports axe-core, so the
 * Testing Engine keeps its no-browser-dependency guarantee. A driver runs the scan
 * (e.g. via the Computer-Use Playwright harness), maps the results into
 * {@link AccessibilityScanOutput}, and passes them as `input.actualOutput`.
 *
 * Configuration (all optional):
 * - `failOn`: impact levels that fail the check (default: `['critical', 'serious']`)
 * - `maxViolations`: violation count (at or above `failOn` severity) tolerated before
 *   failing (default: 0)
 * - `allowedRules`: rule ids to ignore entirely — the reviewed-exception mechanism
 *   (default: `[]`)
 *
 * Scoring: 1.0 with no gating violations; otherwise score decays linearly with the
 * number of gating violations relative to `scoreDenominator` (default 10), floored at 0.
 *
 * @example
 * ```typescript
 * const oracle = new AccessibilityOracle();
 * const result = await oracle.evaluate(
 *     { actualOutput: { violations: [...] }, ... },
 *     { failOn: ['critical', 'serious'], allowedRules: ['color-contrast'] }
 * );
 * ```
 */
export class AccessibilityOracle implements IOracle {
    readonly type = 'accessibility';

    /**
     * Evaluate accessibility scan output against the configured severity gate.
     *
     * @param input - Oracle input; `actualOutput` must be an {@link AccessibilityScanOutput}
     * @param config - Oracle configuration (failOn / maxViolations / allowedRules)
     * @returns Oracle result with per-severity counts in `details`
     */
    async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
        try {
            const output = this.parseScanOutput(input.actualOutput);
            if (!output) {
                return {
                    oracleType: this.type,
                    passed: false,
                    score: 0,
                    message: 'No accessibility scan output provided (expected { violations: [...] } in actualOutput)'
                };
            }

            const failOn = this.parseFailOn(config);
            const maxViolations = typeof config.maxViolations === 'number' ? config.maxViolations : 0;
            const allowedRules = Array.isArray(config.allowedRules)
                ? (config.allowedRules as string[])
                : [];
            const scoreDenominator = typeof config.scoreDenominator === 'number' && config.scoreDenominator > 0
                ? config.scoreDenominator
                : 10;

            const considered = output.violations.filter(v => !allowedRules.includes(v.ruleId));
            const gating = considered.filter(v => failOn.includes(v.impact));
            const passed = gating.length <= maxViolations;
            const score = passed ? 1.0 : Math.max(0, 1 - gating.length / scoreDenominator);

            return {
                oracleType: this.type,
                passed,
                score,
                message: passed
                    ? `Accessibility check passed: ${gating.length} gating violation(s) (threshold ${maxViolations}), ${considered.length} total`
                    : `Accessibility check failed: ${gating.length} ${failOn.join('/')} violation(s) exceed threshold of ${maxViolations}`,
                details: {
                    totalViolations: considered.length,
                    gatingViolations: gating.length,
                    allowedRuleSuppressions: output.violations.length - considered.length,
                    bySeverity: this.countBySeverity(considered),
                    violations: gating.map(v => ({
                        ruleId: v.ruleId,
                        impact: v.impact,
                        wcagTags: v.wcagTags,
                        description: v.description,
                        selectors: v.selectors.slice(0, 5),
                        pageUrl: v.pageUrl
                    })),
                    scannedPages: output.scannedPages,
                    passedRuleCount: output.passedRuleCount
                }
            };
        } catch (error) {
            return {
                oracleType: this.type,
                passed: false,
                score: 0,
                message: `Accessibility oracle error: ${(error as Error).message}`
            };
        }
    }

    /**
     * Validate and narrow the driver-provided actualOutput to the scan-output contract.
     * @private
     */
    private parseScanOutput(actualOutput: unknown): AccessibilityScanOutput | null {
        if (!actualOutput || typeof actualOutput !== 'object') return null;
        const candidate = actualOutput as Record<string, unknown>;
        if (!Array.isArray(candidate.violations)) return null;

        const violations: AccessibilityViolation[] = [];
        for (const raw of candidate.violations) {
            if (!raw || typeof raw !== 'object') continue;
            const v = raw as Record<string, unknown>;
            if (typeof v.ruleId !== 'string' || typeof v.impact !== 'string') continue;
            violations.push({
                ruleId: v.ruleId,
                impact: this.normalizeImpact(v.impact),
                wcagTags: Array.isArray(v.wcagTags) ? (v.wcagTags as string[]).filter(t => typeof t === 'string') : [],
                description: typeof v.description === 'string' ? v.description : '',
                selectors: Array.isArray(v.selectors) ? (v.selectors as string[]).filter(s => typeof s === 'string') : [],
                pageUrl: typeof v.pageUrl === 'string' ? v.pageUrl : undefined
            });
        }

        return {
            violations,
            passedRuleCount: typeof candidate.passedRuleCount === 'number' ? candidate.passedRuleCount : undefined,
            scannedPages: Array.isArray(candidate.scannedPages)
                ? (candidate.scannedPages as string[]).filter(p => typeof p === 'string')
                : undefined
        };
    }

    /**
     * Coerce an unknown impact string to the known severity scale (unknown → 'moderate').
     * @private
     */
    private normalizeImpact(impact: string): AccessibilityViolation['impact'] {
        switch (impact) {
            case 'minor':
            case 'moderate':
            case 'serious':
            case 'critical':
                return impact;
            default:
                return 'moderate';
        }
    }

    /**
     * Read and validate the failOn severity list from config.
     * @private
     */
    private parseFailOn(config: OracleConfig): Array<AccessibilityViolation['impact']> {
        const fallback: Array<AccessibilityViolation['impact']> = ['critical', 'serious'];
        if (!Array.isArray(config.failOn)) return fallback;
        const valid = (config.failOn as string[]).filter(
            (level): level is AccessibilityViolation['impact'] =>
                level === 'minor' || level === 'moderate' || level === 'serious' || level === 'critical'
        );
        return valid.length > 0 ? valid : fallback;
    }

    /**
     * Count violations per severity level for reporting.
     * @private
     */
    private countBySeverity(violations: AccessibilityViolation[]): Record<AccessibilityViolation['impact'], number> {
        const counts: Record<AccessibilityViolation['impact'], number> = {
            minor: 0, moderate: 0, serious: 0, critical: 0
        };
        for (const v of violations) counts[v.impact]++;
        return counts;
    }
}
