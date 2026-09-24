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
    // 1. Parenthesized number at end: "Title (1)" -> "Title (2)"
    const parenMatch = name.match(/^(.*?)\s*\((\d+)\)$/);
    if (parenMatch) {
        const prefix = parenMatch[1];
        const num = parseInt(parenMatch[2], 10) + 1;
        return `${prefix} (${num})`;
    }

    // 2. Dotted version at end: "Title v1.2" or "Title 1.2" -> "Title 1.3"
    const versionMatch = name.match(/^(.*?)(\d+)\.(\d+)$/);
    if (versionMatch) {
        const prefix = versionMatch[1];
        const major = versionMatch[2];
        const minor = parseInt(versionMatch[3], 10) + 1;
        return `${prefix}${major}.${minor}`;
    }

    // 3. Trailing integer with or without 'v'/'V': "Title v1" -> "Title v2", "Title 5" -> "Title 6"
    const trailingNumMatch = name.match(/^(.*?\b[vV]?)(\d+)$/);
    if (trailingNumMatch) {
        const prefix = trailingNumMatch[1];
        const num = parseInt(trailingNumMatch[2], 10) + 1;
        return `${prefix}${num}`;
    }

    // 4. No number: append " 2"
    return `${name} 2`;
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
    const existing = existingNames instanceof Set ? existingNames : new Set(existingNames);
    const strategy = options?.Strategy || 'suffix';

    if (strategy === 'none') {
        return sourceName;
    }

    if (strategy === 'increment') {
        let candidate = IncrementName(sourceName);
        while (existing.has(candidate)) {
            candidate = IncrementName(candidate);
        }
        return candidate;
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
    if (rawTemplate.includes('{n}')) {
        let n = 1;
        while (true) {
            const candidate = RenderNameTemplate(rawTemplate, { ...ctx, Counter: n });
            if (!existing.has(candidate)) {
                return candidate;
            }
            n++;
        }
    }

    // If template does not have {n}, try the raw template first
    const firstCandidate = RenderNameTemplate(rawTemplate, ctx);
    if (!existing.has(firstCandidate)) {
        return firstCandidate;
    }

    // Collision! Append " ({n})" deterministically
    let n = 2;
    while (true) {
        const candidate = `${firstCandidate} (${n})`;
        if (!existing.has(candidate)) {
            return candidate;
        }
        n++;
    }
}
