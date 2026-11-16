/**
 * The query form saves the query and its declared parameters, fields and entity links as ONE graph
 * save, never inside a transaction group (a graph save refuses to run in one), and only then the
 * permission rows the permissions grid queued, in a group of their own.
 *
 * Class-behaviour spec: the form is created from its prototype (no lifecycle runs) and given a
 * record, a provider and pending rows as plain doubles, so only the save order is under test.
 */
import { describe, it, expect } from 'vitest';
import { MJQueryFormComponentExtended } from './query-form.component';

interface Recorder { events: string[] }

function fakeRecord(rec: Recorder, ok = true) {
    return {
        TransactionGroup: null as FakeGroup | null,
        async Save(): Promise<boolean> {
            rec.events.push(this.TransactionGroup ? 'query saved inside a group' : 'query saved on its own');
            return ok;
        },
    };
}

class FakeGroup {
    constructor(private rec: Recorder) {}
    async Submit(): Promise<boolean> {
        this.rec.events.push('group submitted');
        return true;
    }
}

function pendingRow(rec: Recorder, name: string, action: 'save' | 'delete') {
    const entityObject = {
        TransactionGroup: null as FakeGroup | null,
        async Save(): Promise<boolean> { rec.events.push(`${name} saved ${this.TransactionGroup ? 'in group' : 'alone'}`); return true; },
        async Delete(): Promise<boolean> { rec.events.push(`${name} deleted ${this.TransactionGroup ? 'in group' : 'alone'}`); return true; },
    };
    return { entityObject, action };
}

function form(rec: Recorder, record: ReturnType<typeof fakeRecord>, pending: ReturnType<typeof pendingRow>[]): MJQueryFormComponentExtended {
    const f = Object.create(MJQueryFormComponentExtended.prototype) as MJQueryFormComponentExtended;
    Object.defineProperty(f, 'record', { value: record, writable: true });
    Object.defineProperty(f, 'PendingRecords', { get: () => pending });
    Object.defineProperty(f, 'ProviderToUse', { get: () => ({ CreateTransactionGroup: async () => { rec.events.push('group created'); return new FakeGroup(rec); } }) });
    return f;
}

const save = (f: MJQueryFormComponentExtended): Promise<boolean> => f['InternalSaveRecord']();

describe('MJQueryFormComponentExtended.InternalSaveRecord', () => {
    it('saves the query on its own (a graph save) when nothing else is queued', async () => {
        const rec: Recorder = { events: [] };
        expect(await save(form(rec, fakeRecord(rec), []))).toBe(true);
        expect(rec.events).toEqual(['query saved on its own']);
    });

    it('saves the query first, outside any group, then the queued permission rows in one group', async () => {
        const rec: Recorder = { events: [] };
        const rows = [pendingRow(rec, 'permission A', 'save'), pendingRow(rec, 'permission B', 'delete')];
        expect(await save(form(rec, fakeRecord(rec), rows))).toBe(true);
        expect(rec.events).toEqual(['query saved on its own', 'group created', 'permission A saved in group', 'permission B deleted in group', 'group submitted']);
        expect(rows.every(r => r.entityObject.TransactionGroup === null), 'rows are detached from the submitted group').toBe(true);
    });

    it('writes no permission row when the query save is refused', async () => {
        const rec: Recorder = { events: [] };
        expect(await save(form(rec, fakeRecord(rec, false), [pendingRow(rec, 'permission A', 'save')]))).toBe(false);
        expect(rec.events).toEqual(['query saved on its own']);
    });
});
