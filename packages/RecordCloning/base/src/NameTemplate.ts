/**
 * @file NameTemplate.ts
 * Naming template interpolation and collision avoidance strategy.
 * Evaluates {Name}, {n}, {Date}, and {User} tokens and increments version numbers.
 * @see plans/record-cloning/README.md §7.3, §13.1
 */

export interface NameTemplateContext {
    SourceRecordName: string;
    Counter?: number;
    DateStr?: string; // YYYY-MM-DD
    UserName?: string;
}

export interface NameTemplateOptions {
    Template?: string;
    Strategy?: 'suffix' | 'increment' | 'prompt' | 'none';
    Context?: Partial<NameTemplateContext>;
    /** Column width in characters (0 or unset: unlimited). The source name is shortened so every candidate fits. */
    MaxLength?: number;
}

/**
 * The text every candidate `FindNextAvailableName` could produce starts with, for looking up
 * existing names with a prefix match. Empty when there is no stable prefix. Taken from the
 * candidates themselves, so shortening a long name or trimming a template for a short column
 * can't make the lookup miss a name the search would then produce.
 */
export function NameCollisionPrefix(sourceName: string, options?: NameTemplateOptions): string {
    const strategy = options?.Strategy || 'suffix';
    if (strategy === 'none' || strategy === 'prompt') return '';
    let prefix: string | null = null;
    for (const candidate of nameCandidates(sourceName, options)) {
        if (candidate === null) continue;
        if (prefix === null) {
            prefix = candidate;
            continue;
        }
        let i = 0;
        while (i < prefix.length && i < candidate.length && prefix[i].toLowerCase() === candidate[i].toLowerCase()) i++;
        prefix = prefix.slice(0, i);
        if (prefix === '') break;
    }
    return prefix ?? '';
}

/**
 * Renders a name template by interpolating supported tokens:
 * - {Name}: Source name
 * - {n}: Counter number (omitted if undefined or empty if counter=1 and template doesn't force it)
 * - {Date}: Current date formatted as YYYY-MM-DD
 * - {User}: User name or identifier
 */
export function RenderNameTemplate(template: string, ctx: NameTemplateContext): string {
    const dateVal = ctx.DateStr || new Date().toISOString().slice(0, 10);
    const userVal = ctx.UserName || '';
    const counterVal = ctx.Counter !== undefined ? String(ctx.Counter) : '';

    return template
        .replace(/\{Name\}/g, () => ctx.SourceRecordName)
        .replace(/\{Date\}/g, () => dateVal)
        .replace(/\{User\}/g, () => userVal)
        .replace(/\{n\}/g, () => counterVal)
        .trim();
}

/**
 * Implements the 'increment' naming strategy.
 * Detects trailing versions/integers and bumps them:
 * - "Project v1" -> "Project v2"
 * - "Doc 1.0" -> "Doc 1.1"
 * - "Widget (2)" -> "Widget (3)"
 * - "Widget" -> "Widget 2"
 */
export function IncrementName(name: string): string {
    // Linear scans instead of anchored lazy regexes, which backtrack polynomially on long digit or whitespace runs.

    // 1. Parenthesized number at end: "Title (1)" -> "Title (2)"
    if (name.endsWith(')')) {
        const [beforeDigits, digits] = splitTrailingDigits(name.slice(0, -1));
        if (digits && beforeDigits.endsWith('(')) {
            const prefix = beforeDigits.slice(0, -1).trimEnd();
            return `${prefix} (${parseInt(digits, 10) + 1})`;
        }
    }

    // 2. Dotted version at end: "Title v1.2" or "Title 1.2" -> "Title 1.3"
    const [beforeMinor, minor] = splitTrailingDigits(name);
    if (minor && beforeMinor.endsWith('.')) {
        const [prefix, major] = splitTrailingDigits(beforeMinor.slice(0, -1));
        if (major) {
            return `${prefix}${major}.${parseInt(minor, 10) + 1}`;
        }
    }

    // 3. Trailing integer with or without 'v'/'V' after a word boundary: "Title v1" -> "Title v2", "Title 5" -> "Title 6"
    if (minor) {
        const withoutV = /[vV]$/.test(beforeMinor) ? beforeMinor.slice(0, -1) : beforeMinor;
        if (withoutV === '' || !/\w$/.test(withoutV)) {
            return `${beforeMinor}${parseInt(minor, 10) + 1}`;
        }
    }

    // 4. No number: append " 2"
    return `${name} 2`;
}

/** Splits a string into [everything before the trailing digit run, the trailing digits]. */
function splitTrailingDigits(value: string): [string, string] {
    let i = value.length;
    while (i > 0 && value.charCodeAt(i - 1) >= 48 && value.charCodeAt(i - 1) <= 57) {
        i--;
    }
    return [value.slice(0, i), value.slice(i)];
}

/** Most candidates tried before giving up; a column this crowded needs a name from the user. */
const MAX_NAME_ATTEMPTS = 1000;

/**
 * `head + keep`, shortening `head` (never `keep`, which carries the counter) to fit `maxLength`.
 * Null when `keep` alone doesn't fit.
 */
function fitKeeping(head: string, keep: string, maxLength: number | undefined): string | null {
    if (!maxLength || maxLength <= 0 || head.length + keep.length <= maxLength) return head + keep;
    const room = maxLength - keep.length;
    if (room < 0) return null;
    return head.slice(0, room).trimEnd() + keep;
}

/**
 * The next name not in `existingNames`, or null when none can be found: the column is too short
 * for a distinct name, or every candidate within MAX_NAME_ATTEMPTS is taken. Comparison is
 * case-insensitive, like SQL Server's default collation. The source name itself is never returned
 * by the renaming strategies ('none' and 'prompt' leave the name to the caller).
 */
export function TryFindNextAvailableName(
    sourceName: string,
    existingNames: Set<string> | string[],
    options?: NameTemplateOptions
): string | null {
    const strategy = options?.Strategy || 'suffix';
    if (strategy === 'none' || strategy === 'prompt') return sourceName;
    const lowered = new Set([...existingNames].map((n) => n.toLowerCase()));
    const seen = new Set<string>([sourceName.toLowerCase()]);
    for (const candidate of nameCandidates(sourceName, options)) {
        // An increment that no longer fits ends the search; a suffix candidate that doesn't fit is skipped.
        if (candidate === null) {
            if (strategy === 'increment') return null;
            continue;
        }
        const key = candidate.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        if (!lowered.has(key)) return candidate;
    }
    return null;
}

/**
 * Every name the renaming strategies try, in order, up to MAX_NAME_ATTEMPTS; null for one that
 * can't fit `MaxLength`. Candidates may repeat (a short column cuts several to the same text).
 */
function* nameCandidates(sourceName: string, options?: NameTemplateOptions): Generator<string | null> {
    const strategy = options?.Strategy || 'suffix';
    const maxLength = options?.MaxLength;

    if (strategy === 'increment') {
        // Fit each step before checking it, keeping the trailing counter whole.
        let next = sourceName;
        for (let i = 0; i < MAX_NAME_ATTEMPTS; i++) {
            next = IncrementName(next);
            const closing = next.endsWith(')') ? ')' : '';
            const [before, digits] = splitTrailingDigits(closing ? next.slice(0, -1) : next);
            const marker = /\s?[(vV]?$/.exec(before)?.[0] ?? '';
            const candidate = fitKeeping(before.slice(0, before.length - marker.length), marker + digits + closing, maxLength);
            yield candidate;
            if (candidate === null) return;
        }
        return;
    }

    // 'suffix': the template, then " (n)" (or {n} in the template) until a name is free.
    const template = options?.Template || 'Copy of {Name}';
    const ctx: NameTemplateContext = { SourceRecordName: sourceName, DateStr: options?.Context?.DateStr, UserName: options?.Context?.UserName };
    const hasCounter = template.includes('{n}');
    const candidateFor = (n: number): string | null => {
        const counter = hasCounter ? String(n) : n === 1 ? '' : ` (${n})`;
        const render = (name: string) => RenderNameTemplate(template, { ...ctx, SourceRecordName: name, Counter: n });
        const withCounter = (name: string) => (hasCounter ? render(name) : render(name) + counter);
        const full = withCounter(sourceName);
        if (!maxLength || maxLength <= 0 || full.length <= maxLength) return full;
        // Shorten the name first...
        const room = sourceName.length - (full.length - maxLength);
        if (room > 0) {
            const shortened = withCounter(sourceName.slice(0, room).trimEnd());
            // A template without {Name} doesn't get shorter with the name: fall through to trimming its text.
            if (shortened.length <= maxLength) return shortened;
        }
        // ...then the template's own text, keeping the counter.
        const bare = hasCounter ? RenderNameTemplate(template, { ...ctx, SourceRecordName: '', Counter: undefined }) : render('');
        return fitKeeping(bare, hasCounter ? String(n) : counter, maxLength);
    };
    for (let n = 1; n <= MAX_NAME_ATTEMPTS; n++) yield candidateFor(n);
}

/**
 * Finds the next available name for `sourceName`; see {@link TryFindNextAvailableName}. Returns the
 * source name unchanged when no distinct name can be found.
 */
export function FindNextAvailableName(
    sourceName: string,
    existingNames: Set<string> | string[],
    options?: NameTemplateOptions
): string {
    return TryFindNextAvailableName(sourceName, existingNames, options) ?? sourceName;
}
