/**
 * Best-effort round-trip: parse Component JSX code back into a
 * FormCanvasModel. Lossy — anything we don't recognise falls into a single
 * "raw" static-text element so the form remains visible in code-mode even
 * when the canvas can't fully represent it.
 *
 * This is intentionally a *regex* scan, not an AST walk: pulling in
 * `@babel/parser` (or a runtime JSX parser) would substantially increase
 * the dashboards bundle size, and the canvas already has a fallback path
 * ("View Code" is the primary editing surface when round-trip fails).
 *
 * Heuristics:
 *  - <h3> heading text → new section title
 *  - value("FieldName") OR record.FieldName references → field element
 *  - If we find fields the schema doesn't know about, we drop them
 *  - If we find zero fields, we return `null` and the caller falls back to
 *    code-only mode
 */
import type { CuratedFormSchema } from '@memberjunction/interactive-component-types/forms';
import type { FormCanvasModel, FormCanvasSection, FormCanvasElement } from './form-canvas-model';
import { buildEmptySection, generateCanvasId } from './form-canvas-model';

export interface ParseResult {
    /** The reconstructed canvas, or null if too lossy to use. */
    canvas: FormCanvasModel | null;
    /** True iff we used the AST fallback path. (Reserved — currently regex only.) */
    usedAst: false;
    /** True iff the parser detected JSX patterns it couldn't represent. */
    hasUnknownConstructs: boolean;
    /** Optional debug breadcrumbs. */
    notes: string[];
}

export function parseCanvasFromCode(
    code: string,
    schema: CuratedFormSchema,
): ParseResult {
    const notes: string[] = [];
    const fieldNamesInSchema = new Set(schema.fields.map(f => f.name));

    // 1) Find all <h3>...</h3> headings → section titles
    const headings = Array.from(code.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g))
        .map(m => ({ index: m.index ?? 0, title: stripJsx(m[1]) }));

    // 2) Find all field references via value("FieldName") OR record.FieldName
    const fieldRefRegex = /(?:value\("([A-Za-z_][A-Za-z0-9_]*)"\)|record\.([A-Za-z_][A-Za-z0-9_]*))/g;
    const fieldMatches = Array.from(code.matchAll(fieldRefRegex))
        .map(m => ({ index: m.index ?? 0, name: m[1] ?? m[2] }));

    if (fieldMatches.length === 0) {
        notes.push('No field references detected; canvas not reconstructible from code.');
        return { canvas: null, usedAst: false, hasUnknownConstructs: true, notes };
    }

    // 3) Bucket fields into sections by position. A field whose position is
    //    >= heading[i].index and < heading[i+1].index belongs to section i.
    //    If there are no headings, everything goes into a default "Details"
    //    section.
    const sections: FormCanvasSection[] = headings.length === 0
        ? [buildEmptySection('Details')]
        : headings.map(h => ({ ...buildEmptySection(h.title), title: h.title }));

    const seen = new Set<string>();
    let unknown = false;
    for (const ref of fieldMatches) {
        if (seen.has(ref.name)) continue;
        seen.add(ref.name);
        if (!fieldNamesInSchema.has(ref.name)) {
            // Field referenced but not in the curated schema — likely a
            // foreign-key sub-attribute access (e.g. value("Account")?.Name).
            // Skip silently; the static-text fallback below will catch the
            // visual content.
            continue;
        }

        // Find the section this reference falls into.
        const sectionIndex = headings.length === 0
            ? 0
            : findSectionIndex(ref.index, headings);
        const section = sections[sectionIndex];
        const element: FormCanvasElement = {
            id: generateCanvasId('field'),
            type: 'field',
            fieldName: ref.name,
            span: 1,
        };
        section.elements.push(element);
    }

    // 4) Look for obviously-non-representable JSX (state hooks beyond draft,
    //    custom components, inline subcomponents) — surface to the UI so we
    //    can show the "advanced" badge.
    if (/<components\.|useReducer|useMemo|new Map\(|new Set\(/.test(code)) {
        unknown = true;
        notes.push('Detected advanced JSX constructs; canvas may be incomplete.');
    }

    // Drop empty sections (no fields landed in them).
    const nonEmpty = sections.filter(s => s.elements.length > 0);
    if (nonEmpty.length === 0) {
        return { canvas: null, usedAst: false, hasUnknownConstructs: true, notes };
    }

    // 5) Try to find the form title from <h2>...</h2>.
    const titleMatch = code.match(/<h2[^>]*>([^<{}]+)<\/h2>/);
    const title = titleMatch ? stripJsx(titleMatch[1]) : undefined;

    return {
        canvas: {
            entityName: schema.entityName,
            title,
            sections: nonEmpty,
        },
        usedAst: false,
        hasUnknownConstructs: unknown,
        notes,
    };
}

function findSectionIndex(charIndex: number, headings: Array<{ index: number; title: string }>): number {
    for (let i = headings.length - 1; i >= 0; i--) {
        if (charIndex >= headings[i].index) return i;
    }
    return 0;
}

/** Strip simple JSX/HTML escapes so titles render cleanly. */
function stripJsx(s: string): string {
    return s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&#123;/g, '{')
        .replace(/&#125;/g, '}')
        .trim();
}
