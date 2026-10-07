/**
 * JSONType live sync — the parts that only exist because the binding lives INSIDE a real
 * `BaseEntity`: dirty tracking, old values, revert, reload, NewRecord, SetMany, the ordering of the
 * save path, two JSON columns on one record, IS-A routing, and a seeded randomized model check.
 *
 * `baseEntity.jsonField.test.ts` covers the binding's own semantics and validation; this file puts
 * the heat on the seams between the binding and the class that owns it.
 *
 * NOTE ON EVENTS: `BaseEntity` raises no per-field change event — `Set()` is silent, and only
 * `save_started` / `save` / `load_*` / `new_record` exist. So there is nothing to assert about a
 * field-change event; what IS asserted is that in-place edits stay silent until a save, and that the
 * save events fire exactly as they do for any other field.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { BaseEntity, BaseEntityEvent } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { ToPlainJSON } from '../generic/jsonFieldBinding';
import { MEETING_ENTITY_ID, PRODUCT_ENTITY_ID } from './mocks/MockEntityData';
import { buildJsonEntityInfos, JsonStubProvider, JSON_MOCK_USER } from './mocks/JsonFieldMock';

interface IConfig { Pct: number; Items: Array<{ Name: string; Rate: number }>; Nested?: Record<string, unknown> }
interface ISettings { Key: string; Value: unknown }

class TwoFieldEntity extends BaseEntity {
    public override CheckPermissions(): boolean { return true; }
    get Config(): string | null { return this.Get('Config'); }
    set Config(value: string | null) { this.Set('Config', value); }
    get ConfigObject(): IConfig | null { return this.GetJSONFieldObject<IConfig>('Config'); }
    set ConfigObject(value: IConfig | null) { this.SetJSONFieldObject<IConfig>('Config', value); }
    get Settings(): string | null { return this.Get('Settings'); }
    set Settings(value: string | null) { this.Set('Settings', value); }
    get SettingsObject(): ISettings[] | null { return this.GetJSONFieldObject<ISettings[]>('Settings'); }
    set SettingsObject(value: ISettings[] | null) { this.SetJSONFieldObject<ISettings[]>('Settings', value); }
    public PrimitiveConfig(): unknown { return this.GetJSONFieldObject<unknown>('Config'); }
}

/** IS-A child whose JSON column lives on the parent (Products.Config), reached through Get/Set routing. */
class MeetingEntity extends BaseEntity {
    public override CheckPermissions(): boolean { return true; }
    get ConfigObject(): IConfig | null { return this.GetJSONFieldObject<IConfig>('Config'); }
    set ConfigObject(value: IConfig | null) { this.SetJSONFieldObject<IConfig>('Config', value); }
    public WireParent(parent: BaseEntity): void {
        const self = this as unknown as { _parentEntity: BaseEntity | null; _parentEntityFieldNames: Set<string> | null };
        self._parentEntity = parent;
        self._parentEntityFieldNames = new Set(['Config']);
    }
}

let entities: EntityInfo[];
let productInfo: EntityInfo;
let meetingInfo: EntityInfo;
let provider: JsonStubProvider;

beforeAll(() => {
    entities = buildJsonEntityInfos();
    productInfo = entities.find((e) => e.ID === PRODUCT_ENTITY_ID)!;
    meetingInfo = entities.find((e) => e.ID === MEETING_ENTITY_ID)!;
    Metadata.Provider = { Entities: entities, CurrentUser: JSON_MOCK_USER } as unknown as ProviderBase;
});

beforeEach(() => {
    provider = new JsonStubProvider();
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

const ID = '22222222-2222-2222-2222-222222222222';
const BASE_CONFIG: IConfig = { Pct: 10, Items: [{ Name: 'a', Rate: 0.5 }] };

async function loaded(config: unknown = BASE_CONFIG, settings: unknown = null): Promise<TwoFieldEntity> {
    const rec = new TwoFieldEntity(productInfo, provider.Provider);
    await rec.LoadFromData({
        ID,
        Name: 'Row',
        Config: config === null ? null : typeof config === 'string' ? config : JSON.stringify(config),
        Settings: settings === null ? null : typeof settings === 'string' ? settings : JSON.stringify(settings),
    }, true);
    return rec;
}

const savedConfig = (i = provider.Saves.length - 1): unknown => JSON.parse(provider.Saves[i].Config as string);

describe('dirty tracking, old values and change sets', () => {
    it('an in-place edit makes only that field dirty and carries the new text in GetChangesSinceLastSave', async () => {
        const rec = await loaded();
        rec.ConfigObject!.Items[0].Rate = 0.75;
        expect(rec.Dirty).toBe(true);
        expect(rec.FieldIsDirty('Config')).toBe(true);
        expect(rec.FieldIsDirty('Settings')).toBe(false);
        expect(rec.FieldIsDirty('Name')).toBe(false);
        const changes = rec.GetChangesSinceLastSave() as Record<string, unknown>;
        expect(Object.keys(changes)).toEqual(['Config']);
        expect(JSON.parse(changes.Config as string).Items[0].Rate).toBe(0.75);
    });

    it('the field OldValue stays the loaded text until a successful save', async () => {
        const rec = await loaded();
        const original = rec.Config;
        rec.ConfigObject!.Pct = 11;
        rec.ConfigObject!.Pct = 12;
        expect(rec.GetFieldByName('Config')!.OldValue).toBe(original);
        expect(await rec.Save()).toBe(true);
        expect(rec.Dirty).toBe(false);
        expect(rec.GetFieldByName('Config')!.OldValue).toBe(rec.Config);
        expect(JSON.parse(rec.Config!).Pct).toBe(12);
    });

    it('editing back to the original value leaves no net change (semantic, not textual, when formatting matches)', async () => {
        const rec = await loaded();
        rec.ConfigObject!.Pct = 99;
        rec.ConfigObject!.Pct = 10;
        expect(rec.Config).toBe(JSON.stringify(BASE_CONFIG));
        expect(rec.FieldIsDirty('Config')).toBe(false);
    });

    it('in-place edits raise no events until a save; the save raises the usual events', async () => {
        const rec = await loaded();
        const seen: BaseEntityEvent['type'][] = [];
        rec.RegisterEventHandler((e) => seen.push(e.type));
        rec.ConfigObject!.Pct = 30;
        rec.ConfigObject!.Items.push({ Name: 'z', Rate: 1 });
        expect(seen).toEqual([]);
        await rec.Save();
        expect(seen).toContain('save_started');
        expect(seen).toContain('save');
    });
});

describe('save path ordering', () => {
    it('the provider receives the edited text, not the stale one', async () => {
        const rec = await loaded();
        rec.ConfigObject!.Items.push({ Name: 'b', Rate: 0.1 });
        await rec.Save();
        expect((savedConfig() as IConfig).Items.map((i) => i.Name)).toEqual(['a', 'b']);
    });

    it('an entity whose ONLY change is an edit through an un-proxied reference still saves (flush runs before dirty evaluation)', async () => {
        const rec = await loaded();
        const mine: IConfig = JSON.parse(rec.Config!); // equal to the current value: assignment writes nothing
        rec.ConfigObject = mine;
        expect(rec.Dirty).toBe(false);
        mine.Pct = 99; // invisible to the proxy; the record still reports clean
        expect(rec.Dirty).toBe(false);
        expect(await rec.Save()).toBe(true);
        expect(provider.Saves).toHaveLength(1); // proves the save was not skipped as "not dirty"
        expect((savedConfig() as IConfig).Pct).toBe(99);
    });

    it('a save with no JSON edits does not touch or dirty the JSON fields', async () => {
        const rec = await loaded(JSON.stringify(BASE_CONFIG, null, 2)); // pretty-printed at rest
        void rec.ConfigObject!.Pct; // materialize
        rec.Set('Name', 'Renamed');
        expect(await rec.Save()).toBe(true);
        expect(provider.Saves[0].Config).toBe(JSON.stringify(BASE_CONFIG, null, 2));
    });

    it('a held reference survives a successful save and its next edit persists on the second save', async () => {
        const rec = await loaded();
        const held = rec.ConfigObject!;
        held.Pct = 20;
        await rec.Save();
        held.Pct = 22;
        expect(rec.FieldIsDirty('Config')).toBe(true);
        await rec.Save();
        expect((savedConfig(1) as IConfig).Pct).toBe(22);
    });

    it('a FAILED save leaves the object and the string consistent, and a retry persists the edit', async () => {
        const rec = await loaded();
        rec.ConfigObject!.Pct = 40;
        provider.FailNextSave = true;
        expect(await rec.Save()).toBe(false);
        expect(rec.ConfigObject!.Pct).toBe(40);
        expect(JSON.parse(rec.Config!).Pct).toBe(40);
        expect(rec.FieldIsDirty('Config')).toBe(true);
        expect(await rec.Save()).toBe(true);
        expect((savedConfig() as IConfig).Pct).toBe(40);
    });
});

describe('Revert, reload, LoadFromData, NewRecord and SetMany', () => {
    it('Revert restores the loaded text; the object re-parses and earlier references detach', async () => {
        const rec = await loaded();
        const stale = rec.ConfigObject!;
        stale.Pct = 55;
        expect(rec.Revert()).toBe(true);
        expect(rec.Config).toBe(JSON.stringify(BASE_CONFIG));
        expect(rec.ConfigObject!.Pct).toBe(10);
        expect(() => { stale.Pct = 77; }).toThrow(/stale|reloaded/); // detached: cannot resurrect the reverted edit
        expect(JSON.parse(rec.Config!).Pct).toBe(10);
        expect(rec.Dirty).toBe(false);
    });

    it('Revert after an edit through an un-proxied reference discards that edit too', async () => {
        const rec = await loaded();
        const mine: IConfig = JSON.parse(rec.Config!);
        rec.ConfigObject = mine;
        mine.Pct = 88;
        rec.ConfigObject!.Items.length; // read
        rec.Set('Name', 'x'); // make the record dirty so Revert acts
        rec.Revert();
        expect(rec.ConfigObject!.Pct).toBe(10);
    });

    it('LoadFromData replacing the raw re-parses and detaches', async () => {
        const rec = await loaded();
        const stale = rec.ConfigObject!;
        await rec.LoadFromData({ ID, Name: 'Row', Config: JSON.stringify({ Pct: 1, Items: [] }), Settings: null }, true);
        expect(rec.ConfigObject!.Pct).toBe(1);
        expect(() => { stale.Pct = 500; }).toThrow(/stale|reloaded/);
        expect(JSON.parse(rec.Config!).Pct).toBe(1);
        expect(rec.Dirty).toBe(false);
    });

    it('SetMany touching the raw is picked up by the next read', async () => {
        const rec = await loaded();
        const stale = rec.ConfigObject!;
        rec.SetMany({ Config: JSON.stringify({ Pct: 31, Items: [] }) });
        expect(rec.ConfigObject!.Pct).toBe(31);
        expect(rec.ConfigObject).not.toBe(stale);
        expect(rec.FieldIsDirty('Config')).toBe(true);
    });

    it('NewRecord: the field starts null, assignment and in-place edits work, and the save carries them', async () => {
        const rec = new TwoFieldEntity(productInfo, provider.Provider);
        rec.NewRecord();
        rec.Set('Name', 'fresh');
        expect(rec.ConfigObject).toBeNull();
        rec.ConfigObject = { Pct: 1, Items: [] };
        rec.ConfigObject!.Items.push({ Name: 'n', Rate: 1 });
        expect(await rec.Save()).toBe(true);
        expect(savedConfig()).toEqual({ Pct: 1, Items: [{ Name: 'n', Rate: 1 }] });
    });

    it('NewRecord after use resets the field and the binding follows', async () => {
        const rec = await loaded();
        rec.ConfigObject!.Pct = 5;
        rec.NewRecord();
        expect(rec.ConfigObject).toBeNull();
    });
});

describe('two JSON fields on one record', () => {
    it('edits to one never contaminate the other', async () => {
        const rec = await loaded(BASE_CONFIG, [{ Key: 'k', Value: 1 }]);
        rec.ConfigObject!.Pct = 60;
        expect(rec.FieldIsDirty('Settings')).toBe(false);
        rec.SettingsObject![0].Value = 2;
        rec.SettingsObject!.push({ Key: 'k2', Value: 'v' });
        expect(JSON.parse(rec.Config!).Pct).toBe(60);
        expect(JSON.parse(rec.Settings!)).toEqual([{ Key: 'k', Value: 2 }, { Key: 'k2', Value: 'v' }]);
        await rec.Save();
        expect(JSON.parse(provider.Saves[0].Settings as string)).toHaveLength(2);
        expect((savedConfig() as IConfig).Pct).toBe(60);
    });

    it('the same PLAIN object placed in two fields is shared: each field updates at once through its own view, the other at the next flush', async () => {
        const rec = await loaded(BASE_CONFIG, null);
        const shared = { Key: 's', Value: 1 };
        rec.SettingsObject = [shared];
        rec.ConfigObject = { Pct: 1, Items: [], Nested: { shared } };
        rec.SettingsObject![0].Value = 2; // immediate for Settings (through its proxy)...
        expect(JSON.parse(rec.Settings!)).toEqual([{ Key: 's', Value: 2 }]);
        expect((JSON.parse(rec.Config!) as IConfig).Nested).toEqual({ shared: { Key: 's', Value: 1 } }); // ...not yet for Config
        rec.Validate(); // the safety net flushes every materialized field
        expect((JSON.parse(rec.Config!) as IConfig).Nested).toEqual({ shared: { Key: 's', Value: 2 } });
    });

    it('assigning independent COPIES (ToPlainJSON) keeps the two documents independent', async () => {
        const rec = await loaded(BASE_CONFIG, null);
        const shared = { Key: 's', Value: 1 };
        rec.SettingsObject = [ToPlainJSON(shared)];
        rec.ConfigObject = { Pct: 1, Items: [], Nested: { shared: ToPlainJSON(shared) } };
        rec.SettingsObject![0].Value = 2;
        rec.Validate();
        expect((JSON.parse(rec.Config!) as IConfig).Nested).toEqual({ shared: { Key: 's', Value: 1 } });
    });

    it('a live view from one field assigned into the other is copied, not aliased', async () => {
        const rec = await loaded(BASE_CONFIG, [{ Key: 'k', Value: { deep: 1 } }]);
        rec.ConfigObject!.Nested = { fromSettings: rec.SettingsObject![0] };
        (rec.SettingsObject![0].Value as { deep: number }).deep = 2;
        expect((JSON.parse(rec.Config!) as IConfig).Nested).toEqual({ fromSettings: { Key: 'k', Value: { deep: 1 } } });
    });
});

describe('root shapes and transitions', () => {
    it('an array-root field: push / index write / splice persist', async () => {
        const rec = await loaded(BASE_CONFIG, [{ Key: 'a', Value: 1 }]);
        rec.SettingsObject!.push({ Key: 'b', Value: 2 });
        rec.SettingsObject![0].Value = 9;
        rec.SettingsObject!.splice(1, 1);
        expect(JSON.parse(rec.Settings!)).toEqual([{ Key: 'a', Value: 9 }]);
    });

    it('a primitive-root field is returned unwrapped and reassigned by whole value', async () => {
        const rec = await loaded('12345');
        expect(rec.PrimitiveConfig()).toBe(12345);
        const strRec = await loaded('"hello"');
        expect(strRec.PrimitiveConfig()).toBe('hello');
        const boolRec = await loaded('false');
        expect(boolRec.PrimitiveConfig()).toBe(false);
    });

    it('null -> object -> null -> array-shaped value round trips', async () => {
        const rec = await loaded(null);
        expect(rec.ConfigObject).toBeNull();
        rec.ConfigObject = { Pct: 1, Items: [] };
        expect(rec.Config).toBe('{"Pct":1,"Items":[]}');
        rec.ConfigObject = null;
        expect(rec.Config).toBeNull();
        expect(rec.ConfigObject).toBeNull();
        rec.ConfigObject = { Pct: 2, Items: [{ Name: 'x', Rate: 0 }] };
        rec.ConfigObject!.Items[0].Rate = 1;
        expect(JSON.parse(rec.Config!).Items[0].Rate).toBe(1);
    });

    it('an empty-array root and an empty-object root are live', async () => {
        const rec = await loaded(BASE_CONFIG, []);
        rec.SettingsObject!.push({ Key: 'first', Value: 1 });
        expect(JSON.parse(rec.Settings!)).toHaveLength(1);
        const rec2 = await loaded({});
        (rec2.ConfigObject as unknown as Record<string, unknown>).added = 1;
        expect(JSON.parse(rec2.Config!)).toEqual({ added: 1 });
    });

    it('tracks an edit 12 levels down', async () => {
        let deep: Record<string, unknown> = { leaf: 'x' };
        for (let i = 0; i < 11; i++) deep = { [`l${i}`]: deep };
        const rec = await loaded({ Pct: 1, Items: [], Nested: deep });
        let node = rec.ConfigObject!.Nested as Record<string, unknown>;
        for (let i = 10; i >= 0; i--) node = node[`l${i}`] as Record<string, unknown>;
        node.leaf = 'changed';
        let check = (JSON.parse(rec.Config!) as IConfig).Nested as Record<string, unknown>;
        for (let i = 10; i >= 0; i--) check = check[`l${i}`] as Record<string, unknown>;
        expect(check.leaf).toBe('changed');
    });
});

describe('IS-A: JSON column on the parent, accessor on the child', () => {
    it('edits through the child accessor update the PARENT\'s raw value and dirty state', async () => {
        const parent = new TwoFieldEntity(productInfo, provider.Provider);
        await parent.LoadFromData({ ID, Name: 'P', Config: JSON.stringify(BASE_CONFIG), Settings: null }, true);
        const child = new MeetingEntity(meetingInfo, provider.Provider);
        child.WireParent(parent);

        child.ConfigObject!.Items.push({ Name: 'via-child', Rate: 1 });
        expect(JSON.parse(parent.Config!).Items.map((i: { Name: string }) => i.Name)).toEqual(['a', 'via-child']);
        expect(parent.FieldIsDirty('Config')).toBe(true);
        // and the parent's own accessor sees the same document
        expect(parent.ConfigObject!.Items).toHaveLength(2);
    });

    it('a raw change on the parent is seen by the child accessor on its next read', async () => {
        const parent = new TwoFieldEntity(productInfo, provider.Provider);
        await parent.LoadFromData({ ID, Name: 'P', Config: JSON.stringify(BASE_CONFIG), Settings: null }, true);
        const child = new MeetingEntity(meetingInfo, provider.Provider);
        child.WireParent(parent);
        expect(child.ConfigObject!.Pct).toBe(10);
        parent.Config = JSON.stringify({ Pct: 42, Items: [] });
        expect(child.ConfigObject!.Pct).toBe(42);
    });
});

describe('stress', () => {
    it('20,000 in-place mutations of a 100-item document stay correct and fast enough', async () => {
        const items = Array.from({ length: 100 }, (_, i) => ({ Name: `n${i}`, Rate: 0 }));
        const rec = await loaded({ Pct: 0, Items: items });
        const root = rec.ConfigObject!;
        const started = performance.now();
        for (let i = 0; i < 20000; i++) {
            root.Items[i % 100].Rate = i;
            root.Pct = i;
        }
        const elapsed = performance.now() - started;
        const final = JSON.parse(rec.Config!) as IConfig;
        expect(final.Pct).toBe(19999);
        expect(final.Items[99].Rate).toBe(19999);
        expect(final.Items[0].Rate).toBe(19900);
        // Rough sanity bound, deliberately loose: eager re-serialization of a ~4KB document costs
        // tens of microseconds. A regression to quadratic/unbounded work would blow well past this.
        expect(elapsed).toBeLessThan(10000);
    });

    it('a no-op storm (re-assigning identical values) never calls Set', async () => {
        const rec = await loaded();
        let sets = 0;
        const original = rec.Set.bind(rec);
        rec.Set = (name: string, value: unknown) => { sets++; original(name, value); };
        const root = rec.ConfigObject!;
        for (let i = 0; i < 5000; i++) {
            root.Pct = 10;
            root.Items[0].Name = 'a';
        }
        expect(sets).toBe(0);
    });
});

/** mulberry32: tiny seeded PRNG, so the "random" model check is exactly reproducible. */
function prng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Container = Json[] | { [key: string]: Json };

describe('randomized model check (seeded, deterministic)', () => {
    const STEPS = 600;
    const SEEDS = [1, 2, 3, 7, 42, 1234, 99991, 2026];

    function isContainer(v: unknown): v is Container {
        return typeof v === 'object' && v !== null;
    }

    function makeValue(rand: () => number, depth: number): Json {
        const r = rand();
        if (depth > 2 || r < 0.35) {
            const p = rand();
            return p < 0.25 ? null : p < 0.4 ? rand() < 0.5 : p < 0.7 ? Math.floor(rand() * 1000) : `s${Math.floor(rand() * 100)}`;
        }
        if (r < 0.65) {
            return Array.from({ length: Math.floor(rand() * 4) }, () => makeValue(rand, depth + 1));
        }
        const obj: { [key: string]: Json } = {};
        for (let i = Math.floor(rand() * 4); i > 0; i--) obj[`k${Math.floor(rand() * 6)}`] = makeValue(rand, depth + 1);
        return obj;
    }

    /** Walks the SAME random path through the live view and the shadow, returning both containers. */
    function pick(rand: () => number, live: Container, shadow: Container): [Container, Container] {
        let p: Container = live;
        let s: Container = shadow;
        for (let hops = Math.floor(rand() * 5); hops > 0; hops--) {
            const keys = Array.isArray(s) ? s.map((_, i) => String(i)) : Object.keys(s);
            const children = keys.filter((k) => isContainer((s as Record<string, Json>)[k]));
            if (children.length === 0) break;
            const key = children[Math.floor(rand() * children.length)];
            p = (p as Record<string, Container>)[key];
            s = (s as Record<string, Container>)[key];
        }
        return [p, s];
    }

    function mutate(rand: () => number, p: Container, s: Container): string {
        const fresh = makeValue(rand, 1);
        if (Array.isArray(p) && Array.isArray(s)) {
            const i = Math.floor(rand() * (s.length + 1));
            switch (Math.floor(rand() * 9)) {
                case 0: p.push(fresh); s.push(structuredClone(fresh)); return 'push';
                case 1: p.pop(); s.pop(); return 'pop';
                case 2: p.unshift(fresh); s.unshift(structuredClone(fresh)); return 'unshift';
                case 3: p.shift(); s.shift(); return 'shift';
                case 4: p.splice(i, 1); s.splice(i, 1); return 'splice-remove';
                case 5: p.splice(i, 0, fresh); s.splice(i, 0, structuredClone(fresh)); return 'splice-insert';
                case 6: p.reverse(); s.reverse(); return 'reverse';
                case 7: p[i] = fresh; s[i] = structuredClone(fresh); return 'index-set';
                default: { const n = Math.floor(rand() * (s.length + 1)); p.length = n; s.length = n; return 'truncate'; }
            }
        }
        const po = p as { [key: string]: Json };
        const so = s as { [key: string]: Json };
        const keys = Object.keys(so);
        const key = `k${Math.floor(rand() * 6)}`;
        switch (Math.floor(rand() * 5)) {
            case 0: po[key] = fresh; so[key] = structuredClone(fresh); return 'key-set';
            case 1: if (keys.length) { const k = keys[Math.floor(rand() * keys.length)]; delete po[k]; delete so[k]; } return 'delete';
            case 2: po[key] = null; so[key] = null; return 'set-null';
            case 3: { // move a child to another key: proxy unwrap on one side, plain aliasing on the other
                const src = keys.find((k) => isContainer(so[k]));
                if (src !== undefined) { po[key] = po[src]; so[key] = so[src]; }
                return 'alias-child';
            }
            default: po[key] = fresh; so[key] = structuredClone(fresh); return 'key-set2';
        }
    }

    for (const seed of SEEDS) {
        it(`seed ${seed}: JSON.parse(raw) deep-equals the shadow object after each of ${STEPS} random mutations`, async () => {
            const rand = prng(seed);
            const initial = { a: makeValue(rand, 0), list: [1, { x: 2 }, [3]], obj: { n: { m: 1 } } } as { [key: string]: Json };
            const shadow = structuredClone(initial);
            const rec = await loaded(JSON.stringify(initial));
            const live = rec.ConfigObject as unknown as Container;
            const held = live; // the root reference is held for the whole run

            const log: string[] = [];
            for (let step = 0; step < STEPS; step++) {
                const [p, s] = pick(rand, held, shadow);
                log.push(mutate(rand, p, s));
                const actual = JSON.parse(rec.Config as string);
                try {
                    expect(actual).toEqual(shadow);
                } catch (error) {
                    throw new Error(`diverged at step ${step} (${log.slice(-5).join(', ')}): ${(error as Error).message}`);
                }
            }
            // and what a save would hand persistence is that same document
            await rec.Save();
            expect(JSON.parse(provider.Saves[0].Config as string)).toEqual(shadow);
            expect(ToPlainJSON(rec.ConfigObject)).toEqual(shadow);
        });
    }
});
