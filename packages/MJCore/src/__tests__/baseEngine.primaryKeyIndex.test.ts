import { describe, it, expect } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { BaseEntity, BaseEntityEvent } from '../generic/baseEntity';
import { UserInfo } from '../generic/securityInfo';

/**
 * `findEntityIndexByPrimaryKeys` runs on every cached save, delete and remote change. These tests
 * pin that it finds rows through a per-array primary-key index: a lookup reads the key of at most
 * the one row it returns, and the index stays correct as the array changes.
 */

interface PKSpec { Name: string; IsUniqueIdentifier: boolean; }

const UUID_PK: PKSpec[] = [{ Name: 'ID', IsUniqueIdentifier: true }];
const STRING_PK: PKSpec[] = [{ Name: 'ID', IsUniqueIdentifier: false }];
const COMPOSITE_PK: PKSpec[] = [
    { Name: 'QueryID', IsUniqueIdentifier: true },
    { Name: 'Name', IsUniqueIdentifier: false },
    { Name: 'Seq', IsUniqueIdentifier: false },
];

/** An uppercase UUID derived from `i`. */
const uuid = (i: number): string =>
    `${i.toString(16).padStart(8, '0')}-AAAA-4BBB-8CCC-${i.toString(16).padStart(12, '0')}`.toUpperCase();

/** Counts how many primary-key values were read from rows, and from which rows. */
interface ReadCounter { reads: number; rowsRead: Set<object>; }

/** Builds rows whose key fields are getters that record each read in `counter`. */
function rowFactory(pks: PKSpec[], counter: ReadCounter) {
    return (values: unknown[]): BaseEntity => {
        const row: Record<string, unknown> = {
            EntityInfo: { Name: 'Test Rows', PrimaryKeys: pks },
            GetAll: () => Object.fromEntries(pks.map((pk, i) => [pk.Name, values[i]])),
        };
        pks.forEach((pk, i) => {
            Object.defineProperty(row, pk.Name, {
                enumerable: true,
                get() {
                    counter.reads++;
                    counter.rowsRead.add(row);
                    return values[i];
                },
            });
        });
        return row as unknown as BaseEntity;
    };
}

/** A lookup target: a plain entity stand-in that is not counted. */
function target(pks: PKSpec[], values: unknown[]): BaseEntity {
    const t: Record<string, unknown> = {
        EntityInfo: { Name: 'Test Rows', PrimaryKeys: pks },
        GetAll: () => Object.fromEntries(pks.map((pk, i) => [pk.Name, values[i]])),
    };
    pks.forEach((pk, i) => { t[pk.Name] = values[i]; });
    return t as unknown as BaseEntity;
}

class TestEngine extends BaseEngine<TestEngine> {
    public _rows: BaseEntity[] = [];
    public cloneRow: (source: BaseEntity) => BaseEntity = s => s;

    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo): Promise<void> {
        // configs are not loaded; tests call the lookup and mutation methods directly
    }
    public findIndex(dataArray: BaseEntity[], t: BaseEntity): number {
        return this.findEntityIndexByPrimaryKeys(dataArray, t);
    }
    public mutate(config: BaseEnginePropertyConfig, event: BaseEntityEvent): Promise<void> {
        return this.applyImmediateMutation(config, event);
    }
    public notifyApplied(config: BaseEnginePropertyConfig, changeType: 'add' | 'update' | 'delete', entity: BaseEntity): void {
        this.notifyAlreadyAppliedMutation(config, changeType, entity);
    }
    protected override async cloneEntityForCache(source: BaseEntity): Promise<BaseEntity | null> {
        return this.cloneRow(source);
    }
}

const ROWS_CONFIG = new BaseEnginePropertyConfig({ Type: 'entity', EntityName: 'Test Rows', PropertyName: '_rows' });

function setup(count: number, pks: PKSpec[] = UUID_PK) {
    const counter: ReadCounter = { reads: 0, rowsRead: new Set() };
    const make = rowFactory(pks, counter);
    const rows = Array.from({ length: count }, (_, i) => make([uuid(i)]));
    const reset = () => { counter.reads = 0; counter.rowsRead.clear(); };
    return { counter, make, rows, reset };
}

describe('BaseEngine.findEntityIndexByPrimaryKeys — primary-key index', () => {
    it('does not read every row on a miss once the index is built', () => {
        const engine = new TestEngine();
        const { rows, counter, reset } = setup(10_000);

        expect(engine.findIndex(rows, target(UUID_PK, [uuid(999_999)]))).toBe(-1);
        reset();
        expect(engine.findIndex(rows, target(UUID_PK, [uuid(888_888)]))).toBe(-1);
        expect(counter.reads).toBe(0);
    });

    it('reads only the key of the row it returns on a hit', () => {
        const engine = new TestEngine();
        const { rows, counter, reset } = setup(10_000);

        engine.findIndex(rows, target(UUID_PK, [uuid(1)]));
        reset();
        expect(engine.findIndex(rows, target(UUID_PK, [uuid(7_321).toLowerCase()]))).toBe(7_321);
        expect(counter.reads).toBe(1);
        expect([...counter.rowsRead]).toEqual([rows[7_321]]);
    });

    it('finds the right row for UUID and string keys with the same equality as before', () => {
        const engine = new TestEngine();
        const counter: ReadCounter = { reads: 0, rowsRead: new Set() };

        const u = [uuid(1), uuid(2).toLowerCase(), uuid(3)].map(v => rowFactory(UUID_PK, counter)([v]));
        expect(engine.findIndex(u, target(UUID_PK, [uuid(1).toLowerCase()]))).toBe(0);
        expect(engine.findIndex(u, target(UUID_PK, [uuid(2)]))).toBe(1);
        expect(engine.findIndex(u, target(UUID_PK, [` ${uuid(3)} `]))).toBe(2);
        expect(engine.findIndex(u, target(UUID_PK, [uuid(4)]))).toBe(-1);

        const s = ['Abc', 'abc', 'X', '1', 'dup', 'dup'].map(v => rowFactory(STRING_PK, counter)([v]));
        expect(engine.findIndex(s, target(STRING_PK, ['Abc']))).toBe(0);
        expect(engine.findIndex(s, target(STRING_PK, ['abc']))).toBe(1);
        expect(engine.findIndex(s, target(STRING_PK, ['ABC']))).toBe(-1);
        expect(engine.findIndex(s, target(STRING_PK, [1]))).toBe(-1);
        expect(engine.findIndex(s, target(STRING_PK, ['1']))).toBe(3);
        expect(engine.findIndex(s, target(STRING_PK, ['dup']))).toBe(4);

        counter.reads = 0;
        expect(engine.findIndex(u, target(UUID_PK, [uuid(5)]))).toBe(-1);
        expect(engine.findIndex(s, target(STRING_PK, ['missing']))).toBe(-1);
        expect(counter.reads).toBe(0);
    });

    it('matches composite keys on every column', () => {
        const engine = new TestEngine();
        const counter: ReadCounter = { reads: 0, rowsRead: new Set() };
        const make = rowFactory(COMPOSITE_PK, counter);
        const rows = [
            [uuid(1), 'a', 1], [uuid(1), 'b', 1], [uuid(2), 'a', 1], [uuid(1), 'a', 2], [uuid(1), 'a|1', 1],
        ].map(make);

        expect(engine.findIndex(rows, target(COMPOSITE_PK, [uuid(1).toLowerCase(), 'a', 1]))).toBe(0);
        expect(engine.findIndex(rows, target(COMPOSITE_PK, [uuid(1), 'b', 1]))).toBe(1);
        expect(engine.findIndex(rows, target(COMPOSITE_PK, [uuid(2), 'a', 1]))).toBe(2);
        expect(engine.findIndex(rows, target(COMPOSITE_PK, [uuid(1), 'a', 2]))).toBe(3);
        expect(engine.findIndex(rows, target(COMPOSITE_PK, [uuid(1), 'a|1', 1]))).toBe(4);
        expect(engine.findIndex(rows, target(COMPOSITE_PK, [uuid(1), 'A', 1]))).toBe(-1);
        expect(engine.findIndex(rows, target(COMPOSITE_PK, [uuid(1), 'a', '1']))).toBe(-1);
        expect(engine.findIndex(rows, target(COMPOSITE_PK, [uuid(3), 'a', 1]))).toBe(-1);

        counter.reads = 0;
        expect(engine.findIndex(rows, target(COMPOSITE_PK, [uuid(9), 'z', 9]))).toBe(-1);
        expect(counter.reads).toBe(0);
    });

    it('gives a replaced array its own index', () => {
        const engine = new TestEngine();
        const { rows, counter, reset } = setup(1_000);

        expect(engine.findIndex(rows, target(UUID_PK, [uuid(0)]))).toBe(0);
        const replacement = rows.slice(0, 500).reverse();
        expect(engine.findIndex(replacement, target(UUID_PK, [uuid(0)]))).toBe(499);
        reset();
        expect(engine.findIndex(replacement, target(UUID_PK, [uuid(600)]))).toBe(-1);
        expect(engine.findIndex(rows, target(UUID_PK, [uuid(600)]))).toBe(600);
        expect(counter.reads).toBe(1);
    });

    it('stays correct after outside pushes and splices change the length', () => {
        const engine = new TestEngine();
        const { rows, counter, make, reset } = setup(1_000);

        expect(engine.findIndex(rows, target(UUID_PK, [uuid(5)]))).toBe(5);
        rows.push(make([uuid(5_000)]));
        expect(engine.findIndex(rows, target(UUID_PK, [uuid(5_000)]))).toBe(1_000);
        rows.splice(10, 1);
        expect(engine.findIndex(rows, target(UUID_PK, [uuid(10)]))).toBe(-1);
        expect(engine.findIndex(rows, target(UUID_PK, [uuid(11)]))).toBe(10);
        expect(engine.findIndex(rows, target(UUID_PK, [uuid(5_000)]))).toBe(999);
        reset();
        expect(engine.findIndex(rows, target(UUID_PK, [uuid(10)]))).toBe(-1);
        expect(counter.reads).toBe(0);
    });

    it('checks each hit and rebuilds when the indexed position holds another row', () => {
        const engine = new TestEngine();
        const { rows, counter, make, reset } = setup(100);

        expect(engine.findIndex(rows, target(UUID_PK, [uuid(3)]))).toBe(3);
        [rows[3], rows[4]] = [rows[4], rows[3]];
        expect(engine.findIndex(rows, target(UUID_PK, [uuid(3)]))).toBe(4);
        expect(engine.findIndex(rows, target(UUID_PK, [uuid(4)]))).toBe(3);

        rows[50] = make([uuid(5_050)]);
        expect(engine.findIndex(rows, target(UUID_PK, [uuid(50)]))).toBe(-1);
        expect(engine.findIndex(rows, target(UUID_PK, [uuid(5_050)]))).toBe(50);
        reset();
        expect(engine.findIndex(rows, target(UUID_PK, [uuid(50)]))).toBe(-1);
        expect(counter.reads).toBe(0);
    });

    it('keeps the index in step with engine creates and updates without a rebuild', async () => {
        const engine = new TestEngine();
        const { rows, counter, make, reset } = setup(1_000);
        engine._rows = rows;
        engine.cloneRow = source => make([(source as unknown as { ID: string }).ID]);

        const find = (i: number) => engine.findIndex(rows, target(UUID_PK, [uuid(i)]));
        expect(find(5)).toBe(5);

        await engine.mutate(ROWS_CONFIG, { type: 'save', saveSubType: 'create', baseEntity: target(UUID_PK, [uuid(7_000)]) } as BaseEntityEvent);
        expect(rows.length).toBe(1_001);
        reset();
        expect(find(7_000)).toBe(1_000);
        expect(find(7_001)).toBe(-1);
        expect(counter.reads).toBe(1);

        const middleBefore = rows[20];
        await engine.mutate(ROWS_CONFIG, { type: 'save', saveSubType: 'update', baseEntity: target(UUID_PK, [uuid(20).toLowerCase()]) } as BaseEntityEvent);
        expect(rows[20]).not.toBe(middleBefore);
        await engine.mutate(ROWS_CONFIG, { type: 'save', saveSubType: 'update', baseEntity: target(UUID_PK, [uuid(7_000)]) } as BaseEntityEvent);
        reset();
        expect(find(20)).toBe(20);
        expect(find(7_000)).toBe(1_000);
        expect(find(8_000)).toBe(-1);
        expect(counter.reads).toBe(2);
    });

    it('updates the index in place after an engine delete instead of rebuilding it', async () => {
        const engine = new TestEngine();
        const { rows, counter, reset } = setup(1_000);
        engine._rows = rows;

        const find = (i: number) => engine.findIndex(rows, target(UUID_PK, [uuid(i)]));
        expect(find(5)).toBe(5);

        await engine.mutate(ROWS_CONFIG, { type: 'delete', baseEntity: target(UUID_PK, [uuid(30)]) } as BaseEntityEvent);
        expect(rows.length).toBe(999);
        reset();
        expect(find(30)).toBe(-1);
        expect(find(31)).toBe(30);
        expect(find(999)).toBe(998);
        expect(counter.reads).toBe(2);

        await engine.mutate(ROWS_CONFIG, { type: 'delete', baseEntity: target(UUID_PK, [uuid(999)]) } as BaseEntityEvent);
        expect(rows.length).toBe(998);
        reset();
        expect(find(999)).toBe(-1);
        expect(find(998)).toBe(997);
        expect(counter.reads).toBe(1);
    });

    it('finds the remaining row after an engine delete of one of two rows with the same key', async () => {
        const engine = new TestEngine();
        const counter: ReadCounter = { reads: 0, rowsRead: new Set() };
        const make = rowFactory(STRING_PK, counter);
        const rows = ['a', 'dup', 'b', 'dup', 'c'].map(v => make([v]));
        engine._rows = rows;

        expect(engine.findIndex(rows, target(STRING_PK, ['dup']))).toBe(1);
        await engine.mutate(ROWS_CONFIG, { type: 'delete', baseEntity: target(STRING_PK, ['dup']) } as BaseEntityEvent);
        expect(engine.findIndex(rows, target(STRING_PK, ['dup']))).toBe(2);
        expect(engine.findIndex(rows, target(STRING_PK, ['c']))).toBe(3);

        counter.reads = 0;
        expect(engine.findIndex(rows, target(STRING_PK, ['missing']))).toBe(-1);
        expect(counter.reads).toBe(0);
    });

    it('keeps the index after an update notification for a row already in the array', () => {
        const engine = new TestEngine();
        const { rows, counter, reset } = setup(1_000);
        engine._rows = rows;

        expect(engine.findIndex(rows, target(UUID_PK, [uuid(5)]))).toBe(5);
        engine.notifyApplied(ROWS_CONFIG, 'update', rows[5]);
        reset();
        expect(engine.findIndex(rows, target(UUID_PK, [uuid(5)]))).toBe(5);
        expect(counter.reads).toBe(1);
    });
});
