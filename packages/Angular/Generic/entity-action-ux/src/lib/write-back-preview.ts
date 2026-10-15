/**
 * @fileoverview Pure model of a write-back run's dry-run preview. A write-back work type (Infer, Action, Agent)
 * persists `{ output, writeBack }` on each `MJ: Process Run Details.ResultPayload`. On a dry run the engine puts the
 * real write's own decision in `writeBack`: the fields it would change, what it would do with each child row, and
 * the tags it would link. This turns that into the change rows the runner dialog shows, and decides nothing itself.
 * Angular-free so it is unit-testable without a component.
 * @module @memberjunction/ng-entity-action-ux
 */
import { UUIDsEqual } from '@memberjunction/global';
import type { TagWriteBackPreview, WriteBackChildAction, WriteBackChildChange, WriteBackResult } from '@memberjunction/record-set-processor-base';
import { DisplayValue } from './scope';

/** One change the preview shows: a field's old and new value, or a row or tag the write adds, updates or removes. */
export interface PreviewChange {
    /** The field name, or the label of the row or tag the write adds, updates or removes. */
    Field: string;
    /** The field's current value (`unknown`: whatever the entity field holds); absent for a row or tag. */
    OldValue: unknown;
    /** The value the write stores (`unknown`: whatever the entity field holds), or for a row or tag its shown description. */
    NewValue: unknown;
    /** False when the engine does not apply the change (a FieldRules change it computed but would not write). */
    Applied: boolean;
    /** True when the change differs from the current value. */
    Changed: boolean;
    /** What the change would fail on. */
    Error?: string;
    /** True for a row or tag the write adds, updates or removes: it has no old value to show. */
    IsAddition?: boolean;
    /**
     * The name to show for {@link OldValue}: the display name of the record a foreign-key value points at, as the
     * engine's dry run read it. Absent when it read none; the value is shown as it is.
     */
    OldValueName?: string;
    /** The name to show for {@link NewValue}, as for {@link OldValueName}; for a child row, its values with each foreign key named. */
    NewValueName?: string;
}

/** What a record's write-back preview adds to the dialog's rows. */
export interface WriteBackPreviewRows {
    /** The changes the real write would make; none when the real write would fail. */
    Changes: PreviewChange[];
    /** What the real write would fail on. */
    Errors: string[];
    /**
     * Outputs the answer withheld below their confidence floor, one line each. Not changes: a withheld field the
     * pipeline wrote earlier is cleared, and that clear is already one of {@link Changes}; the line says why.
     */
    Withheld: string[];
}

/** The label a field is shown with: its display name in metadata. `entityName` is the field's entity (a child entity's name for a child row). */
export type WriteBackFieldLabel = (entityName: string, field: string) => string;

/** Builds the dialog rows for a write-back run's preview. */
export class WriteBackPreviewModel {
    /**
     * The changes and errors one record's preview shows. A record whose real write would fail (`PreviewErrors`) has no
     * changes: the real write rolls them back.
     * @param recordID - the processed record's ID
     * @param writeBack - the dry run's write-back preview
     * @param fieldLabel - the label a child row's field is shown with (its display name); the field name by default
     */
    public static Build(recordID: string, writeBack: WriteBackResult, fieldLabel: WriteBackFieldLabel = (_entity, field) => field): WriteBackPreviewRows {
        const errors = writeBack.PreviewErrors || [];
        if (errors.length > 0) {
            return { Changes: [], Errors: [...errors], Withheld: [] };
        }
        const changes: PreviewChange[] = [
            ...(writeBack.previewFieldChanges || []).map((c): PreviewChange => ({
                Field: c.Field, OldValue: c.OldValue, NewValue: c.NewValue, Applied: true, Changed: true,
                ...(c.OldValueName ? { OldValueName: c.OldValueName } : {}),
                ...(c.NewValueName ? { NewValueName: c.NewValueName } : {}),
            })),
            ...(writeBack.previewChildChanges || []).flatMap((c) => WriteBackPreviewModel.childChange(recordID, c, fieldLabel)),
            ...(writeBack.previewTags || []).flatMap((t) => WriteBackPreviewModel.tagChange(t)),
        ];
        return { Changes: changes, Errors: [], Withheld: WriteBackPreviewModel.WithheldLines(writeBack) };
    }

    /**
     * One line per withheld output: a field (kept when its column does not allow null, else cleared only where the
     * pipeline owns the value, which {@link Build}'s changes already show) or a child mapping (its rows stay as they are).
     */
    public static WithheldLines(writeBack: WriteBackResult): string[] {
        const kept = new Set((writeBack.withheldKeptFields || []).map((f) => f.toLowerCase()));
        const fields = (writeBack.withheldFields || []).map((f) => kept.has(f.toLowerCase())
            ? `${f}: withheld (below confidence); kept, the column does not allow null`
            : `${f}: withheld (below confidence)`);
        const children = (writeBack.withheldChildEntities || []).map((e) => `${e}: withheld (below confidence); rows unchanged`);
        return [...fields, ...children];
    }

    /**
     * A child row's change; a row the write leaves as it is has none. The link back to the processed record is left
     * out: the row already names that record. Its values are shown by field label, each foreign key by the name the
     * engine read (`ValueNames`); the field names and IDs are kept in `NewValue` for the hover text.
     */
    private static childChange(recordID: string, child: WriteBackChildChange, fieldLabel: WriteBackFieldLabel): PreviewChange[] {
        const labels: Partial<Record<WriteBackChildAction, string>> = { insert: 'New', update: 'Update', delete: 'Remove' };
        const label = labels[child.Action];
        if (!label) {
            return [];
        }
        const values = Object.entries(child.Values).filter(([, value]) => !(typeof value === 'string' && UUIDsEqual(value, recordID)));
        const names = child.ValueNames || {};
        const shown = values.map(([field, value]) => `${field}: ${DisplayValue(value)}`).join('; ');
        const named = values.map(([field, value]) => `${fieldLabel(child.Entity, field)}: ${names[field] || DisplayValue(value)}`).join('; ');
        return [{
            Field: `${label} ${child.Entity}`, OldValue: undefined, NewValue: shown, Applied: true, Changed: true, IsAddition: true,
            ...(named !== shown ? { NewValueName: named } : {}),
        }];
    }

    /**
     * A tag's change: a link to a matched tag the record does not carry yet, a link saved again at the write's weight
     * (`reweighted`), or a tag the write creates. A link that already holds the write's weight, and a tag constrained
     * growth cannot place, change nothing.
     */
    private static tagChange(tag: TagWriteBackPreview): PreviewChange[] {
        const name = tag.matched ? tag.resolvedTagName || tag.tagText : `${tag.tagText} (new tag)`;
        if (tag.matched && !tag.alreadyLinked) {
            return [WriteBackPreviewModel.tagRow('Tag', name)];
        }
        if (tag.matched && tag.reweighted) {
            return [WriteBackPreviewModel.tagRow('Reweight tag', name)];
        }
        return tag.created ? [WriteBackPreviewModel.tagRow('Tag', name)] : [];
    }

    private static tagRow(label: string, name: string): PreviewChange {
        return { Field: label, OldValue: undefined, NewValue: name, Applied: true, Changed: true, IsAddition: true };
    }
}
