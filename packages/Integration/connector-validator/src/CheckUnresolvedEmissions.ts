/**
 * Structural-completeness check: emitted string-valued metadata fields
 * MUST NOT contain unresolved placeholder structure.
 *
 * Catches a failure mode the existing invariants miss: agent emits a
 * single IO for `/path/{var1}/{var2}/op` where the URL template represents
 * N×M concrete integration units, not one. The placeholder syntax is
 * the structural indicator that emission is incomplete.
 *
 * The check does NOT say HOW to resolve. It says WHAT is unresolved
 * (the matched token, the field, the IO). The agent observes the source
 * format that produced the placeholder and acts on what it sees.
 *
 * Pattern recognition for common placeholder syntaxes:
 *   - Brace templates:    {var}
 *   - Angle placeholders: <var>
 *   - Express-style colon: :var (preceded by /, ended by /, ?, or string-end)
 *   - Handlebars:         {{var}}
 *
 * For vendor formats with placeholder syntaxes not listed here, the check
 * would miss them — an honest limit. Adding a new syntax means extending
 * PLACEHOLDER_PATTERNS, never adding resolution behavior anywhere.
 */
import type { MetadataFile, FailureDetail } from './types.js';

interface PlaceholderPattern {
    Name: string;
    Regex: RegExp;
}

const PLACEHOLDER_PATTERNS: PlaceholderPattern[] = [
    // Handlebars FIRST so {{var}} doesn't match the inner {var} half twice.
    { Name: 'handlebars',          Regex: /\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/g },
    { Name: 'brace-template',      Regex: /\{[a-zA-Z_][a-zA-Z0-9_]*\}/g },
    { Name: 'angle-placeholder',   Regex: /<[a-zA-Z_][a-zA-Z0-9_]*>/g },
    { Name: 'express-colon',       Regex: /(?<=\/):[a-zA-Z_][a-zA-Z0-9_]*(?=\/|$|\?)/g },
];

function BuildRejectionMessage(token: string, fieldName: string, ioName: string): string {
    return (
        `Emission contains unresolved structure: token '${token}' in field '${fieldName}' of IO '${ioName}'. ` +
        `This indicates an abstraction, template, or placeholder that hasn't been expanded to concrete content. ` +
        `Study the format that produced this token. What does the unresolved structure represent? ` +
        `What concrete instances would resolve it? Re-emit with the resolved form. The emission cannot pass ` +
        `validation while it contains unresolved structure. Do not infer how to resolve from this message — ` +
        `observe the source format and act on what you see.`
    );
}

/**
 * Scan one string value for unresolved placeholders, deduping overlapping
 * matches. Handlebars matches are recorded first; brace matches that fall
 * entirely inside an already-matched handlebars span are suppressed (the
 * {{var}} pattern naturally contains {var}).
 */
function ScanStringForPlaceholders(value: string): { Token: string; Pattern: string }[] {
    const claimed: Array<{ start: number; end: number }> = [];
    const hits: { Token: string; Pattern: string }[] = [];

    for (const pattern of PLACEHOLDER_PATTERNS) {
        const matches = [...value.matchAll(pattern.Regex)];
        for (const m of matches) {
            const start = m.index ?? 0;
            const end = start + m[0].length;
            const overlaps = claimed.some((c) => start >= c.start && end <= c.end);
            if (overlaps) continue;
            claimed.push({ start, end });
            hits.push({ Token: m[0], Pattern: pattern.Name });
        }
    }
    return hits;
}

function ScanFieldsBlock(
    fields: Record<string, unknown>,
    locationPrefix: string,
    ioName: string,
    failures: FailureDetail[]
): void {
    for (const [fieldName, raw] of Object.entries(fields)) {
        if (typeof raw !== 'string' || raw.length === 0) continue;
        // Skip pure-reference shorthands that mj-sync resolves at push time;
        // those legitimately contain placeholder-like syntax that is NOT a
        // catalog-level abstraction.
        if (raw.startsWith('@lookup:') || raw.startsWith('@parent:') ||
            raw.startsWith('@root:')   || raw.startsWith('@file:')) {
            continue;
        }
        const hits = ScanStringForPlaceholders(raw);
        for (const hit of hits) {
            failures.push({
                InvariantNumber: 1,
                Severity: 'Error',
                Failure: BuildRejectionMessage(hit.Token, fieldName, ioName),
                Location: `${locationPrefix}.${fieldName}`,
                SuggestedFix: '',  // intentionally empty per directive: never tell HOW
            });
        }
    }
}

export function CheckUnresolvedEmissions(metadata: MetadataFile): {
    Status: 'Pass' | 'Fail';
    Failures: FailureDetail[];
} {
    const failures: FailureDetail[] = [];

    // Root-level fields
    ScanFieldsBlock(
        metadata.fields as Record<string, unknown>,
        'metadata.fields',
        '<root>',
        failures
    );

    // Per-IO scan
    const ios = metadata.relatedEntities?.['MJ: Integration Objects'] ?? [];
    for (const io of ios) {
        const ioName = (io.fields.Name as string) ?? '<unnamed>';
        ScanFieldsBlock(
            io.fields as Record<string, unknown>,
            `metadata.IO[${ioName}]`,
            ioName,
            failures
        );

        // Per-IOF scan
        const iofs = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
        for (const iof of iofs) {
            const iofName = (iof.fields.Name as string) ?? '<unnamed>';
            ScanFieldsBlock(
                iof.fields as Record<string, unknown>,
                `metadata.IO[${ioName}].IOF[${iofName}]`,
                `${ioName}/${iofName}`,
                failures
            );
        }
    }

    return {
        Status: failures.length === 0 ? 'Pass' : 'Fail',
        Failures: failures,
    };
}
