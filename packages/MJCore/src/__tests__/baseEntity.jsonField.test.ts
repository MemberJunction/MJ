/**
 * JSONType live sync + validation — driving the REAL `BaseEntity`.
 *
 * WHAT THIS PROTECTS
 *
 * A generated `<Field>Object` accessor used to cache the parsed object and re-serialize ONLY in its
 * setter. An in-place edit (`rec.ConfigObject.Pct = 5`, `rec.ItemsObject.push(x)`) changed the
 * cached object but never the raw string: the field was not dirty and `Save()` wrote the OLD JSON,
 * while the getter kept returning the mutated object so the record *looked* edited. The first
 * `describe` reproduces that with the accessor text CodeGen used to emit, verbatim, so the bug
 * stays documented; the rest drive the delegating accessor (`GetJSONFieldObject` /
 * `SetJSONFieldObject`) that replaced it.
 *
 * HONEST NARROWING: like the other BaseEntity suites, the provider is a stub whose `Save()` echoes
 * the record, and `CheckPermissions()` is overridden. The binding, dirty tracking, `Validate()` and
 * the save path are real production code.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { z } from 'zod';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo, ValidationResult, ValidationErrorType } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { JSONFieldRuleSet, JSONFieldSeverity, ToPlainJSON } from '../generic/jsonFieldBinding';
import { PRODUCT_ENTITY_ID } from './mocks/MockEntityData';
import { buildJsonEntityInfos, JsonStubProvider, JSON_MOCK_USER } from './mocks/JsonFieldMock';

interface ILimits { Max: number; Deep?: { A: { B: { C: { D: { E: { F: { Leaf: string } } } } } } } }
interface IItem { Name: string; Rate: number; When?: Date; Tags?: string[] }
interface IConfig { Pct: number; Limits?: ILimits; Items: IItem[]; Note?: string | null; Extra?: Record<string, unknown> }

let provider: JsonStubProvider;
/** What the provider was handed for the Config column on the most recent Save(). */
const lastSaved = (): string | null => provider.Saves[provider.Saves.length - 1].Config as string | null;

/** The accessor CodeGen emitted BEFORE this change, verbatim (minus generics noise). */
class LegacyAccessorEntity extends BaseEntity {
    public override CheckPermissions(): boolean { return true; }
    get Config(): string | null { return this.Get('Config'); }
    set Config(value: string | null) { this.Set('Config', value); }
    private _ConfigObject_cached: IConfig | null | undefined = undefined;
    private _ConfigObject_lastRaw: string | null = null;
    get ConfigObject(): IConfig | null {
        const raw = this.Config;
        if (raw !== this._ConfigObject_lastRaw) {
            this._ConfigObject_cached = raw ? JSON.parse(raw) : null;
            this._ConfigObject_lastRaw = raw;
        }
        return this._ConfigObject_cached!;
    }
    set ConfigObject(value: IConfig | null) {
        const raw = value ? JSON.stringify(value) : null;
        this.Config = raw;
        this._ConfigObject_cached = value;
        this._ConfigObject_lastRaw = raw;
    }
}

const ItemSchema = z.object({ Name: z.string().min(1), Rate: z.number().min(0).max(1), Tags: z.array(z.string()).optional() });
const ConfigSchema = z.object({
    Pct: z.number().min(0).max(100),
    Items: z.array(ItemSchema),
    Note: z.string().nullable().optional(),
});

const rules: JSONFieldRuleSet = {
    RootType: 'IConfig',
    RootIsArray: false,
    Graph: { IConfig: [{ Property: 'Items', Type: 'IItem', Shape: 'array' }] },
    Rules: [
        { Type: 'IItem', Description: 'Rate must be zero when Name is "free"', Test: (v: IItem) => v.Name !== 'free' || v.Rate === 0 },
        { Type: 'IConfig', Property: 'Items', PerElement: true, Description: 'Item name must not be empty', Test: (v: IItem) => v.Name.length > 0 },
        { Type: 'IConfig', Description: 'Pct must be even', Test: (v: IConfig) => v.Pct % 2 === 0 },
    ],
};

class ConfigEntity extends BaseEntity {
    public Severity: JSONFieldSeverity = 'Failure';
    public UseRules = true;
    public override CheckPermissions(): boolean { return true; }
    get Config(): string | null { return this.Get('Config'); }
    set Config(value: string | null) { this.Set('Config', value); }
    get ConfigObject(): IConfig | null { return this.GetJSONFieldObject<IConfig>('Config'); }
    set ConfigObject(value: IConfig | null) { this.SetJSONFieldObject<IConfig>('Config', value); }
    /** Calls the protected helper directly, WITHOUT going through Validate(). */
    public CheckDirect(result: ValidationResult): void {
        this.ValidateJSONField('Config', ConfigSchema, rules, 'Failure', result);
    }
    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.ValidateJSONField('Config', ConfigSchema, this.UseRules ? rules : null, this.Severity, result);
        result.Success = result.Success && !result.Errors.some((e) => e.Type === ValidationErrorType.Failure);
        return result;
    }
}

class ArrayRootEntity extends BaseEntity {
    public override CheckPermissions(): boolean { return true; }
    get ConfigObject(): IItem[] | null { return this.GetJSONFieldObject<IItem[]>('Config'); }
    set ConfigObject(value: IItem[] | null) { this.SetJSONFieldObject<IItem[]>('Config', value); }
    public GetJSONFieldObjectForTest(): unknown { return this.GetJSONFieldObject<unknown>('Config'); }
    public Check(schema: z.ZodTypeAny, ruleSet: JSONFieldRuleSet | null, result: ValidationResult): void {
        this.ValidateJSONField('Config', schema, ruleSet, 'Failure', result);
    }
}

let info: EntityInfo;

beforeAll(() => {
    const entities = buildJsonEntityInfos();
    info = entities.find((e) => e.ID === PRODUCT_ENTITY_ID)!;
    Metadata.Provider = { Entities: entities, CurrentUser: JSON_MOCK_USER } as unknown as ProviderBase;
});

beforeEach(() => {
    provider = new JsonStubProvider();
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

const BASE: IConfig = { Pct: 10, Items: [{ Name: 'a', Rate: 0.5 }, { Name: 'b', Rate: 0.25 }], Limits: { Max: 3 } };

/** A record that looks loaded from the database: current == old, not dirty, `IsSaved`. */
async function loaded<E extends BaseEntity>(ctor: new (i: EntityInfo) => E, config: string | null): Promise<E> {
    const e = new ctor(info, provider.Provider);
    await e.LoadFromData({ ID: '11111111-1111-1111-1111-111111111111', Name: 'Row', Config: config }, true);
    return e;
}

const isDirty = (e: BaseEntity) => e.FieldIsDirty('Config');

describe('pre-fix generated accessor (documented bug reproduction)', () => {
    it('loses an in-place edit: the field is not dirty and the raw string is unchanged', async () => {
        const rec = await loaded(LegacyAccessorEntity, JSON.stringify(BASE));
        rec.ConfigObject!.Pct = 5;
        expect(rec.ConfigObject!.Pct).toBe(5); // the record LOOKS edited...
        expect(isDirty(rec)).toBe(false); // ...but nothing will be saved
        expect(JSON.parse(rec.Config!).Pct).toBe(10);
    });

    it('loses an array push', async () => {
        const rec = await loaded(LegacyAccessorEntity, JSON.stringify(BASE));
        rec.ConfigObject!.Items.push({ Name: 'c', Rate: 0 });
        expect(isDirty(rec)).toBe(false);
    });
});

describe('live object -> string sync', () => {
    it('in-place edit dirties the field and Save persists it', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        expect(isDirty(rec)).toBe(false);
        rec.ConfigObject!.Pct = 6;
        expect(isDirty(rec)).toBe(true);
        expect(JSON.parse(rec.Config!).Pct).toBe(6);
        expect(await rec.Save()).toBe(true);
        expect(JSON.parse(lastSaved()!).Pct).toBe(6);
    });

    it('a reference held in a local variable stays tracked', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        const items = rec.ConfigObject!.Items;
        const first = items[0];
        first.Rate = 0.9;
        items[1].Name = 'renamed';
        expect(JSON.parse(rec.Config!).Items[0].Rate).toBe(0.9);
        expect(JSON.parse(rec.Config!).Items[1].Name).toBe('renamed');
    });

    it('reassign-then-mutate through the caller\'s original reference is caught by the safety net at Save', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        const mine: IConfig = { Pct: 2, Items: [] };
        rec.ConfigObject = mine;
        mine.Pct = 4; // un-proxied: invisible to the proxy
        mine.Items.push({ Name: 'x', Rate: 0 });
        expect(await rec.Save()).toBe(true);
        expect(JSON.parse(lastSaved()!)).toEqual({ Pct: 4, Items: [{ Name: 'x', Rate: 0 }] });
    });

    it('the safety net also runs before Validate()', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        const mine: IConfig = { Pct: 2, Items: [] };
        rec.ConfigObject = mine;
        mine.Pct = 200; // violates the schema max; only visible if Validate() flushes first
        const result = rec.Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors[0].Source).toBe('Config.Pct');
    });

    it('nested objects have stable identity (o.a === o.a)', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        expect(rec.ConfigObject!.Limits).toBe(rec.ConfigObject!.Limits);
        expect(rec.ConfigObject).toBe(rec.ConfigObject);
    });

    it('tracks edits at 6+ levels of nesting', async () => {
        const deep = { Pct: 1, Items: [], Limits: { Max: 1, Deep: { A: { B: { C: { D: { E: { F: { Leaf: 'x' } } } } } } } } };
        const rec = await loaded(ConfigEntity, JSON.stringify(deep));
        rec.ConfigObject!.Limits!.Deep!.A.B.C.D.E.F.Leaf = 'changed';
        expect(JSON.parse(rec.Config!).Limits.Deep.A.B.C.D.E.F.Leaf).toBe('changed');
    });

    it('supports array push / splice / sort / length / pop / reverse / unshift', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        const items = rec.ConfigObject!.Items;
        items.push({ Name: 'c', Rate: 0.1 });
        expect(JSON.parse(rec.Config!).Items.map((i: IItem) => i.Name)).toEqual(['a', 'b', 'c']);
        items.splice(1, 1);
        expect(JSON.parse(rec.Config!).Items.map((i: IItem) => i.Name)).toEqual(['a', 'c']);
        items.sort((x, y) => y.Name.localeCompare(x.Name));
        expect(JSON.parse(rec.Config!).Items.map((i: IItem) => i.Name)).toEqual(['c', 'a']);
        items.unshift({ Name: 'z', Rate: 0 });
        items.reverse();
        expect(JSON.parse(rec.Config!).Items.map((i: IItem) => i.Name)).toEqual(['a', 'c', 'z']);
        expect(items.pop()!.Name).toBe('z');
        items.length = 1;
        expect(JSON.parse(rec.Config!).Items).toEqual([{ Name: 'a', Rate: 0.5 }]);
        expect(items.length).toBe(1);
    });

    it('sorting objects does not leak proxies into the stored document', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        rec.ConfigObject!.Items.sort((x, y) => y.Name.localeCompare(x.Name));
        // structuredClone throws on a Proxy; a clean underlying document survives a plain re-parse
        expect(() => structuredClone(JSON.parse(rec.Config!))).not.toThrow();
        rec.ConfigObject!.Items[0].Rate = 0.99; // still tracked after the reorder
        expect(JSON.parse(rec.Config!).Items[0].Rate).toBe(0.99);
    });

    it('delete removes the member', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        delete rec.ConfigObject!.Limits;
        expect(JSON.parse(rec.Config!)).not.toHaveProperty('Limits');
        expect(isDirty(rec)).toBe(true);
    });

    it('a new subtree assigned into the tree is tracked when edited afterwards', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        rec.ConfigObject!.Limits = { Max: 1 };
        rec.ConfigObject!.Limits.Max = 9; // read back through the proxy => wrapped and tracked
        expect(JSON.parse(rec.Config!).Limits.Max).toBe(9);
    });

    it('does not wrap exotic objects (Date, Map): their internal slots keep working', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        const when = new Date('2026-01-02T03:04:05.000Z');
        rec.ConfigObject!.Items[0].When = when;
        const read = rec.ConfigObject!.Items[0].When!;
        expect(read).toBe(when); // same instance, not a proxy
        expect(read.toISOString()).toBe('2026-01-02T03:04:05.000Z'); // would throw on a Proxy<Date>
        expect(JSON.parse(rec.Config!).Items[0].When).toBe('2026-01-02T03:04:05.000Z');
    });

    it('no-op writes do not dirty the field', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        rec.ConfigObject!.Pct = 10; // same value
        rec.ConfigObject!.Items[0].Name = 'a';
        rec.ConfigObject = rec.ConfigObject; // assigning the same view back
        expect(isDirty(rec)).toBe(false);
    });

    it('reading a differently-formatted (but equal) raw value never dirties the record', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE, null, 4)); // pretty-printed at rest
        expect(rec.ConfigObject!.Pct).toBe(10);
        rec.Validate();
        expect(isDirty(rec)).toBe(false);
        expect(rec.Config).toBe(JSON.stringify(BASE, null, 4)); // untouched text
    });

    it('a push costs one serialization: the trailing length write is a no-op', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        const writes: (string | null)[] = [];
        rec.RegisterEventHandler(() => { /* keep the event bus warm */ });
        const original = rec.Set.bind(rec);
        rec.Set = (name: string, value: unknown) => { writes.push(value as string); original(name, value); };
        rec.ConfigObject!.Items.push({ Name: 'c', Rate: 0 });
        expect(writes).toHaveLength(1);
    });
});

describe('string -> object re-parse', () => {
    it('re-parses after a string Set and detaches earlier references', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        const stale = rec.ConfigObject!;
        rec.Config = JSON.stringify({ Pct: 77, Items: [] });
        expect(rec.ConfigObject!.Pct).toBe(77);
        expect(() => { stale.Pct = 1; }).toThrow(/stale|reloaded/); // detached: fails loudly, never silently lost
        expect(JSON.parse(rec.Config!).Pct).toBe(77);
        expect(rec.ConfigObject!.Pct).toBe(77);
    });

    it('re-parses after LoadFromData', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        const stale = rec.ConfigObject!;
        expect(stale.Pct).toBe(10);
        await rec.LoadFromData({ ID: '11111111-1111-1111-1111-111111111111', Name: 'Row', Config: JSON.stringify({ Pct: 3, Items: [] }) }, true);
        expect(rec.ConfigObject!.Pct).toBe(3);
        expect(rec.ConfigObject).not.toBe(stale);
    });

    it('keeps live references across a save round trip that only re-formats the JSON', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        const held = rec.ConfigObject!;
        held.Pct = 20;
        rec.Config = JSON.stringify(JSON.parse(rec.Config!), null, 2); // e.g. the store re-formats
        held.Pct = 22; // must still be attached: same document, different whitespace
        expect(JSON.parse(rec.Config!).Pct).toBe(22);
    });

    it('a write originating from the proxy does not invalidate the proxy it came from', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        const root = rec.ConfigObject!;
        root.Pct = 12;
        expect(rec.ConfigObject).toBe(root);
    });
});

describe('null / empty / array / primitive roots', () => {
    it('null and empty raw return null; assigning null clears the field', async () => {
        const nullRec = await loaded(ConfigEntity, null);
        expect(nullRec.ConfigObject).toBeNull();
        const emptyRec = await loaded(ConfigEntity, '');
        expect(emptyRec.ConfigObject).toBeNull();
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        rec.ConfigObject = null;
        expect(rec.Config).toBeNull();
        expect(rec.ConfigObject).toBeNull();
    });

    it('assigning an object to a null field serializes it', async () => {
        const rec = await loaded(ConfigEntity, null);
        rec.ConfigObject = { Pct: 1, Items: [] };
        expect(JSON.parse(rec.Config!)).toEqual({ Pct: 1, Items: [] });
        rec.ConfigObject!.Pct = 2;
        expect(JSON.parse(rec.Config!).Pct).toBe(2);
    });

    it('an array root is tracked', async () => {
        const rec = await loaded(ArrayRootEntity, JSON.stringify([{ Name: 'a', Rate: 1 }]));
        rec.ConfigObject!.push({ Name: 'b', Rate: 0 });
        rec.ConfigObject![0].Rate = 0.5;
        expect(JSON.parse(rec.Get('Config'))).toEqual([{ Name: 'a', Rate: 0.5 }, { Name: 'b', Rate: 0 }]);
    });

    it('a primitive JSON root is returned unwrapped', async () => {
        const rec = await loaded(ArrayRootEntity, '42');
        expect(rec.GetJSONFieldObjectForTest()).toBe(42);
    });

    it('invalid JSON text throws a clear error naming the field', async () => {
        const rec = await loaded(ConfigEntity, '{not json');
        expect(() => rec.ConfigObject).toThrow(/Config.*valid JSON/);
    });
});

describe('ToPlainJSON and structured clone', () => {
    it('structuredClone of the live view throws, of ToPlainJSON does not', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        expect(() => structuredClone(rec.ConfigObject)).toThrow();
        const plain = ToPlainJSON(rec.ConfigObject);
        const cloned = structuredClone(plain);
        expect(cloned).toEqual(BASE);
    });

    it('the plain copy is independent of the entity', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        const plain = ToPlainJSON(rec.ConfigObject)!;
        plain.Pct = 99;
        plain.Items.push({ Name: 'q', Rate: 0 });
        expect(isDirty(rec)).toBe(false);
        expect(rec.ConfigObject!.Pct).toBe(10);
    });

    it('works on ordinary values and primitives', () => {
        expect(ToPlainJSON(null)).toBeNull();
        expect(ToPlainJSON(undefined)).toBeUndefined();
        expect(ToPlainJSON(5)).toBe(5);
        const original = { a: [1, { b: 2 }] };
        const copy = ToPlainJSON(original);
        expect(copy).toEqual(original);
        expect(copy).not.toBe(original);
        expect(copy.a).not.toBe(original.a);
    });

    it('assigning a live view from another record copies rather than aliases', async () => {
        const one = await loaded(ConfigEntity, JSON.stringify(BASE));
        const two = await loaded(ConfigEntity, JSON.stringify({ Pct: 0, Items: [] }));
        two.ConfigObject!.Note = 'n';
        one.ConfigObject!.Limits = two.ConfigObject!.Limits;
        two.ConfigObject = one.ConfigObject;
        two.ConfigObject!.Pct = 50;
        expect(JSON.parse(one.Config!).Pct).toBe(10);
        expect(JSON.parse(two.Config!).Pct).toBe(50);
    });

    it('the update-by-spread pattern ({ ...live, x }) stores clean data: nested edits persist, no proxy chains, old refs detach', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        const oldItems = rec.ConfigObject!.Items;
        rec.ConfigObject = { ...rec.ConfigObject!, Pct: 8 }; // members of the spread ARE live proxies
        expect(JSON.parse(rec.Config!).Pct).toBe(8);
        expect(() => structuredClone(ToPlainJSON(rec.ConfigObject))).not.toThrow();
        rec.ConfigObject!.Items[0].Rate = 0.42; // nested edit through the NEW tree persists
        expect(JSON.parse(rec.Config!).Items[0].Rate).toBe(0.42);
        // a reference from before the assignment is detached — and because the new document reuses
        // the old document's nodes, a write through it must NOT be allowed to alter the entity
        expect(() => { oldItems[0].Rate = 0.99; }).toThrow(/stale|reloaded/);
        expect(rec.ConfigObject!.Items[0].Rate).toBe(0.42);
        expect(JSON.parse(rec.Config!).Items[0].Rate).toBe(0.42);
        // the stored tree contains raw data: reads return proxies whose targets are plain objects
        expect(Object.getPrototypeOf(rec.ConfigObject!.Items[0])).toBe(Object.prototype);
    });

    it('a frozen live node still reads without a proxy-invariant TypeError', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        const root = rec.ConfigObject!;
        Object.freeze(root);
        expect(() => root.Items[0].Name).not.toThrow();
    });
});

describe('re-assigning the live object (does not detach)', () => {
    it('read -> edit -> reassign -> edit again persists both edits and keeps the reference live', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        const cfg = rec.ConfigObject!;
        cfg.Pct = 20;
        rec.ConfigObject = cfg;          // hand the live object back (base-agent: FinalPayloadObject = mergedPayload)
        cfg.Items.push({ Name: 'c', Rate: 0.1 }); // must NOT throw: same generation
        expect(JSON.parse(rec.Config!).Pct).toBe(20);
        expect(JSON.parse(rec.Config!).Items).toHaveLength(3);
        expect(await rec.Save()).toBe(true);
        expect(JSON.parse(lastSaved()!).Items).toHaveLength(3);
    });

    it('rec.X = rec.X is a no-op: not dirty, and every held reference stays attached', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        const held = rec.ConfigObject!.Items[0];
        rec.ConfigObject = rec.ConfigObject;
        expect(isDirty(rec)).toBe(false);
        held.Rate = 0.75;                // still live
        expect(JSON.parse(rec.Config!).Items[0].Rate).toBe(0.75);
        expect(rec.ConfigObject!.Items[0]).toBe(held);
    });

    it('held NESTED references stay live after the root proxy is reassigned (with pending edits flushed)', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        const cfg = rec.ConfigObject!;
        const nested = cfg.Limits!;
        cfg.Pct = 30;
        rec.ConfigObject = cfg;
        nested.Max = 9;
        expect(JSON.parse(rec.Config!)).toMatchObject({ Pct: 30, Limits: { Max: 9 } });
    });

    it('assigning a NESTED proxy as the new root stores an independent COPY; the old document detaches', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        const oldRoot = rec.ConfigObject!;
        const child = oldRoot.Limits!;
        (rec as unknown as { ConfigObject: unknown }).ConfigObject = child; // rec.X = rec.X.Child
        expect(JSON.parse(rec.Config!)).toEqual({ Max: 3 });
        const newRoot = rec.ConfigObject as unknown as { Max: number };
        newRoot.Max = 4;
        expect(child.Max).toBe(3);        // copy, not aliased
        expect(() => { oldRoot.Pct = 1; }).toThrow();
    });

    it('assigning a proxy from ANOTHER record copies it', async () => {
        const a = await loaded(ConfigEntity, JSON.stringify(BASE));
        const b = await loaded(ConfigEntity, JSON.stringify({ Pct: 2, Items: [] }));
        b.ConfigObject = a.ConfigObject;
        b.ConfigObject!.Pct = 44;
        expect(a.ConfigObject!.Pct).toBe(10);
        expect(JSON.parse(b.Config!).Pct).toBe(44);
    });
});

describe('ValidateJSONField called directly', () => {
    it('flushes BEFORE the dirty check, so a field changed only via an un-proxied reference is validated', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify(BASE));
        void rec.ConfigObject;            // materialize
        const mine: IConfig = { ...BASE, Items: [...BASE.Items], Limits: { Max: 3 } };
        rec.ConfigObject = mine;          // same content as the loaded row: not dirty
        expect(isDirty(rec)).toBe(false);
        mine.Pct = 200;                   // un-proxied edit: invisible until flushed
        const result = new ValidationResult();
        result.Success = true;
        rec.CheckDirect(result);          // NOT via Validate()
        expect(result.Errors.some((e) => e.Source === 'Config.Pct')).toBe(true);
        expect(isDirty(rec)).toBe(true);
    });
});

describe('ValidateJSONField', () => {
    const valid = () => JSON.stringify({ Pct: 10, Items: [{ Name: 'a', Rate: 0.5 }] });

    it('passes a valid document', async () => {
        const rec = await loaded(ConfigEntity, valid());
        rec.ConfigObject!.Pct = 12;
        const result = rec.Validate();
        expect(result.Errors).toEqual([]);
        expect(result.Success).toBe(true);
    });

    it('maps Zod issues to dotted/indexed path sources', async () => {
        const rec = await loaded(ConfigEntity, valid());
        rec.Config = JSON.stringify({ Pct: 10, Items: [{ Name: 'a', Rate: 0.5 }, { Name: 'b', Rate: 2 }, { Name: '', Rate: 0 }] });
        const result = rec.Validate();
        expect(result.Success).toBe(false);
        expect(result.Errors.map((e) => e.Source).sort()).toEqual(['Config.Items[1].Rate', 'Config.Items[2].Name']);
        const rate = result.Errors.find((e) => e.Source === 'Config.Items[1].Rate')!;
        expect(rate.Value).toBe(2);
        expect(rate.Type).toBe(ValidationErrorType.Failure);
    });

    it('runs interface-, property- (per element) and element-scoped rules and reports element paths', async () => {
        const rec = await loaded(ConfigEntity, valid());
        rec.Config = JSON.stringify({ Pct: 11, Items: [{ Name: 'free', Rate: 0.5 }, { Name: 'ok', Rate: 0.1 }] });
        const result = rec.Validate();
        expect(result.Success).toBe(false);
        const sources = result.Errors.map((e) => `${e.Source}|${e.Message}`).sort();
        expect(sources).toEqual([
            'Config.Items[0]|Rate must be zero when Name is "free"',
            'Config|Pct must be even',
        ]);
    });

    it('does not run rules while the structure is invalid', async () => {
        const rec = await loaded(ConfigEntity, valid());
        rec.Config = JSON.stringify({ Pct: 'nope', Items: [] });
        const result = rec.Validate();
        expect(result.Errors.map((e) => e.Source)).toEqual(['Config.Pct']);
    });

    it('a rule that throws is reported, not swallowed', async () => {
        const rec = await loaded(ConfigEntity, valid());
        const boom: JSONFieldRuleSet = { RootType: 'IConfig', RootIsArray: false, Graph: {}, Rules: [{ Type: 'IConfig', Description: 'explodes', Test: () => { throw new Error('bang'); } }] };
        const result = new ValidationResult();
        result.Success = true;
        const arr = new ArrayRootEntity(info, provider.Provider);
        arr.Set('Config', valid());
        arr.Check(z.any(), boom, result);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Message).toContain('bang');
        void rec;
    });

    it('Warning severity reports Warning-typed errors and does not fail the save', async () => {
        const rec = await loaded(ConfigEntity, valid());
        rec.Severity = 'Warning';
        rec.Config = JSON.stringify({ Pct: 500, Items: [] });
        const result = rec.Validate();
        expect(result.Errors[0].Type).toBe(ValidationErrorType.Warning);
        expect(result.Success).toBe(true);
        expect(await rec.Save()).toBe(true);
    });

    it('validates only when the field is dirty (an untouched invalid legacy row still saves other edits)', async () => {
        const rec = await loaded(ConfigEntity, JSON.stringify({ Pct: 500, Items: [] }));
        rec.Set('Name', 'Renamed');
        expect(rec.Validate().Success).toBe(true);
        rec.ConfigObject!.Pct = 501; // now the field is dirty -> checked
        expect(rec.Validate().Success).toBe(false);
    });

    it('validates a brand-new record even though nothing is "dirty" against an old value', () => {
        const rec = new ConfigEntity(info, provider.Provider);
        rec.Set('Name', 'New');
        rec.Config = JSON.stringify({ Pct: 500, Items: [] });
        expect(rec.Validate().Success).toBe(false);
    });

    it('reports invalid JSON text once and skips shape/rule checks', async () => {
        const rec = await loaded(ConfigEntity, valid());
        rec.Config = '{oops';
        const result = rec.Validate();
        const jsonErrors = result.Errors.filter((e) => e.Source === 'Config' && /valid JSON/.test(e.Message));
        expect(jsonErrors).toHaveLength(1);
        expect(result.Errors.every((e) => e.Source === 'Config')).toBe(true);
    });

    it('skips null and empty values', async () => {
        const rec = await loaded(ConfigEntity, valid());
        rec.Config = null;
        expect(rec.Validate().Errors).toEqual([]);
        rec.Config = '';
        expect(rec.Validate().Errors).toEqual([]);
    });

    it('validates array roots and prefixes element indexes', () => {
        const rec = new ArrayRootEntity(info, provider.Provider);
        rec.Set('Config', JSON.stringify([{ Name: 'a', Rate: 5 }]));
        const result = new ValidationResult();
        result.Success = true;
        rec.Check(z.array(ItemSchema), null, result);
        expect(result.Errors.map((e) => e.Source)).toEqual(['Config[0].Rate']);
    });

    it('applies array-root rules to each element', () => {
        const rec = new ArrayRootEntity(info, provider.Provider);
        rec.Set('Config', JSON.stringify([{ Name: 'free', Rate: 1 }, { Name: 'x', Rate: 0 }]));
        const set: JSONFieldRuleSet = {
            RootType: 'IItem', RootIsArray: true, Graph: {},
            Rules: [{ Type: 'IItem', Description: 'free means zero', Test: (v: IItem) => v.Name !== 'free' || v.Rate === 0 }],
        };
        const result = new ValidationResult();
        result.Success = true;
        rec.Check(z.array(ItemSchema), set, result);
        expect(result.Errors.map((e) => e.Source)).toEqual(['Config[0]']);
    });
});
