/**
 * @fileoverview The runner dialog's rows for a write-back run's dry-run preview (`writeBack` on each
 * `MJ: Process Run Details.ResultPayload`: only what the real write would change).
 * @module @memberjunction/ng-entity-action-ux
 */
import { UUIDsEqual } from '@memberjunction/global';
import type { FeatureValuePreview, TagWriteBackPreview, WriteBackResult } from '@memberjunction/record-set-processor-base';
import { DisplayValue } from './scope';

/** One change the preview shows: a field's old and new value, or a value, row or tag the write stores. */
export interface PreviewChange {
    Field: string;
    /** `unknown`: whatever the entity field holds. */
    OldValue: unknown;
    NewValue: unknown;
    Applied: boolean;
    Changed: boolean;
    Error?: string;
    /** True for a value, row or tag the write stores: it has no old value to show. */
    IsAddition?: boolean;
}

/** What a record's write-back preview adds to the dialog's rows. */
export interface WriteBackPreviewRows {
    Changes: PreviewChange[];
    Errors: string[];
    Withheld: string[];
}

/** Builds the dialog rows for a write-back run's preview. */
export class WriteBackPreviewModel {
    /** The changes and errors one record's preview shows; a record whose real write would fail has no changes. */
    public static Build(recordID: string, writeBack: WriteBackResult): WriteBackPreviewRows {
        const errors = writeBack.PreviewErrors || [];
        if (errors.length > 0) {
            return { Changes: [], Errors: [...errors], Withheld: [] };
        }
        const changes: PreviewChange[] = [
            ...Object.entries(writeBack.previewFields || {}).map(([field, value]) => WriteBackPreviewModel.addition(field, value)),
            ...(writeBack.previewChildren || []).map((values) => WriteBackPreviewModel.childChange(recordID, values)),
            ...(writeBack.previewTags || []).flatMap((t) => WriteBackPreviewModel.tagChange(t)),
            ...(writeBack.previewFeatureValues || []).map(WriteBackPreviewModel.featureValueChange),
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

    /** A feature value an output with no write target would store: its previous value and the proposed one (no previous value is an addition). */
    private static featureValueChange(p: FeatureValuePreview): PreviewChange {
        return {
            Field: `${p.FeatureName} (feature value)`,
            OldValue: p.Previous,
            NewValue: p.Proposed,
            Applied: true,
            Changed: true,
            IsAddition: p.Previous === null || p.Previous === undefined,
        };
    }

    private static addition(label: string, value: unknown): PreviewChange {
        return { Field: label, OldValue: undefined, NewValue: value, Applied: true, Changed: true, IsAddition: true };
    }
}
