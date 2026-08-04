/**
 * Serializable canvas model for Form Studio.
 *
 * This is the source of truth for the visual builder: sections + elements +
 * layout. Code generation derives JSX from it; the round-trip parser tries
 * to reconstruct it from existing Component code on load.
 *
 * The model is plain JSON — easy to diff, easy to ship over the wire to the
 * agent when "Open in Chat" is invoked, easy to round-trip into a
 * ComponentSpec.code string.
 */

/** A single field/section/element on the canvas. */
export interface FormCanvasElement {
    /** Stable id for cdk drag-drop tracking; never persisted to JSX. */
    id: string;
    /** What kind of element is this? */
    type: 'field' | 'static-text' | 'spacer' | 'computed';
    /** Required for `type === 'field'` — the curated-schema field name. */
    fieldName?: string;
    /** Display label override; defaults to schema.displayName. */
    label?: string;
    /** Required override; if absent, schema.required wins. */
    required?: boolean;
    /** Helper text rendered under the input. */
    helper?: string;
    /** Grid span within section: 1 = half-width in 2-column, 2 = full-width. */
    span?: 1 | 2;
    /** Text body for `type === 'static-text'`. */
    text?: string;
    /** Expression body for `type === 'computed'`. */
    expression?: string;
}

/** A grouping of elements with an optional heading. */
export interface FormCanvasSection {
    id: string;
    title: string;
    collapsible: boolean;
    columns: 1 | 2;
    elements: FormCanvasElement[];
}

/** Top-level canvas state. */
export interface FormCanvasModel {
    /** Canonical entity name from the curated schema, e.g. "MJ: Users". */
    entityName: string;
    /** Form title (rendered above the sections). */
    title?: string;
    /** Sections in display order. */
    sections: FormCanvasSection[];
}

/** Generate a short stable id for canvas elements. Not cryptographic. */
export function generateCanvasId(prefix: string): string {
    const slug = Math.random().toString(36).slice(2, 10);
    return `${prefix}-${slug}`;
}

/** Build a default, empty section. */
export function buildEmptySection(title = 'Untitled Section'): FormCanvasSection {
    return {
        id: generateCanvasId('section'),
        title,
        collapsible: false,
        columns: 2,
        elements: [],
    };
}

/** Build a default empty canvas for an entity. */
export function buildEmptyCanvas(entityName: string, title?: string): FormCanvasModel {
    return {
        entityName,
        title: title ?? '',
        sections: [buildEmptySection('Details')],
    };
}
