import { Injectable } from '@angular/core';
import type { FormCompositionSnapshot } from './form-composition-snapshot';

/** What names one open form: its entity and its record. The compact agent context is one. */
export interface FormRecordRef {
    Entity: string;
    /** The record as `CompositeKey.ToURLSegment()`; null or blank for a record not saved yet. */
    RecordPrimaryKey: string | null;
}

/**
 * The full composition of each form open in this browser, by entity and record.
 *
 * Each record form container publishes its latest snapshot here and removes it when the form goes
 * away. In-browser consumers that need the whole snapshot, such as the apply flow, look it up by
 * the entity and record the compact agent context names. Agent prompts get only that compact
 * context, so the snapshot's fields and rail never reach them.
 */
@Injectable({ providedIn: 'root' })
export class FormCompositionRegistry {
    private readonly entries = new Map<object, { Snapshot: FormCompositionSnapshot; Sequence: number }>();
    private sequence = 0;

    /** Records the latest snapshot a form published. One entry per owner, so a newer one replaces it. */
    public Publish(owner: object, snapshot: FormCompositionSnapshot): void {
        this.entries.set(owner, { Snapshot: snapshot, Sequence: ++this.sequence });
    }

    /** Forgets the snapshot an owner published. */
    public Remove(owner: object): void {
        this.entries.delete(owner);
    }

    /**
     * The latest snapshot published for this entity and record, or null. The entity name is
     * matched trimmed and case-insensitively; the record key exactly, with null and blank alike.
     */
    public Get(entityName: string | null | undefined, recordPrimaryKey: string | null | undefined): FormCompositionSnapshot | null {
        const entity = normalizeEntity(entityName);
        if (!entity) return null;
        const record = (recordPrimaryKey ?? '').trim();
        let latest: { Snapshot: FormCompositionSnapshot; Sequence: number } | null = null;
        for (const entry of this.entries.values()) {
            if (normalizeEntity(entry.Snapshot.Entity) !== entity) continue;
            if ((entry.Snapshot.RecordPrimaryKey ?? '').trim() !== record) continue;
            if (!latest || entry.Sequence > latest.Sequence) latest = entry;
        }
        return latest?.Snapshot ?? null;
    }

    /** The snapshot a reference names, or null when there is no reference or no such form is open. */
    public Find(ref: FormRecordRef | null | undefined): FormCompositionSnapshot | null {
        return ref ? this.Get(ref.Entity, ref.RecordPrimaryKey) : null;
    }
}

function normalizeEntity(name: string | null | undefined): string {
    return (name ?? '').trim().toLowerCase();
}
