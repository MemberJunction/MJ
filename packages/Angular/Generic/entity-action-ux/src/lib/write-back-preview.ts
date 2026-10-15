/**
 * @fileoverview Pure model of a write-back run's dry-run preview. A write-back work type (Infer, Action, Agent)
 * persists `{ output, writeBack }` on each `MJ: Process Run Details.ResultPayload`. On a dry run `writeBack` holds the
 * values the write would store (fields, child rows, tags); this turns them into the rows the runner dialog shows.
 * Angular-free so it is unit-testable without a component.
 * @module @memberjunction/ng-entity-action-ux
 */
import { UUIDsEqual } from '@memberjunction/global';
import type { TagWriteBackPreview, WriteBackResult } from '@memberjunction/record-set-processor-base';
import { DisplayValue } from './scope';

/** One change the preview shows: a field's old and new value, or a value, row or tag the write stores. */
export interface PreviewChange {
    /** The field name, or the label of the row or tag the write stores. */
    Field: string;
    /** The field's current value (`unknown`: whatever the entity field holds); absent for a value, row or tag. */
    OldValue: unknown;
    /** The value the write stores (`unknown`: whatever the entity field holds), or a row's or tag's shown description. */
    NewValue: unknown;
    /** False when the engine does not apply the change (a FieldRules change it computed but would not write). */
    Applied: boolean;
    /** True when the change differs from the current value. */
    Changed: boolean;
    /** What the change would fail on. */
    Error?: string;
    /** True for a value, row or tag the write stores: it has no old value to show. */
    IsAddition?: boolean;
}

/** What a record's write-back preview adds to the dialog's rows. */
export interface WriteBackPreviewRows {
    /** The values the real write would store; none when the real write would fail. */
    Changes: PreviewChange[];
    /** What the real write would fail on. */
    Errors: string[];
    /** Outputs the answer withheld below their confidence floor, one line each. */
    Withheld: string[];
}

/** Builds the dialog rows for a write-back run's preview. */
export class WriteBackPreviewModel {
    /**
     * The changes and errors one record's preview shows. A record whose real write would fail (`PreviewErrors`) has no
     * changes: the real write rolls them back.
     * @param recordID - the processed record's ID
     * @param writeBack - the dry run's write-back preview
     */
    public static Build(recordID: string, writeBack: WriteBackResult): WriteBackPreviewRows {
        const errors = writeBack.PreviewErrors || [];
        if (errors.length > 0) {
            return { Changes: [], Errors: [...errors], Withheld: [] };
        }
        const changes: PreviewChange[] = [
            ...Object.entries(writeBack.previewFields || {}).map(([field, value]) => WriteBackPreviewModel.addition(field, value)),
            ...(writeBack.previewChildren || []).map((values) => WriteBackPreviewModel.childChange(recordID, values)),
            ...(writeBack.previewTags || []).flatMap((t) => WriteBackPreviewModel.tagChange(t)),
        ];
        return { Changes: changes, Errors: [], Withheld: WriteBackPreviewModel.WithheldLines(writeBack) };
    }

    /** One line per withheld output: a field (kept when its column does not allow null) or a child mapping (rows unchanged). */
    public static WithheldLines(writeBack: WriteBackResult): string[] {
        const kept = new Set((writeBack.withheldKeptFields || []).map((f) => f.toLowerCase()));
        const fields = (writeBack.withheldFields || []).map((f) => kept.has(f.toLowerCase())
            ? `${f}: withheld (below confidence); kept, the column does not allow null`
            : `${f}: withheld (below confidence)`);
        const children = (writeBack.withheldChildEntities || []).map((e) => `${e}: withheld (below confidence); rows unchanged`);
        return [...fields, ...children];
    }

    /** A child row the write stores, its values shown without the link back to the processed record. */
    private static childChange(recordID: string, values: Record<string, unknown>): PreviewChange {
        const shown = Object.entries(values)
            .filter(([, value]) => !(typeof value === 'string' && UUIDsEqual(value, recordID)))
            .map(([field, value]) => `${field}: ${DisplayValue(value)}`).join('; ');
        return WriteBackPreviewModel.addition('Child row', shown);
    }

    /** A tag's change: a matched tag is linked, an auto-grow tag created; a tag constrained growth cannot place changes nothing. */
    private static tagChange(tag: TagWriteBackPreview): PreviewChange[] {
        if (tag.matched) {
            return [WriteBackPreviewModel.addition('Tag', tag.resolvedTagName || tag.tagText)];
        }
        return tag.created ? [WriteBackPreviewModel.addition('Tag', `${tag.tagText} (new tag)`)] : [];
    }

    private static addition(label: string, value: unknown): PreviewChange {
        return { Field: label, OldValue: undefined, NewValue: value, Applied: true, Changed: true, IsAddition: true };
    }
}
