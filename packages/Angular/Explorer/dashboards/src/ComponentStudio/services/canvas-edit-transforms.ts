/**
 * Pure, immutable canvas-edit transforms + the agent client-tool factory
 * shared by the Form Builder cockpit (`FormBuilderResourceComponent`) and
 * Component Studio's Form Builder tab (`ComponentStudioDashboardComponent`).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 * Both surfaces edit the SAME {@link FormCanvasModel} via the SAME lifecycle
 * mutations (add/remove field, relabel, toggle required, set span, reorder,
 * add/remove/rename section). The granular VOICE-EDIT client-tool suite a
 * realtime co-agent uses to drive the canvas must therefore be defined ONCE
 * and reused — otherwise the two surfaces drift. The transforms here are the
 * correctness backbone (this is where the unit tests live); the per-component
 * wiring is a thin adapter that supplies "read the current canvas" + "apply a
 * new canvas" callbacks.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * 🔒 SAFETY BOUNDARY
 * EVERY transform in this file is a REVERSIBLE edit to the in-memory canvas
 * DEFINITION only. Nothing here saves, publishes, persists, activates an
 * override, or deletes a whole form/Component — those are destructive /
 * irreversible operations the user must confirm in the UI, and they are
 * intentionally NOT exposed as agent tools. The agent can rearrange the
 * canvas freely; committing that canvas to the database stays a human action.
 * Do NOT add a Save / Publish / DeleteForm tool to {@link buildCanvasEditClientTools}.
 * ──────────────────────────────────────────────────────────────────────────
 */

import {
    type FormCanvasElement,
    type FormCanvasModel,
    type FormCanvasSection,
    buildEmptySection,
} from './form-canvas-model';

/** A typed agent client-tool, matching the shape NavigationService expects. */
export interface CanvasEditClientTool {
    Name: string;
    Description: string;
    ParameterSchema: Record<string, unknown>;
    Handler: (params: Record<string, unknown>) => Promise<CanvasEditToolResult>;
}

/** Uniform result envelope every canvas-edit tool returns. */
export interface CanvasEditToolResult {
    Success: boolean;
    Data?: unknown;
    ErrorMessage?: string;
}

/** A successful transform plus a short human-readable note (for the agent). */
export interface CanvasTransformResult {
    canvas: FormCanvasModel;
    note: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Lookup helpers (pure, read-only)
// ──────────────────────────────────────────────────────────────────────────

/** Find an element by id across all sections. Returns null when absent. */
export function findElement(
    canvas: FormCanvasModel,
    elementId: string,
): FormCanvasElement | null {
    for (const section of canvas.sections) {
        const el = section.elements.find(e => e.id === elementId);
        if (el) return el;
    }
    return null;
}

/** Find a section by id. Returns null when absent. */
export function findSection(
    canvas: FormCanvasModel,
    sectionId: string,
): FormCanvasSection | null {
    return canvas.sections.find(s => s.id === sectionId) ?? null;
}

/** Distinct field names currently placed on the canvas, in display order. */
export function collectFieldNames(canvas: FormCanvasModel): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const section of canvas.sections) {
        for (const el of section.elements) {
            if (el.type === 'field' && el.fieldName && !seen.has(el.fieldName)) {
                seen.add(el.fieldName);
                out.push(el.fieldName);
            }
        }
    }
    return out;
}

/** Find the section that contains the given element id. Null when absent. */
export function findSectionOfElement(
    canvas: FormCanvasModel,
    elementId: string,
): FormCanvasSection | null {
    return canvas.sections.find(s => s.elements.some(e => e.id === elementId)) ?? null;
}

/**
 * Best display label for an element — the explicit label override, else the
 * field name, else the element type. Used so the context the agent sees (and
 * the tolerant resolvers below) can talk about elements by a human label, not
 * just opaque ids.
 */
export function elementDisplayLabel(el: FormCanvasElement): string {
    return el.label?.trim() || el.fieldName?.trim() || el.type;
}

/**
 * Resolve an element by id OR by a human label (display-label / field name),
 * case-insensitively. Tries exact id → exact label (case-insensitive) →
 * partial-contains on the label. Returns null on no match so the caller can
 * emit a tolerant "no such field" error listing what IS available. A voice
 * co-agent rarely has the synthetic element id to hand — it heard "the email
 * field" — so accepting the label keeps the granular tools usable by voice.
 */
export function resolveElement(
    canvas: FormCanvasModel,
    idOrLabel: string,
): FormCanvasElement | null {
    const byId = findElement(canvas, idOrLabel);
    if (byId) return byId;
    const needle = idOrLabel.trim().toLowerCase();
    if (!needle) return null;
    const all: FormCanvasElement[] = canvas.sections.flatMap(s => s.elements);
    const exact = all.find(e => elementDisplayLabel(e).toLowerCase() === needle);
    if (exact) return exact;
    return all.find(e => elementDisplayLabel(e).toLowerCase().includes(needle)) ?? null;
}

/**
 * Resolve a section by id OR by its title, case-insensitively (exact id →
 * exact title → partial-contains). Same rationale as {@link resolveElement}.
 */
export function resolveSection(
    canvas: FormCanvasModel,
    idOrTitle: string,
): FormCanvasSection | null {
    const byId = findSection(canvas, idOrTitle);
    if (byId) return byId;
    const needle = idOrTitle.trim().toLowerCase();
    if (!needle) return null;
    const exact = canvas.sections.find(s => (s.title ?? '').trim().toLowerCase() === needle);
    if (exact) return exact;
    return canvas.sections.find(s => (s.title ?? '').trim().toLowerCase().includes(needle)) ?? null;
}

// ──────────────────────────────────────────────────────────────────────────
// Immutable element transforms
// ──────────────────────────────────────────────────────────────────────────

/**
 * Return a NEW canvas with a shallow patch applied to the element identified
 * by `elementId`. Sections/elements not touched are reused by reference; the
 * containing section and the target element are reconstructed immutably.
 * No-op (returns the same canvas reference) when the element is absent.
 */
export function updateElementInCanvas(
    canvas: FormCanvasModel,
    elementId: string,
    patch: Partial<FormCanvasElement>,
): FormCanvasModel {
    if (!findElement(canvas, elementId)) return canvas;
    return {
        ...canvas,
        sections: canvas.sections.map(section => {
            if (!section.elements.some(e => e.id === elementId)) return section;
            return {
                ...section,
                elements: section.elements.map(e =>
                    e.id === elementId ? { ...e, ...patch, id: e.id } : e),
            };
        }),
    };
}

/** Return a NEW canvas with the given element removed from its section. */
export function removeElementFromCanvas(
    canvas: FormCanvasModel,
    elementId: string,
): FormCanvasModel {
    if (!findElement(canvas, elementId)) return canvas;
    return {
        ...canvas,
        sections: canvas.sections.map(section => ({
            ...section,
            elements: section.elements.filter(e => e.id !== elementId),
        })),
    };
}

/**
 * Return a NEW canvas with a freshly-created field element appended to the
 * target section. The new element id is supplied by the caller (so the host
 * can use its own id generator) — pure functions don't reach for randomness.
 * No-op when the section is absent.
 */
export function addFieldToCanvas(
    canvas: FormCanvasModel,
    sectionId: string,
    fieldName: string,
    newElementId: string,
): FormCanvasModel {
    if (!findSection(canvas, sectionId)) return canvas;
    const element: FormCanvasElement = {
        id: newElementId,
        type: 'field',
        fieldName,
        span: 1,
    };
    return {
        ...canvas,
        sections: canvas.sections.map(section =>
            section.id === sectionId
                ? { ...section, elements: [...section.elements, element] }
                : section),
    };
}

/**
 * Return a NEW canvas with the element identified by `elementId` MOVED to the
 * end of the target section (or to `index` within it, clamped). No-op (same
 * reference) when the element or the target section is absent, or when the
 * element is already the only thing where it'd land in the same spot. Moving
 * within the same section acts as a reposition.
 */
export function moveElementToSection(
    canvas: FormCanvasModel,
    elementId: string,
    targetSectionId: string,
    index?: number,
): FormCanvasModel {
    const el = findElement(canvas, elementId);
    if (!el) return canvas;
    if (!findSection(canvas, targetSectionId)) return canvas;
    // First strip the element from wherever it is, then insert into target.
    const stripped = canvas.sections.map(section => ({
        ...section,
        elements: section.elements.filter(e => e.id !== elementId),
    }));
    const sections = stripped.map(section => {
        if (section.id !== targetSectionId) return section;
        const next = [...section.elements];
        const clamped = index == null || index < 0
            ? next.length
            : Math.min(index, next.length);
        next.splice(clamped, 0, el);
        return { ...section, elements: next };
    });
    return { ...canvas, sections };
}

/**
 * Return a NEW canvas with a DUPLICATE of `elementId` inserted immediately
 * after the original, in the same section. The clone's id is caller-supplied
 * (purity). No-op when the source element is absent.
 */
export function duplicateElementInCanvas(
    canvas: FormCanvasModel,
    elementId: string,
    newElementId: string,
): FormCanvasModel {
    const source = findElement(canvas, elementId);
    if (!source) return canvas;
    const clone: FormCanvasElement = { ...source, id: newElementId };
    return {
        ...canvas,
        sections: canvas.sections.map(section => {
            const idx = section.elements.findIndex(e => e.id === elementId);
            if (idx < 0) return section;
            const elements = [...section.elements];
            elements.splice(idx + 1, 0, clone);
            return { ...section, elements };
        }),
    };
}

// ──────────────────────────────────────────────────────────────────────────
// Immutable section transforms
// ──────────────────────────────────────────────────────────────────────────

/** Return a NEW canvas with a shallow patch applied to one section. */
export function updateSectionInCanvas(
    canvas: FormCanvasModel,
    sectionId: string,
    patch: Partial<Omit<FormCanvasSection, 'id' | 'elements'>>,
): FormCanvasModel {
    if (!findSection(canvas, sectionId)) return canvas;
    return {
        ...canvas,
        sections: canvas.sections.map(section =>
            section.id === sectionId
                ? { ...section, ...patch, id: section.id, elements: section.elements }
                : section),
    };
}

/** Return a NEW canvas with the given section removed. */
export function removeSectionFromCanvas(
    canvas: FormCanvasModel,
    sectionId: string,
): FormCanvasModel {
    if (!findSection(canvas, sectionId)) return canvas;
    return {
        ...canvas,
        sections: canvas.sections.filter(s => s.id !== sectionId),
    };
}

/**
 * Return a NEW canvas with a new empty section inserted at `index` (clamped
 * to [0, sections.length]; an out-of-range or omitted index appends). The new
 * section's id is caller-supplied for the same purity reason as fields.
 */
export function addSectionToCanvas(
    canvas: FormCanvasModel,
    newSectionId: string,
    title?: string,
    index?: number,
): FormCanvasModel {
    const section: FormCanvasSection = { ...buildEmptySection(title), id: newSectionId };
    const sections = [...canvas.sections];
    const clamped = index == null || index < 0
        ? sections.length
        : Math.min(index, sections.length);
    sections.splice(clamped, 0, section);
    return { ...canvas, sections };
}

/**
 * Return a NEW canvas with the target section's elements reordered to match
 * `orderedElementIds`. The provided ids must be exactly the section's current
 * element ids (a permutation) — otherwise the transform refuses and returns
 * the same canvas reference, so a bad reorder can't silently drop elements.
 */
export function reorderSectionElements(
    canvas: FormCanvasModel,
    sectionId: string,
    orderedElementIds: ReadonlyArray<string>,
): FormCanvasModel {
    const section = findSection(canvas, sectionId);
    if (!section) return canvas;
    if (!isPermutationOfIds(section.elements, orderedElementIds)) return canvas;
    const byId = new Map(section.elements.map(e => [e.id, e] as const));
    const reordered = orderedElementIds.map(id => byId.get(id)!);
    return {
        ...canvas,
        sections: canvas.sections.map(s =>
            s.id === sectionId ? { ...s, elements: reordered } : s),
    };
}

/**
 * Return a NEW canvas with its sections reordered to match `orderedSectionIds`.
 * The ids must be exactly a permutation of the canvas's current section ids —
 * otherwise the transform refuses (same reference), so a bad reorder can't
 * silently drop a section.
 */
export function reorderSections(
    canvas: FormCanvasModel,
    orderedSectionIds: ReadonlyArray<string>,
): FormCanvasModel {
    if (!isSectionPermutation(canvas.sections, orderedSectionIds)) return canvas;
    const byId = new Map(canvas.sections.map(s => [s.id, s] as const));
    return { ...canvas, sections: orderedSectionIds.map(id => byId.get(id)!) };
}

/**
 * Move a single section to a new 0-based position (clamped to range). Thin
 * convenience over {@link reorderSections} for the "move THIS section up/to
 * the top" voice command. No-op when the section is absent.
 */
export function moveSectionToIndex(
    canvas: FormCanvasModel,
    sectionId: string,
    index: number,
): FormCanvasModel {
    const current = canvas.sections.findIndex(s => s.id === sectionId);
    if (current < 0) return canvas;
    const ids = canvas.sections.map(s => s.id);
    ids.splice(current, 1);
    const clamped = index < 0 ? 0 : Math.min(index, ids.length);
    ids.splice(clamped, 0, sectionId);
    return reorderSections(canvas, ids);
}

/** True iff `ids` is exactly a permutation of `elements`' ids (no dup/miss). */
function isPermutationOfIds(
    elements: ReadonlyArray<FormCanvasElement>,
    ids: ReadonlyArray<string>,
): boolean {
    if (elements.length !== ids.length) return false;
    const have = new Set(elements.map(e => e.id));
    const seen = new Set<string>();
    for (const id of ids) {
        if (!have.has(id) || seen.has(id)) return false;
        seen.add(id);
    }
    return true;
}

/** True iff `ids` is exactly a permutation of `sections`' ids (no dup/miss). */
function isSectionPermutation(
    sections: ReadonlyArray<FormCanvasSection>,
    ids: ReadonlyArray<string>,
): boolean {
    if (sections.length !== ids.length) return false;
    const have = new Set(sections.map(s => s.id));
    const seen = new Set<string>();
    for (const id of ids) {
        if (!have.has(id) || seen.has(id)) return false;
        seen.add(id);
    }
    return true;
}

// ──────────────────────────────────────────────────────────────────────────
// Span normalization
// ──────────────────────────────────────────────────────────────────────────

/**
 * Coerce an arbitrary numeric span request to the canvas's supported set.
 * The {@link FormCanvasElement} grid span is `1 | 2` (half / full width); any
 * value >= 2 collapses to full-width, anything else to half-width. Keeps the
 * tool tolerant of an agent passing "make it span 12" loosely.
 */
export function normalizeSpan(requested: number): 1 | 2 {
    return requested >= 2 ? 2 : 1;
}

/** The element `type` values the canvas understands, for SetFieldType. */
export const CANVAS_ELEMENT_TYPES: ReadonlyArray<FormCanvasElement['type']> =
    ['field', 'static-text', 'spacer', 'computed'];

/** Coerce a loose `type` request to a valid {@link FormCanvasElement} type, or null. */
export function normalizeElementType(requested: string): FormCanvasElement['type'] | null {
    const t = requested.trim().toLowerCase();
    return CANVAS_ELEMENT_TYPES.find(v => v === t) ?? null;
}

// ──────────────────────────────────────────────────────────────────────────
// Bounded canvas-state context summary (shared by both hosts)
// ──────────────────────────────────────────────────────────────────────────

/** Cap on every name/summary list published to the agent. */
export const CANVAS_CONTEXT_LIST_CAP = 25;

/** One section, summarised for the agent: id, title, field-count, element ids. */
export interface SectionSummary {
    id: string;
    title: string;
    collapsible: boolean;
    columns: 1 | 2;
    elementCount: number;
    fieldCount: number;
}

/** One element, summarised for the agent so it can target it by id or label. */
export interface ElementSummary {
    id: string;
    type: FormCanvasElement['type'];
    label: string;
    fieldName: string | null;
    sectionId: string;
    required: boolean;
    span: 1 | 2;
}

/**
 * The full canvas-state slice both surfaces publish so the agent can target
 * the right element/section and know what's placeable — WITHOUT a tool
 * round-trip. Everything here is derived purely from the canvas + the optional
 * curated field list; the host layers in its own dirty-flag / pane-mode /
 * variant / validation context around this.
 *
 * Lists are bounded to {@link CANVAS_CONTEXT_LIST_CAP}; each capped list gets a
 * companion `*Truncated` flag + a true `*Count` so the agent knows there's more.
 */
export interface CanvasStateSummary {
    EntityName: string;
    FormTitle: string | null;
    SectionCount: number;
    ElementCount: number;
    FieldCount: number;
    /** Section list (bounded). */
    Sections: SectionSummary[];
    SectionsTruncated: boolean;
    /** Placed elements (bounded), each addressable by id or label. */
    Elements: ElementSummary[];
    ElementsTruncated: boolean;
    /** Distinct field names already on the canvas (bounded). */
    PlacedFieldNames: string[];
    /** Curated entity field names NOT yet placed — the AddField candidate set (bounded). */
    AvailableFieldNames: string[];
    AvailableFieldNamesTruncated: boolean;
    AvailableFieldNameCount: number;
    /** Resolved display info for the currently-selected element (or null). */
    SelectedElement: ElementSummary | null;
    /** Resolved display info for the currently-selected section (or null). */
    SelectedSection: SectionSummary | null;
}

function summariseSection(section: FormCanvasSection): SectionSummary {
    return {
        id: section.id,
        title: section.title,
        collapsible: section.collapsible,
        columns: section.columns,
        elementCount: section.elements.length,
        fieldCount: section.elements.filter(e => e.type === 'field' && e.fieldName).length,
    };
}

function summariseElement(el: FormCanvasElement, sectionId: string): ElementSummary {
    return {
        id: el.id,
        type: el.type,
        label: elementDisplayLabel(el),
        fieldName: el.fieldName ?? null,
        sectionId,
        required: el.required ?? false,
        span: el.span ?? 1,
    };
}

/**
 * Build the bounded {@link CanvasStateSummary} for the agent.
 *
 * @param canvas             the live canvas (null → an "empty" summary).
 * @param schemaFieldNames   ALL curated entity field names (for AvailableFieldNames).
 * @param selectedElementId  the host's current element selection, if any.
 * @param selectedSectionId  the host's current section selection, if any.
 */
export function buildCanvasStateSummary(
    canvas: FormCanvasModel | null,
    schemaFieldNames: ReadonlyArray<string>,
    selectedElementId: string | null,
    selectedSectionId: string | null,
): CanvasStateSummary | null {
    if (!canvas) return null;

    const allElements: ElementSummary[] = [];
    for (const section of canvas.sections) {
        for (const el of section.elements) {
            allElements.push(summariseElement(el, section.id));
        }
    }
    const placedFieldNames = collectFieldNames(canvas);
    const placedSet = new Set(placedFieldNames.map(n => n.toLowerCase()));
    const available = schemaFieldNames.filter(n => !placedSet.has(n.toLowerCase()));

    const selEl = selectedElementId ? findElement(canvas, selectedElementId) : null;
    const selElSection = selEl ? findSectionOfElement(canvas, selEl.id) : null;
    const selSec = selectedSectionId ? findSection(canvas, selectedSectionId) : null;

    return {
        EntityName: canvas.entityName,
        FormTitle: canvas.title?.trim() ? canvas.title : null,
        SectionCount: canvas.sections.length,
        ElementCount: allElements.length,
        FieldCount: placedFieldNames.length,
        Sections: canvas.sections.slice(0, CANVAS_CONTEXT_LIST_CAP).map(summariseSection),
        SectionsTruncated: canvas.sections.length > CANVAS_CONTEXT_LIST_CAP,
        Elements: allElements.slice(0, CANVAS_CONTEXT_LIST_CAP),
        ElementsTruncated: allElements.length > CANVAS_CONTEXT_LIST_CAP,
        PlacedFieldNames: placedFieldNames.slice(0, CANVAS_CONTEXT_LIST_CAP),
        AvailableFieldNames: available.slice(0, CANVAS_CONTEXT_LIST_CAP),
        AvailableFieldNamesTruncated: available.length > CANVAS_CONTEXT_LIST_CAP,
        AvailableFieldNameCount: available.length,
        SelectedElement: selEl && selElSection ? summariseElement(selEl, selElSection.id) : null,
        SelectedSection: selSec ? summariseSection(selSec) : null,
    };
}

// ──────────────────────────────────────────────────────────────────────────
// Client-tool factory
// ──────────────────────────────────────────────────────────────────────────

/**
 * Host adapter the tool factory needs: how to read the live canvas, how to
 * apply a transformed canvas back (the host owns dirty-tracking / code
 * regeneration / change detection), how to mint ids, plus the four
 * center-pane / preview navigation actions. Pane actions are optional —
 * Component Studio routes them through its tab system rather than a
 * `SetCenterPaneMode`, so it omits them.
 */
export interface CanvasEditHost {
    /** Current canvas, or null when no form is loaded. */
    GetCanvas(): FormCanvasModel | null;
    /** Apply the transformed canvas (host marks dirty + regenerates code). */
    ApplyCanvas(next: FormCanvasModel): void;
    /** Mint a stable element id for a newly added field. */
    NewElementId(): string;
    /** Mint a stable section id for a newly added section. */
    NewSectionId(): string;
    /** Optional: switch the center pane to the live preview (+ optional record). */
    PreviewForm?(recordId?: string): void;
    /** Optional: switch the center pane to the code view. */
    ViewFormCode?(): void;
    /** Optional: switch the center pane to the layout/canvas view. */
    ViewFormLayout?(): void;
}

/** Standard "no form loaded" failure used by every transform tool. */
function noCanvas(): CanvasEditToolResult {
    return { Success: false, ErrorMessage: 'No active form canvas to edit.' };
}

/** Tolerant "no such element" error listing the (bounded) labels that DO exist. */
function elementNotFound(canvas: FormCanvasModel, idOrLabel: string): CanvasEditToolResult {
    const labels = canvas.sections
        .flatMap(s => s.elements)
        .slice(0, CANVAS_CONTEXT_LIST_CAP)
        .map(elementDisplayLabel);
    return {
        Success: false,
        ErrorMessage: `No field matching '${idOrLabel}'. Available: ${labels.join(', ') || '(none)'}.`,
    };
}

/** Tolerant "no such section" error listing the (bounded) titles that DO exist. */
function sectionNotFound(canvas: FormCanvasModel, idOrTitle: string): CanvasEditToolResult {
    const titles = canvas.sections.slice(0, CANVAS_CONTEXT_LIST_CAP).map(s => s.title);
    return {
        Success: false,
        ErrorMessage: `No section matching '${idOrTitle}'. Available: ${titles.join(', ') || '(none)'}.`,
    };
}

/**
 * Build the granular, reversible canvas-edit client-tool suite. Both Form
 * Builder and Component Studio register the returned array (alongside their
 * existing wholesale `UpdateForm` tool) so a realtime co-agent can voice-edit
 * the form one field/section at a time.
 *
 * Each transform tool: reads the live canvas, applies a pure transform, and
 * (when the transform actually changed something) pushes the result back
 * through the host. Tools that target a specific element/section return a
 * descriptive `ErrorMessage` when the id isn't found — so the agent gets a
 * clear "no such field" instead of a silent no-op.
 */
export function buildCanvasEditClientTools(host: CanvasEditHost): CanvasEditClientTool[] {
    /** Shared apply-if-changed wrapper for transform tools. */
    const applyTransform = (
        transform: (canvas: FormCanvasModel) => FormCanvasModel,
        describe: (before: FormCanvasModel, after: FormCanvasModel) => CanvasEditToolResult,
    ): CanvasEditToolResult => {
        const canvas = host.GetCanvas();
        if (!canvas) return noCanvas();
        const next = transform(canvas);
        const result = describe(canvas, next);
        if (result.Success && next !== canvas) host.ApplyCanvas(next);
        return result;
    };

    const tools: CanvasEditClientTool[] = [
        {
            Name: 'AddField',
            Description: 'Add an entity field to the form. Appends a new field element to the given section (or the first section when sectionId is omitted). 🔒 Edits the canvas definition only — does not save.',
            ParameterSchema: {
                type: 'object',
                properties: {
                    fieldName: { type: 'string', description: 'The entity field name to add (must exist on the bound entity schema).' },
                    sectionId: { type: 'string', description: 'Optional target section id. Defaults to the first section.' },
                },
                required: ['fieldName'],
            },
            Handler: async (params) => {
                const fieldName = asString(params['fieldName']);
                if (!fieldName) return { Success: false, ErrorMessage: 'fieldName is required.' };
                const canvas = host.GetCanvas();
                if (!canvas) return noCanvas();
                const sectionId = asString(params['sectionId']) ?? canvas.sections[0]?.id ?? null;
                if (!sectionId) return { Success: false, ErrorMessage: 'Form has no section to add the field to.' };
                if (!findSection(canvas, sectionId)) {
                    return { Success: false, ErrorMessage: `No section '${sectionId}' on the form.` };
                }
                const newId = host.NewElementId();
                host.ApplyCanvas(addFieldToCanvas(canvas, sectionId, fieldName, newId));
                return { Success: true, Data: { elementId: newId, fieldName, sectionId } };
            },
        },
        {
            Name: 'RemoveField',
            Description: 'Remove a field element from the form by its element id. 🔒 Reversible canvas edit — does not save.',
            ParameterSchema: {
                type: 'object',
                properties: { elementId: { type: 'string', description: 'The canvas element id to remove.' } },
                required: ['elementId'],
            },
            Handler: async (params) => {
                const elementId = asString(params['elementId']);
                if (!elementId) return { Success: false, ErrorMessage: 'elementId is required.' };
                return applyTransform(
                    c => removeElementFromCanvas(c, elementId),
                    (before) => findElement(before, elementId)
                        ? { Success: true, Data: { elementId } }
                        : { Success: false, ErrorMessage: `No element '${elementId}' on the form.` },
                );
            },
        },
        {
            Name: 'SetFieldLabel',
            Description: 'Set (or clear) the display label of a field element. Pass an empty/omitted label to revert to the schema default. 🔒 Reversible canvas edit — does not save.',
            ParameterSchema: {
                type: 'object',
                properties: {
                    elementId: { type: 'string', description: 'The canvas element id to relabel.' },
                    label: { type: 'string', description: 'New label text. Omit or empty to clear the override.' },
                },
                required: ['elementId'],
            },
            Handler: async (params) => {
                const elementId = asString(params['elementId']);
                if (!elementId) return { Success: false, ErrorMessage: 'elementId is required.' };
                const label = asString(params['label']);
                return applyTransform(
                    c => updateElementInCanvas(c, elementId, { label: label && label.trim() ? label : undefined }),
                    (before) => findElement(before, elementId)
                        ? { Success: true, Data: { elementId, label: label ?? null } }
                        : { Success: false, ErrorMessage: `No element '${elementId}' on the form.` },
                );
            },
        },
        {
            Name: 'ToggleFieldRequired',
            Description: 'Toggle (or explicitly set) whether a field is required. Pass `required` to set it directly, or omit it to flip the current value. 🔒 Reversible canvas edit — does not save.',
            ParameterSchema: {
                type: 'object',
                properties: {
                    elementId: { type: 'string', description: 'The canvas element id.' },
                    required: { type: 'boolean', description: 'Optional explicit value. Omit to toggle.' },
                },
                required: ['elementId'],
            },
            Handler: async (params) => {
                const elementId = asString(params['elementId']);
                if (!elementId) return { Success: false, ErrorMessage: 'elementId is required.' };
                const canvas = host.GetCanvas();
                if (!canvas) return noCanvas();
                const el = findElement(canvas, elementId);
                if (!el) return { Success: false, ErrorMessage: `No element '${elementId}' on the form.` };
                const explicit = params['required'];
                const nextRequired = typeof explicit === 'boolean' ? explicit : !(el.required ?? false);
                host.ApplyCanvas(updateElementInCanvas(canvas, elementId, { required: nextRequired }));
                return { Success: true, Data: { elementId, required: nextRequired } };
            },
        },
        {
            Name: 'SetFieldSpan',
            Description: 'Set a field element\'s grid span — 1 = half width, 2 (or more) = full width. 🔒 Reversible canvas edit — does not save.',
            ParameterSchema: {
                type: 'object',
                properties: {
                    elementId: { type: 'string', description: 'The canvas element id.' },
                    span: { type: 'number', description: 'Requested span. 1 = half width, >=2 = full width.' },
                },
                required: ['elementId', 'span'],
            },
            Handler: async (params) => {
                const elementId = asString(params['elementId']);
                if (!elementId) return { Success: false, ErrorMessage: 'elementId is required.' };
                const rawSpan = asNumber(params['span']);
                if (rawSpan == null) return { Success: false, ErrorMessage: 'span must be a number.' };
                const span = normalizeSpan(rawSpan);
                return applyTransform(
                    c => updateElementInCanvas(c, elementId, { span }),
                    (before) => findElement(before, elementId)
                        ? { Success: true, Data: { elementId, span } }
                        : { Success: false, ErrorMessage: `No element '${elementId}' on the form.` },
                );
            },
        },
        {
            Name: 'ReorderFields',
            Description: 'Reorder the elements within a section. `fieldIds` must be a permutation of the section\'s current element ids. 🔒 Reversible canvas edit — does not save.',
            ParameterSchema: {
                type: 'object',
                properties: {
                    sectionId: { type: 'string', description: 'The section whose elements to reorder.' },
                    fieldIds: { type: 'array', items: { type: 'string' }, description: 'Element ids in the desired order (a permutation of the section\'s current ids).' },
                },
                required: ['sectionId', 'fieldIds'],
            },
            Handler: async (params) => {
                const sectionId = asString(params['sectionId']);
                const fieldIds = asStringArray(params['fieldIds']);
                if (!sectionId) return { Success: false, ErrorMessage: 'sectionId is required.' };
                if (!fieldIds) return { Success: false, ErrorMessage: 'fieldIds must be an array of element ids.' };
                const canvas = host.GetCanvas();
                if (!canvas) return noCanvas();
                const section = findSection(canvas, sectionId);
                if (!section) return { Success: false, ErrorMessage: `No section '${sectionId}' on the form.` };
                const next = reorderSectionElements(canvas, sectionId, fieldIds);
                if (next === canvas) {
                    return { Success: false, ErrorMessage: 'fieldIds must be exactly a permutation of the section\'s current element ids.' };
                }
                host.ApplyCanvas(next);
                return { Success: true, Data: { sectionId, order: fieldIds } };
            },
        },
        {
            Name: 'AddSection',
            Description: 'Add a new (empty) section to the form, optionally at a specific index. 🔒 Reversible canvas edit — does not save.',
            ParameterSchema: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: 'Optional section title. Defaults to "Untitled Section".' },
                    index: { type: 'number', description: 'Optional 0-based insert position. Omit to append.' },
                },
                required: [],
            },
            Handler: async (params) => {
                const canvas = host.GetCanvas();
                if (!canvas) return noCanvas();
                const title = asString(params['title']);
                const index = asNumber(params['index']);
                const newId = host.NewSectionId();
                host.ApplyCanvas(addSectionToCanvas(canvas, newId, title ?? undefined, index ?? undefined));
                return { Success: true, Data: { sectionId: newId, title: title ?? 'Untitled Section' } };
            },
        },
        {
            Name: 'RemoveSection',
            Description: 'Remove a section (and its elements) from the form by section id. 🔒 Reversible canvas edit — does not save.',
            ParameterSchema: {
                type: 'object',
                properties: { sectionId: { type: 'string', description: 'The section id to remove.' } },
                required: ['sectionId'],
            },
            Handler: async (params) => {
                const sectionId = asString(params['sectionId']);
                if (!sectionId) return { Success: false, ErrorMessage: 'sectionId is required.' };
                return applyTransform(
                    c => removeSectionFromCanvas(c, sectionId),
                    (before) => findSection(before, sectionId)
                        ? { Success: true, Data: { sectionId } }
                        : { Success: false, ErrorMessage: `No section '${sectionId}' on the form.` },
                );
            },
        },
        {
            Name: 'SetSectionTitle',
            Description: 'Set the title (heading) of a section. 🔒 Reversible canvas edit — does not save.',
            ParameterSchema: {
                type: 'object',
                properties: {
                    sectionId: { type: 'string', description: 'The section id.' },
                    title: { type: 'string', description: 'New section title.' },
                },
                required: ['sectionId', 'title'],
            },
            Handler: async (params) => {
                const sectionId = asString(params['sectionId']);
                const title = asString(params['title']);
                if (!sectionId) return { Success: false, ErrorMessage: 'sectionId is required.' };
                if (title == null) return { Success: false, ErrorMessage: 'title is required.' };
                return applyTransform(
                    c => updateSectionInCanvas(c, sectionId, { title }),
                    (before) => findSection(before, sectionId)
                        ? { Success: true, Data: { sectionId, title } }
                        : { Success: false, ErrorMessage: `No section '${sectionId}' on the form.` },
                );
            },
        },
        {
            Name: 'SetFieldType',
            Description: 'Change an element\'s type — one of: field, static-text, spacer, computed. Targets the element by id OR by its label/field name. 🔒 Reversible canvas edit — does not save.',
            ParameterSchema: {
                type: 'object',
                properties: {
                    field: { type: 'string', description: 'The element id, label, or field name.' },
                    elementType: { type: 'string', description: 'New element type: field | static-text | spacer | computed.' },
                },
                required: ['field', 'elementType'],
            },
            Handler: async (params) => {
                const ref = asString(params['field']);
                if (!ref) return { Success: false, ErrorMessage: 'field is required.' };
                const canvas = host.GetCanvas();
                if (!canvas) return noCanvas();
                const el = resolveElement(canvas, ref);
                if (!el) return elementNotFound(canvas, ref);
                const rawType = asString(params['elementType']);
                const type = rawType ? normalizeElementType(rawType) : null;
                if (!type) {
                    return { Success: false, ErrorMessage: `elementType must be one of: ${CANVAS_ELEMENT_TYPES.join(', ')}.` };
                }
                host.ApplyCanvas(updateElementInCanvas(canvas, el.id, { type }));
                return { Success: true, Data: { elementId: el.id, type } };
            },
        },
        {
            Name: 'SetFieldHelpText',
            Description: 'Set (or clear) the helper text rendered under a field. Pass an empty/omitted text to clear it. Targets the element by id OR label/field name. 🔒 Reversible canvas edit — does not save.',
            ParameterSchema: {
                type: 'object',
                properties: {
                    field: { type: 'string', description: 'The element id, label, or field name.' },
                    helpText: { type: 'string', description: 'Helper text. Omit or empty to clear.' },
                },
                required: ['field'],
            },
            Handler: async (params) => {
                const ref = asString(params['field']);
                if (!ref) return { Success: false, ErrorMessage: 'field is required.' };
                const canvas = host.GetCanvas();
                if (!canvas) return noCanvas();
                const el = resolveElement(canvas, ref);
                if (!el) return elementNotFound(canvas, ref);
                const helpText = asString(params['helpText']);
                const helper = helpText && helpText.trim() ? helpText : undefined;
                host.ApplyCanvas(updateElementInCanvas(canvas, el.id, { helper }));
                return { Success: true, Data: { elementId: el.id, helper: helper ?? null } };
            },
        },
        {
            Name: 'MoveFieldToSection',
            Description: 'Move an element into another section (appended, or at an optional 0-based index). Targets both by id OR label/title. 🔒 Reversible canvas edit — does not save.',
            ParameterSchema: {
                type: 'object',
                properties: {
                    field: { type: 'string', description: 'The element id, label, or field name to move.' },
                    section: { type: 'string', description: 'The destination section id or title.' },
                    index: { type: 'number', description: 'Optional 0-based position within the destination. Omit to append.' },
                },
                required: ['field', 'section'],
            },
            Handler: async (params) => {
                const fieldRef = asString(params['field']);
                const sectionRef = asString(params['section']);
                if (!fieldRef) return { Success: false, ErrorMessage: 'field is required.' };
                if (!sectionRef) return { Success: false, ErrorMessage: 'section is required.' };
                const canvas = host.GetCanvas();
                if (!canvas) return noCanvas();
                const el = resolveElement(canvas, fieldRef);
                if (!el) return elementNotFound(canvas, fieldRef);
                const section = resolveSection(canvas, sectionRef);
                if (!section) return sectionNotFound(canvas, sectionRef);
                const index = asNumber(params['index']);
                host.ApplyCanvas(moveElementToSection(canvas, el.id, section.id, index ?? undefined));
                return { Success: true, Data: { elementId: el.id, sectionId: section.id, index: index ?? null } };
            },
        },
        {
            Name: 'DuplicateField',
            Description: 'Duplicate an element in place (the copy is inserted right after the original in the same section). Targets by id OR label/field name. 🔒 Reversible canvas edit — does not save.',
            ParameterSchema: {
                type: 'object',
                properties: {
                    field: { type: 'string', description: 'The element id, label, or field name to duplicate.' },
                },
                required: ['field'],
            },
            Handler: async (params) => {
                const ref = asString(params['field']);
                if (!ref) return { Success: false, ErrorMessage: 'field is required.' };
                const canvas = host.GetCanvas();
                if (!canvas) return noCanvas();
                const el = resolveElement(canvas, ref);
                if (!el) return elementNotFound(canvas, ref);
                const newId = host.NewElementId();
                host.ApplyCanvas(duplicateElementInCanvas(canvas, el.id, newId));
                return { Success: true, Data: { sourceElementId: el.id, newElementId: newId } };
            },
        },
        {
            Name: 'SetSectionCollapsible',
            Description: 'Set whether a section is collapsible. Targets the section by id OR title. 🔒 Reversible canvas edit — does not save.',
            ParameterSchema: {
                type: 'object',
                properties: {
                    section: { type: 'string', description: 'The section id or title.' },
                    collapsible: { type: 'boolean', description: 'Optional explicit value. Omit to toggle.' },
                },
                required: ['section'],
            },
            Handler: async (params) => {
                const ref = asString(params['section']);
                if (!ref) return { Success: false, ErrorMessage: 'section is required.' };
                const canvas = host.GetCanvas();
                if (!canvas) return noCanvas();
                const section = resolveSection(canvas, ref);
                if (!section) return sectionNotFound(canvas, ref);
                const explicit = params['collapsible'];
                const collapsible = typeof explicit === 'boolean' ? explicit : !section.collapsible;
                host.ApplyCanvas(updateSectionInCanvas(canvas, section.id, { collapsible }));
                return { Success: true, Data: { sectionId: section.id, collapsible } };
            },
        },
        {
            Name: 'SetSectionColumns',
            Description: 'Set a section\'s column layout — 1 (single column) or 2 (two columns). Targets by id OR title. 🔒 Reversible canvas edit — does not save.',
            ParameterSchema: {
                type: 'object',
                properties: {
                    section: { type: 'string', description: 'The section id or title.' },
                    columns: { type: 'number', description: '1 or 2.' },
                },
                required: ['section', 'columns'],
            },
            Handler: async (params) => {
                const ref = asString(params['section']);
                if (!ref) return { Success: false, ErrorMessage: 'section is required.' };
                const canvas = host.GetCanvas();
                if (!canvas) return noCanvas();
                const section = resolveSection(canvas, ref);
                if (!section) return sectionNotFound(canvas, ref);
                const rawCols = asNumber(params['columns']);
                if (rawCols == null) return { Success: false, ErrorMessage: 'columns must be a number (1 or 2).' };
                const columns: 1 | 2 = rawCols >= 2 ? 2 : 1;
                host.ApplyCanvas(updateSectionInCanvas(canvas, section.id, { columns }));
                return { Success: true, Data: { sectionId: section.id, columns } };
            },
        },
        {
            Name: 'SetSectionOrder',
            Description: 'Move a section to a new 0-based position among the sections (0 = first). Targets by id OR title. 🔒 Reversible canvas edit — does not save.',
            ParameterSchema: {
                type: 'object',
                properties: {
                    section: { type: 'string', description: 'The section id or title to move.' },
                    index: { type: 'number', description: '0-based destination position.' },
                },
                required: ['section', 'index'],
            },
            Handler: async (params) => {
                const ref = asString(params['section']);
                if (!ref) return { Success: false, ErrorMessage: 'section is required.' };
                const index = asNumber(params['index']);
                if (index == null) return { Success: false, ErrorMessage: 'index must be a number.' };
                const canvas = host.GetCanvas();
                if (!canvas) return noCanvas();
                const section = resolveSection(canvas, ref);
                if (!section) return sectionNotFound(canvas, ref);
                host.ApplyCanvas(moveSectionToIndex(canvas, section.id, index));
                return { Success: true, Data: { sectionId: section.id, index } };
            },
        },
    ];

    // Center-pane / preview navigation tools — only wired when the host
    // exposes the corresponding action (Form Builder does; Component Studio
    // omits them because it navigates via its tab system).
    if (host.PreviewForm) {
        const preview = host.PreviewForm.bind(host);
        tools.push({
            Name: 'PreviewForm',
            Description: 'Switch the center pane to the live preview, optionally bound to a specific record id. 🔒 View-only navigation — no edit.',
            ParameterSchema: {
                type: 'object',
                properties: { recordId: { type: 'string', description: 'Optional record id to preview. Omit to preview the default record.' } },
                required: [],
            },
            Handler: async (params) => {
                preview(asString(params['recordId']) ?? undefined);
                return { Success: true };
            },
        });
    }
    if (host.ViewFormCode) {
        const viewCode = host.ViewFormCode.bind(host);
        tools.push({
            Name: 'ViewFormCode',
            Description: 'Switch the center pane to the generated form code. 🔒 View-only navigation — no edit.',
            ParameterSchema: { type: 'object', properties: {}, required: [] },
            Handler: async () => { viewCode(); return { Success: true }; },
        });
    }
    if (host.ViewFormLayout) {
        const viewLayout = host.ViewFormLayout.bind(host);
        tools.push({
            Name: 'ViewFormLayout',
            Description: 'Switch the center pane to the drag-drop layout/canvas view. 🔒 View-only navigation — no edit.',
            ParameterSchema: { type: 'object', properties: {}, required: [] },
            Handler: async () => { viewLayout(); return { Success: true }; },
        });
    }

    return tools;
}

// ──────────────────────────────────────────────────────────────────────────
// Param coercion helpers (typed, no `any`)
// ──────────────────────────────────────────────────────────────────────────

function asString(v: unknown): string | null {
    return typeof v === 'string' ? v : null;
}

function asNumber(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
}

function asStringArray(v: unknown): string[] | null {
    if (!Array.isArray(v)) return null;
    if (!v.every(x => typeof x === 'string')) return null;
    return v as string[];
}
