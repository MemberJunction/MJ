import type { TemplateTagForm } from './sqlTokenTypes.js';

/** A template tag found in the raw text, before any SQL is read. */
export interface ScannedTag {
    readonly Form: TemplateTagForm;
    readonly Start: number;
    readonly End: number;
    readonly BodyStart: number;
    readonly BodyEnd: number;
    readonly TrimBefore: boolean;
    readonly TrimAfter: boolean;
}

/** A template opener with no closer. */
export interface UnclosedOpener {
    readonly Form: TemplateTagForm;
    readonly Start: number;
}

/** What {@link ScanTemplateTags} found. */
export interface TagScan {
    readonly Tags: readonly ScannedTag[];
    readonly Unclosed: readonly UnclosedOpener[];
}

const OPENERS: Readonly<Record<string, TemplateTagForm>> = { '{': 'Expression', '%': 'Block', '#': 'Comment' };
const CLOSERS: Readonly<Record<TemplateTagForm, string>> = { Expression: '}}', Block: '%}', Comment: '#}' };

/**
 * Finds every template tag (`{{ }}`, `{% %}`, `{# #}`) in the raw text, as the template engine
 * does: tags are found before, and regardless of, any SQL quoting. Inside `{{ }}` and `{% %}`
 * a closer within a quoted template string does not end the tag; a `{# #}` ends at its first
 * `#}`.
 *
 * Runs in linear time. Once a tag of one form fails to find its closer, every later opener of
 * that form is reported unclosed without another scan to the end of the text.
 */
export function ScanTemplateTags(text: string): TagScan {
    const tags: ScannedTag[] = [];
    const unclosed: UnclosedOpener[] = [];
    const exhausted = new Set<TemplateTagForm>();
    let i = 0;
    while (i < text.length - 1) {
        const form = text[i] === '{' ? OPENERS[text[i + 1]] : undefined;
        if (form === undefined) { i++; continue; }
        const tag = exhausted.has(form) ? null : readTag(text, i, form);
        if (tag) { tags.push(tag); i = tag.End; continue; }
        exhausted.add(form);
        unclosed.push({ Form: form, Start: i });
        i += 2;
    }
    return { Tags: tags, Unclosed: unclosed };
}

/** Reads the tag opening at `start`, or returns `null` when it has no closer. */
function readTag(text: string, start: number, form: TemplateTagForm): ScannedTag | null {
    const trimBefore = text[start + 2] === '-';
    const bodyStart = start + (trimBefore ? 3 : 2);
    const closeAt = form === 'Comment' ? text.indexOf(CLOSERS.Comment, start + 2) : findCloser(text, start + 2, CLOSERS[form]);
    if (closeAt < 0) return null;
    const trimAfter = closeAt > bodyStart && text[closeAt - 1] === '-';
    const bodyEnd = trimAfter ? closeAt - 1 : closeAt;
    return {
        Form: form, Start: start, End: closeAt + 2,
        BodyStart: bodyStart, BodyEnd: Math.max(bodyStart, bodyEnd),
        TrimBefore: trimBefore, TrimAfter: trimAfter,
    };
}

/** The offset of `closer` at or after `from`, skipping quoted template strings; -1 when there is none. */
function findCloser(text: string, from: number, closer: string): number {
    let quote: string | null = null;
    for (let i = from; i < text.length; i++) {
        const c = text[i];
        if (quote !== null) {
            if (c === '\\') i++;
            else if (c === quote) quote = null;
            continue;
        }
        if (c === "'" || c === '"') quote = c;
        else if (c === closer[0] && text[i + 1] === closer[1]) return i;
    }
    return -1;
}
