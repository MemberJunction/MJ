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
    id: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** What kind of element is this? */
    type: 'field' | 'static-text' | 'spacer' | 'computed';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Required for `type === 'field'` — the curated-schema field name. */
    fieldName?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Display label override; defaults to schema.displayName. */
    label?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Required override; if absent, schema.required wins. */
    required?: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Helper text rendered under the input. */
    helper?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Grid span within section: 1 = half-width in 2-column, 2 = full-width. */
    span?: 1 | 2;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Text body for `type === 'static-text'`. */
    text?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Expression body for `type === 'computed'`. */
    expression?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/** A grouping of elements with an optional heading. */
export interface FormCanvasSection {
    id: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    title: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    collapsible: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    columns: 1 | 2;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    elements: FormCanvasElement[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/** Top-level canvas state. */
export interface FormCanvasModel {
    /** Canonical entity name from the curated schema, e.g. "MJ: Users". */
    entityName: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Form title (rendered above the sections). */
    title?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    /** Sections in display order. */
    sections: FormCanvasSection[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/** Generate a short stable id for canvas elements. Not cryptographic. */
export function GenerateCanvasId(prefix: string): string {
    const slug = Math.random().toString(36).slice(2, 10);
    return `${prefix}-${slug}`;
}

/** @deprecated Use {@link GenerateCanvasId}. */
export function generateCanvasId(prefix: string): string {
    return GenerateCanvasId(prefix);
}

/** Build a default, empty section. */
export function BuildEmptySection(title = 'Untitled Section'): FormCanvasSection {
    return {
        id: GenerateCanvasId('section'),
        title,
        collapsible: false,
        columns: 2,
        elements: [],
    };
}

/** @deprecated Use {@link BuildEmptySection}. */
export function buildEmptySection(title = 'Untitled Section'): FormCanvasSection {
    return BuildEmptySection(title);
}

/** Build a default empty canvas for an entity. */
export function BuildEmptyCanvas(entityName: string, title?: string): FormCanvasModel {
    return {
        entityName,
        title: title ?? '',
        sections: [BuildEmptySection('Details')],
    };
}

/** @deprecated Use {@link BuildEmptyCanvas}. */
export function buildEmptyCanvas(entityName: string, title?: string): FormCanvasModel {
    return BuildEmptyCanvas(entityName, title);
}
