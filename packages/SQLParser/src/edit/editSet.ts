import type { Span } from '../common/analysis.js';

/** What an edit targets: any node (it has a `Span`) or a span of the text. */
export type EditTarget = { readonly Span: Span } | Span;

/** The kinds of text edit. A removal is a replacement with empty text. */
export type TextEditKind = 'Replace' | 'InsertBefore' | 'InsertAfter';

/** One edit: replace a span, or insert text at a point (an empty span). */
export interface TextEdit {
    readonly Kind: TextEditKind;
    /** The replaced span; for an insertion, an empty span at the insertion point. */
    readonly Span: Span;
    readonly Text: string;
    /** The order the edit was added in; insertions at one point keep it. */
    readonly Order: number;
}

/** Thrown when an edit overlaps one already in the set, or a span lies outside the text. */
export class EditConflictError extends Error {
    /** The edit being added. */
    readonly Incoming: TextEdit;
    /** The edit it conflicts with; `null` when the span is outside the text. */
    readonly Existing: TextEdit | null;

    constructor(message: string, incoming: TextEdit, existing: TextEdit | null) {
        super(message);
        this.name = 'EditConflictError';
        this.Incoming = incoming;
        this.Existing = existing;
    }
}

/** The result of applying an edit set: the new text and a map from old offsets to new ones. */
export interface AppliedEdits {
    readonly Text: string;
    readonly SpanMap: SpanMap;
}

/** How an offset on an insertion point maps: `Start` lands after text inserted there, `End` before it. */
export type OffsetBias = 'Start' | 'End';

/** Maps offsets and spans of the original text to the edited text. */
export class SpanMap {
    constructor(private readonly edits: readonly TextEdit[]) {}

    /**
     * The offset in the edited text of `offset` in the original; `null` when it lies strictly
     * inside a replaced span.
     */
    MapOffset(offset: number, bias: OffsetBias = 'Start'): number | null {
        let delta = 0;
        for (const edit of this.edits) {
            const { Start, End } = edit.Span;
            if (Start === End) {
                if (Start < offset || (Start === offset && bias === 'Start')) delta += edit.Text.length;
            } else if (End <= offset) {
                delta += edit.Text.length - (End - Start);
            } else if (Start < offset) {
                return null;
            }
        }
        return offset + delta;
    }

    /** The span in the edited text of a span of the original; `null` when either end lies inside a replaced span. */
    MapSpan(span: Span): Span | null {
        const start = this.MapOffset(span.Start, 'Start');
        const end = this.MapOffset(span.End, 'End');
        if (start === null || end === null) return null;
        return { Start: start, End: Math.max(start, end) };
    }
}

/**
 * A set of edits to one text, kept as a value: every method returns a new set and leaves this
 * one unchanged. Edits are made by node or span against the original text; overlapping edits
 * are refused with an {@link EditConflictError}. {@link Apply} applies them back to front, so
 * each edit's offsets stay those of the original text.
 */
export class EditSet {
    private constructor(private readonly source: string, private readonly edits: readonly TextEdit[]) {}

    /** An empty edit set over `text`. */
    static For(text: string): EditSet {
        return new EditSet(text, Object.freeze([]));
    }

    /** The text the edits apply to. */
    get Source(): string {
        return this.source;
    }

    /** The edits, in the order they were added. */
    get Edits(): readonly TextEdit[] {
        return this.edits;
    }

    /** Whether the set has no edits. */
    get IsEmpty(): boolean {
        return this.edits.length === 0;
    }

    /** Replaces the node's or span's text. */
    Replace(target: EditTarget, text: string): EditSet {
        const span = spanOf(target);
        return this.add({ Kind: 'Replace', Span: span, Text: text, Order: this.edits.length });
    }

    /** Removes the node's or span's text. */
    Remove(target: EditTarget): EditSet {
        return this.Replace(target, '');
    }

    /** Inserts text just before the node or span. */
    InsertBefore(target: EditTarget, text: string): EditSet {
        const at = spanOf(target).Start;
        return this.add({ Kind: 'InsertBefore', Span: { Start: at, End: at }, Text: text, Order: this.edits.length });
    }

    /** Inserts text just after the node or span. */
    InsertAfter(target: EditTarget, text: string): EditSet {
        const at = spanOf(target).End;
        return this.add({ Kind: 'InsertAfter', Span: { Start: at, End: at }, Text: text, Order: this.edits.length });
    }

    /**
     * Replaces each of `targets` with `text`, checking all of them against each other and the
     * existing edits in one sorted pass, so a large batch (every reference to a renamed name)
     * costs O(n log n) rather than O(n²).
     */
    ReplaceAll(targets: readonly EditTarget[], text: string): EditSet {
        const incoming = targets.map((target, i): TextEdit => Object.freeze({
            Kind: 'Replace', Span: Object.freeze({ ...spanOf(target) }), Text: text, Order: this.edits.length + i,
        }));
        for (const edit of incoming) this.checkBounds(edit);
        const all = [...this.edits, ...incoming];
        checkSorted([...all].sort(compareEdits));
        return new EditSet(this.source, Object.freeze(all));
    }

    /** This set with every edit of `other` (over the same text) added after its own. */
    Merge(other: EditSet): EditSet {
        if (other.source !== this.source) throw new Error('EditSet.Merge: the edit sets are over different texts.');
        let merged: EditSet = this;
        for (const edit of other.edits) merged = merged.add({ ...edit, Order: merged.edits.length });
        return merged;
    }

    /** Applies the edits, back to front, and returns the new text with a span map. */
    Apply(): AppliedEdits {
        const ordered = [...this.edits].sort(compareEdits);
        const pieces: string[] = [];
        let cursor = this.source.length;
        for (let i = ordered.length - 1; i >= 0; i--) {
            const edit = ordered[i];
            pieces.push(this.source.substring(edit.Span.End, cursor), edit.Text);
            cursor = edit.Span.Start;
        }
        pieces.push(this.source.substring(0, cursor));
        return Object.freeze({ Text: pieces.reverse().join(''), SpanMap: new SpanMap(ordered) });
    }

    private add(edit: TextEdit): EditSet {
        const frozen: TextEdit = Object.freeze({ ...edit, Span: Object.freeze({ ...edit.Span }) });
        this.checkBounds(frozen);
        const conflict = this.edits.find(existing => overlaps(existing, frozen));
        if (conflict !== undefined) throw conflictError(frozen, conflict);
        return new EditSet(this.source, Object.freeze([...this.edits, frozen]));
    }

    private checkBounds(edit: TextEdit): void {
        const { Start, End } = edit.Span;
        if (Start < 0 || End > this.source.length || Start > End) {
            throw new EditConflictError(`Edit span ${Start}-${End} is outside the text (length ${this.source.length}).`, edit, null);
        }
    }
}

function conflictError(incoming: TextEdit, existing: TextEdit): EditConflictError {
    return new EditConflictError(
        `Edit at ${incoming.Span.Start}-${incoming.Span.End} overlaps the edit at ${existing.Span.Start}-${existing.Span.End}; edits must not overlap.`,
        incoming, existing);
}

/**
 * Checks edits sorted by {@link compareEdits} for overlaps in one sweep: a replacement may not start
 * before an earlier replacement ends, and an insertion may not sit strictly inside one.
 */
function checkSorted(sorted: readonly TextEdit[]): void {
    let cover: TextEdit | null = null;
    for (const edit of sorted) {
        const point = edit.Span.Start === edit.Span.End;
        const insideCover = cover !== null && cover.Span.End > edit.Span.Start && (!point || cover.Span.Start < edit.Span.Start);
        if (insideCover && cover !== null) throw conflictError(edit, cover);
        if (!point && (cover === null || edit.Span.End > cover.Span.End)) cover = edit;
    }
}

function spanOf(target: EditTarget): Span {
    return 'Span' in target ? target.Span : target;
}

/** Two replacements overlap when their spans share a character; an insertion conflicts with a replacement strictly around it. */
function overlaps(a: TextEdit, b: TextEdit): boolean {
    const aPoint = a.Span.Start === a.Span.End;
    const bPoint = b.Span.Start === b.Span.End;
    if (aPoint && bPoint) return false;
    if (aPoint) return b.Span.Start < a.Span.Start && a.Span.Start < b.Span.End;
    if (bPoint) return a.Span.Start < b.Span.Start && b.Span.Start < a.Span.End;
    return a.Span.Start < b.Span.End && b.Span.Start < a.Span.End;
}

/** Order of application at one point: text inserted after the previous node, then before the next, then a replacement. */
function rank(edit: TextEdit): number {
    if (edit.Span.Start !== edit.Span.End) return 2;
    return edit.Kind === 'InsertAfter' ? 0 : 1;
}

function compareEdits(a: TextEdit, b: TextEdit): number {
    return a.Span.Start - b.Span.Start || rank(a) - rank(b) || a.Order - b.Order;
}
