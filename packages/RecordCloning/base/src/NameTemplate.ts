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
 * Builds a candidate from `render(name)`, shortening `name` (never the template's own text) until
 * the result fits `maxLength`. When even an empty name doesn't fit, the result is cut to length.
 */
function fitToLength(sourceName: string, maxLength: number | undefined, render: (name: string) => string): string {
    const full = render(sourceName);
    if (!maxLength || maxLength <= 0 || full.length <= maxLength) return full;
    const overhead = full.length - sourceName.length;
    const room = maxLength - overhead;
    if (room <= 0) return full.slice(0, maxLength).trimEnd();
    return render(sourceName.slice(0, room).trimEnd());
}

/**
 * The text every candidate `FindNextAvailableName` could produce starts with, for looking up
 * existing names with a prefix match. Empty when there is no stable prefix.
 */
export function NameCollisionPrefix(sourceName: string, options?: NameTemplateOptions): string {
    const strategy = options?.Strategy || 'suffix';
    if (strategy === 'none' || strategy === 'prompt') return '';
    if (strategy === 'increment') {
        // "Project v1" -> "Project v": every increment keeps the text before its trailing number.
        const next = IncrementName(sourceName);
        const [stem] = splitTrailingDigits(next.endsWith(')') ? next.slice(0, -1) : next);
        return options?.MaxLength ? stem.slice(0, options.MaxLength) : stem;
    }
    const template = options?.Template || 'Copy of {Name}';
    const beforeCounter = template.includes('{n}') ? template.slice(0, template.indexOf('{n}')) : template;
    const ctx: NameTemplateContext = { SourceRecordName: sourceName, DateStr: options?.Context?.DateStr, UserName: options?.Context?.UserName };
    // Shortening for MaxLength can cut into the name, so match on what survives the tightest cut.
    const shortest = fitToLength(sourceName, options?.MaxLength ? options.MaxLength - 6 : undefined, (name) =>
        RenderNameTemplate(beforeCounter, { ...ctx, SourceRecordName: name })
    );
    return shortest;
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

/**
 * Finds the next deterministically available name given a source name and
 * an existing list or set of colliding names.
 */
export function FindNextAvailableName(
    sourceName: string,
    existingNames: Set<string> | string[],
    options?: NameTemplateOptions
): string {
    // Unique indexes usually compare case-insensitively (SQL Server's default collation), so collisions do too.
    const lowered = new Set([...existingNames].map((n) => n.toLowerCase()));
    const existing = { has: (candidate: string) => lowered.has(candidate.toLowerCase()) };
    const strategy = options?.Strategy || 'suffix';
    const maxLength = options?.MaxLength;

    if (strategy === 'none') {
        return sourceName;
    }

    if (strategy === 'increment') {
        let candidate = IncrementName(sourceName);
        while (existing.has(candidate)) {
            candidate = IncrementName(candidate);
        }
        return fitToLength(candidate, maxLength, (name) => name);
    }

    // 'suffix' strategy
    const rawTemplate = options?.Template || 'Copy of {Name}';
    const ctx: NameTemplateContext = {
        SourceRecordName: sourceName,
        Counter: 1,
        DateStr: options?.Context?.DateStr,
        UserName: options?.Context?.UserName,
    };

    // If template has {n}, start testing from n=1 (or n=2 if initial has no n)
    const render = (counter: number | undefined, suffix = '') =>
        fitToLength(sourceName, maxLength, (name) => RenderNameTemplate(rawTemplate, { ...ctx, SourceRecordName: name, Counter: counter }) + suffix);

    if (rawTemplate.includes('{n}')) {
        let n = 1;
        while (true) {
            const candidate = render(n);
            if (!existing.has(candidate)) {
                return candidate;
            }
            n++;
        }
    }

    // If template does not have {n}, try the raw template first
    const firstCandidate = render(ctx.Counter);
    if (!existing.has(firstCandidate)) {
        return firstCandidate;
    }

    // Collision! Append " ({n})" deterministically
    let n = 2;
    while (true) {
        const candidate = render(ctx.Counter, ` (${n})`);
        if (!existing.has(candidate)) {
            return candidate;
        }
        n++;
    }
}
