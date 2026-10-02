/**
 * Binary fields — engine config resolution and BaseEntity embedding generation.
 *
 *   - BaseEngine resolves `IncludeBinaryFields: true | 'DatabaseProviderOnly'` against the
 *     provider it is bound to, and passes the resolved boolean to RunView.
 *   - BaseEntity.GenerateEmbedding* writes a binary companion of the JSON vector field as
 *     base64 of little-endian float32 bytes, and clears both together.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Base64ToFloat32Vector, Float32VectorToBase64 } from '@memberjunction/global';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { BaseEntity, EntityField } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { UserInfo } from '../generic/securityInfo';
import { IMetadataProvider, ProviderType, SimpleEmbeddingResult } from '../generic/interfaces';
import { RunViewParams } from '../views/runView';

/* ------------------------------------------------------------------------------------------ */
/* BaseEngine                                                                                  */
/* ------------------------------------------------------------------------------------------ */

class BinaryTestEngine extends BaseEngine<BinaryTestEngine> {
    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo, _provider?: IMetadataProvider): Promise<void> {
        // no-op: these tests exercise param construction only
    }
    public ResolveForTest(config: BaseEnginePropertyConfig): boolean {
        return this.ResolveConfigIncludeBinaryFields(config);
    }
    public BuildForTest(config: BaseEnginePropertyConfig, bypassCache = false): RunViewParams {
        return this.BuildRunViewParamsForConfig(config, bypassCache);
    }
    /** Binds a provider the same way Config() does on first call (first-wins). */
    public BindProviderForTest(provider: IMetadataProvider | null): void {
        (this as unknown as { _provider: IMetadataProvider | null })._provider = provider;
    }
}

function fakeProvider(type: ProviderType | undefined): IMetadataProvider {
    return { ProviderType: type } as unknown as IMetadataProvider;
}

function config(include?: boolean | 'DatabaseProviderOnly'): BaseEnginePropertyConfig {
    return new BaseEnginePropertyConfig({ PropertyName: '_docs', EntityName: 'Documents', IncludeBinaryFields: include });
}

describe('BaseEngine.ResolveConfigIncludeBinaryFields', () => {
    let engine: BinaryTestEngine;
    let savedGlobal: IMetadataProvider;

    beforeEach(() => {
        engine = new BinaryTestEngine();
    });

    beforeAll(() => {
        savedGlobal = Metadata.Provider;
    });

    afterAll(() => {
        Metadata.Provider = savedGlobal;
    });

    it('resolves "DatabaseProviderOnly" to true on a database provider', () => {
        engine.BindProviderForTest(fakeProvider(ProviderType.Database));
        expect(engine.ResolveForTest(config('DatabaseProviderOnly'))).toBe(true);
    });

    it('resolves "DatabaseProviderOnly" to false on a network provider', () => {
        engine.BindProviderForTest(fakeProvider(ProviderType.Network));
        expect(engine.ResolveForTest(config('DatabaseProviderOnly'))).toBe(false);
    });

    it('resolves "DatabaseProviderOnly" to false when the provider reports no type', () => {
        engine.BindProviderForTest(fakeProvider(undefined));
        expect(engine.ResolveForTest(config('DatabaseProviderOnly'))).toBe(false);
    });

    it('resolves "DatabaseProviderOnly" to false when there is no provider at all', () => {
        engine.BindProviderForTest(null);
        Metadata.Provider = null as unknown as IMetadataProvider;
        expect(engine.ResolveForTest(config('DatabaseProviderOnly'))).toBe(false);
        Metadata.Provider = savedGlobal;
    });

    it('falls back to the global provider when the engine has none bound', () => {
        engine.BindProviderForTest(null);
        Metadata.Provider = fakeProvider(ProviderType.Database);
        expect(engine.ResolveForTest(config('DatabaseProviderOnly'))).toBe(true);
        Metadata.Provider = fakeProvider(ProviderType.Network);
        expect(engine.ResolveForTest(config('DatabaseProviderOnly'))).toBe(false);
        Metadata.Provider = savedGlobal;
    });

    it.each([ProviderType.Database, ProviderType.Network])('resolves true to true on a %s provider', type => {
        engine.BindProviderForTest(fakeProvider(type));
        expect(engine.ResolveForTest(config(true))).toBe(true);
    });

    it.each([ProviderType.Database, ProviderType.Network])('resolves false and undefined to false on a %s provider', type => {
        engine.BindProviderForTest(fakeProvider(type));
        expect(engine.ResolveForTest(config(false))).toBe(false);
        expect(engine.ResolveForTest(config(undefined))).toBe(false);
    });

    it('keeps the raw config value untouched', () => {
        engine.BindProviderForTest(fakeProvider(ProviderType.Network));
        const c = config('DatabaseProviderOnly');
        engine.ResolveForTest(c);
        expect(c.IncludeBinaryFields).toBe('DatabaseProviderOnly');
    });
});

describe('BaseEngine.BuildRunViewParamsForConfig and IncludeBinaryFields', () => {
    let engine: BinaryTestEngine;

    beforeEach(() => {
        engine = new BinaryTestEngine();
    });

    it('passes the resolved boolean, never the "DatabaseProviderOnly" string', () => {
        engine.BindProviderForTest(fakeProvider(ProviderType.Database));
        expect(engine.BuildForTest(config('DatabaseProviderOnly')).IncludeBinaryFields).toBe(true);

        const networkEngine = new BinaryTestEngine();
        networkEngine.BindProviderForTest(fakeProvider(ProviderType.Network));
        expect(networkEngine.BuildForTest(config('DatabaseProviderOnly')).IncludeBinaryFields).toBeUndefined();
    });

    it('passes true through and leaves the key out for unset/false, so the default request shape is unchanged', () => {
        engine.BindProviderForTest(fakeProvider(ProviderType.Network));
        expect(engine.BuildForTest(config(true)).IncludeBinaryFields).toBe(true);
        // Not `false`: a network provider forwards any key that is set, and an older server
        // rejects an input field it does not know. Absent means "as before".
        expect('IncludeBinaryFields' in engine.BuildForTest(config(false))).toBe(false);
        expect('IncludeBinaryFields' in engine.BuildForTest(config())).toBe(false);
    });

    it('produces identical params on every call, independent of bypassCache, so fingerprints stay stable', () => {
        engine.BindProviderForTest(fakeProvider(ProviderType.Database));
        const c = config('DatabaseProviderOnly');
        const a = engine.BuildForTest(c);
        const b = engine.BuildForTest(c, true);
        expect(a.IncludeBinaryFields).toBe(b.IncludeBinaryFields);
        expect(RunViewParams.Equals(a, engine.BuildForTest(c))).toBe(true);
    });

    it('uses the resolver, so a subclass override is honoured', () => {
        class OverridingEngine extends BinaryTestEngine {
            protected override ResolveConfigIncludeBinaryFields(): boolean { return true; }
        }
        const overriding = new OverridingEngine();
        overriding.BindProviderForTest(fakeProvider(ProviderType.Network));
        expect(overriding.BuildForTest(config()).IncludeBinaryFields).toBe(true);
    });
});

/* ------------------------------------------------------------------------------------------ */
/* BaseEntity.GenerateEmbedding*                                                               */
/* ------------------------------------------------------------------------------------------ */

const ENTITY_ID = 'entity-embedded-docs';

function embeddedDocsInit(): Record<string, unknown> {
    const f = (id: string, seq: number, name: string, extra: Record<string, unknown>) => ({
        ID: id, EntityID: ENTITY_ID, Sequence: seq, Name: name, Entity: 'Embedded Docs', AllowsNull: true, AllowUpdateAPI: true, ...extra,
    });
    return {
        ID: ENTITY_ID,
        Name: 'Embedded Docs',
        SchemaName: 'dbo',
        BaseTable: 'EmbeddedDoc',
        BaseView: 'vwEmbeddedDocs',
        IncludeInAPI: true,
        AllowUpdateAPI: true,
        AllowCreateAPI: true,
        Fields: [
            { ID: 'e-id', EntityID: ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'Embedded Docs', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false },
            f('e-text', 2, 'Body', { Type: 'nvarchar', Length: -1 }),
            f('e-json', 3, 'BodyVector', { Type: 'nvarchar', Length: -1 }),
            f('e-bin', 4, 'BodyVectorBinary', { Type: 'varbinary', Length: -1 }),
            f('e-model', 5, 'BodyModelID', { Type: 'uniqueidentifier' }),
            f('e-text2', 6, 'Title', { Type: 'nvarchar', Length: 200 }),
            f('e-json2', 7, 'TitleVector', { Type: 'nvarchar', Length: -1 }),
            f('e-bin2', 8, 'TitleVectorBinary', { Type: 'varbinary', Length: -1 }),
            f('e-model2', 9, 'TitleModelID', { Type: 'uniqueidentifier' }),
        ],
    };
}

const VECTOR = [0.5, -1.25, 3, 0.1];
const MODEL_ID = 'model-abc';

/** Exposes the protected embedding API and replaces the embedding model with a recorder. */
class EmbeddingTestEntity extends BaseEntity {
    public EmbedCalls: string[] = [];
    public NextResult: SimpleEmbeddingResult | null | Error = { vector: VECTOR, modelID: MODEL_ID };

    protected override async EmbedTextLocal(textToEmbed: string): Promise<SimpleEmbeddingResult> {
        this.EmbedCalls.push(textToEmbed);
        if (this.NextResult instanceof Error) throw this.NextResult;
        return this.NextResult as SimpleEmbeddingResult;
    }
    public override SupportsEmbedTextLocal(): boolean { return true; }

    public Embed(field: EntityField, vector: EntityField, model: EntityField, binary?: EntityField): Promise<boolean> {
        return this.GenerateEmbedding(field, vector, model, binary);
    }
    public EmbedByName(field: string, vector: string, model: string, binary?: string): Promise<boolean> {
        return this.GenerateEmbeddingByFieldName(field, vector, model, binary);
    }
    public EmbedManyByName(fields: Array<{ fieldName: string; vectorFieldName: string; modelFieldName: string; binaryVectorFieldName?: string }>): Promise<boolean> {
        return this.GenerateEmbeddingsByFieldName(fields);
    }
    public EmbedMany(fields: Array<{ field: EntityField; vectorField: EntityField; modelField: EntityField; binaryVectorField?: EntityField }>): Promise<boolean> {
        return this.GenerateEmbeddings(fields);
    }
    public F(name: string): EntityField {
        const field = this.GetFieldByName(name);
        if (!field) throw new Error(`test setup: no field ${name}`);
        return field;
    }
}

let entityInfo: EntityInfo;
let savedProvider: IMetadataProvider;

beforeAll(() => {
    entityInfo = new EntityInfo(embeddedDocsInit());
    savedProvider = Metadata.Provider;
    Metadata.Provider = {
        Entities: [entityInfo],
        CurrentUser: { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] },
    } as unknown as ProviderBase;
});

afterAll(() => {
    Metadata.Provider = savedProvider;
});

function newDoc(body: string | null, title: string | null = null): EmbeddingTestEntity {
    const doc = new EmbeddingTestEntity(entityInfo);
    doc.Set('Body', body);
    doc.Set('Title', title);
    return doc;
}

/** A record that looks loaded from the database: saved, every field clean. */
async function loadedDoc(values: Record<string, unknown>): Promise<EmbeddingTestEntity> {
    const doc = new EmbeddingTestEntity(entityInfo);
    await doc.LoadFromData({ ID: '11111111-1111-1111-1111-111111111111', ...values });
    return doc;
}

describe('BaseEntity.GenerateEmbedding with a binary vector field', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => { /* swallow expected error logs */ });
    });

    it('writes JSON, base64 float32 bytes and the model id from one EmbedTextLocal call', async () => {
        const doc = newDoc('hello world');
        const ok = await doc.Embed(doc.F('Body'), doc.F('BodyVector'), doc.F('BodyModelID'), doc.F('BodyVectorBinary'));
        expect(ok).toBe(true);
        expect(doc.EmbedCalls).toEqual(['hello world']);
        expect(doc.Get('BodyVector')).toBe(JSON.stringify(VECTOR));
        expect(doc.Get('BodyVectorBinary')).toBe(Float32VectorToBase64(VECTOR));
        expect(doc.Get('BodyModelID')).toBe(MODEL_ID);
    });

    it('stores a binary value that decodes back to the vector at single precision', async () => {
        const doc = newDoc('hello');
        await doc.Embed(doc.F('Body'), doc.F('BodyVector'), doc.F('BodyModelID'), doc.F('BodyVectorBinary'));
        const decoded = Base64ToFloat32Vector(doc.Get('BodyVectorBinary') as string);
        expect(Array.from(decoded ?? [])).toEqual(Array.from(Float32Array.from(VECTOR)));
    });

    it('stores a value the binary field validator accepts', async () => {
        const doc = newDoc('hello');
        await doc.Embed(doc.F('Body'), doc.F('BodyVector'), doc.F('BodyModelID'), doc.F('BodyVectorBinary'));
        expect(doc.F('BodyVectorBinary').Validate().Success).toBe(true);
    });

    it('leaves the binary field alone when no binary field is passed (previous behaviour)', async () => {
        const doc = newDoc('hello');
        doc.Set('BodyVectorBinary', 'AQID');
        const ok = await doc.Embed(doc.F('Body'), doc.F('BodyVector'), doc.F('BodyModelID'));
        expect(ok).toBe(true);
        expect(doc.Get('BodyVector')).toBe(JSON.stringify(VECTOR));
        expect(doc.Get('BodyVectorBinary')).toBe('AQID');
    });

    it.each([
        ['empty', ''],
        ['whitespace-only', '   '],
        ['null', null],
    ])('clears JSON, binary and model fields together when the text is %s', async (_label, text) => {
        const doc = newDoc(text);
        doc.Set('BodyVector', '[1]');
        doc.Set('BodyVectorBinary', 'AACAPw==');
        doc.Set('BodyModelID', 'old-model');
        const ok = await doc.Embed(doc.F('Body'), doc.F('BodyVector'), doc.F('BodyModelID'), doc.F('BodyVectorBinary'));
        expect(ok).toBe(true);
        expect(doc.EmbedCalls).toEqual([]);
        expect(doc.Get('BodyVector')).toBeNull();
        expect(doc.Get('BodyVectorBinary')).toBeNull();
        expect(doc.Get('BodyModelID')).toBeNull();
    });

    it('does not touch the binary field when the text is empty and no binary field is passed', async () => {
        const doc = newDoc('');
        doc.Set('BodyVectorBinary', 'AQID');
        await doc.Embed(doc.F('Body'), doc.F('BodyVector'), doc.F('BodyModelID'));
        expect(doc.Get('BodyVector')).toBeNull();
        expect(doc.Get('BodyVectorBinary')).toBe('AQID');
    });

    it('changes nothing when EmbedTextLocal returns no vector', async () => {
        const doc = newDoc('hello');
        doc.Set('BodyVector', '[1]');
        doc.Set('BodyVectorBinary', 'AACAPw==');
        doc.NextResult = null;
        expect(await doc.Embed(doc.F('Body'), doc.F('BodyVector'), doc.F('BodyModelID'), doc.F('BodyVectorBinary'))).toBe(true);
        expect(doc.Get('BodyVector')).toBe('[1]');
        expect(doc.Get('BodyVectorBinary')).toBe('AACAPw==');
    });

    it('returns false and leaves the fields unchanged when EmbedTextLocal throws', async () => {
        const doc = newDoc('hello');
        doc.Set('BodyVectorBinary', 'AACAPw==');
        doc.NextResult = new Error('model offline');
        expect(await doc.Embed(doc.F('Body'), doc.F('BodyVector'), doc.F('BodyModelID'), doc.F('BodyVectorBinary'))).toBe(false);
        expect(doc.Get('BodyVectorBinary')).toBe('AACAPw==');
    });

    it('short-circuits when SkipEmbeddings is set: no model call, no field changes', async () => {
        const doc = newDoc('hello');
        doc.SkipEmbeddings = true;
        const ok = await doc.Embed(doc.F('Body'), doc.F('BodyVector'), doc.F('BodyModelID'), doc.F('BodyVectorBinary'));
        expect(ok).toBe(true);
        expect(doc.EmbedCalls).toEqual([]);
        expect(doc.Get('BodyVector')).toBeNull();
        expect(doc.Get('BodyVectorBinary')).toBeNull();
    });

    it('short-circuits on SkipEmbeddings even when the text is empty, so existing vectors survive', async () => {
        const doc = newDoc('');
        doc.Set('BodyVectorBinary', 'AACAPw==');
        doc.SkipEmbeddings = true;
        await doc.Embed(doc.F('Body'), doc.F('BodyVector'), doc.F('BodyModelID'), doc.F('BodyVectorBinary'));
        expect(doc.Get('BodyVectorBinary')).toBe('AACAPw==');
    });

    it('skips a saved record whose source text is unchanged', async () => {
        const doc = await loadedDoc({ Body: 'hello', BodyVectorBinary: 'AACAPw==' });
        expect(doc.IsSaved).toBe(true);
        await doc.Embed(doc.F('Body'), doc.F('BodyVector'), doc.F('BodyModelID'), doc.F('BodyVectorBinary'));
        expect(doc.EmbedCalls).toEqual([]);
        expect(doc.Get('BodyVectorBinary')).toBe('AACAPw==');
    });

    it('re-embeds a saved record when the source text changes', async () => {
        const doc = await loadedDoc({ Body: 'hello', BodyVectorBinary: 'AACAPw==' });
        doc.Set('Body', 'changed');
        await doc.Embed(doc.F('Body'), doc.F('BodyVector'), doc.F('BodyModelID'), doc.F('BodyVectorBinary'));
        expect(doc.EmbedCalls).toEqual(['changed']);
        expect(doc.Get('BodyVectorBinary')).toBe(Float32VectorToBase64(VECTOR));
    });
});

describe('BaseEntity.GenerateEmbeddingByFieldName with a binary vector field', () => {
    it('resolves the binary field by name and writes it', async () => {
        const doc = newDoc('hello');
        expect(await doc.EmbedByName('Body', 'BodyVector', 'BodyModelID', 'BodyVectorBinary')).toBe(true);
        expect(doc.Get('BodyVectorBinary')).toBe(Float32VectorToBase64(VECTOR));
    });

    it('resolves the binary field name case-insensitively', async () => {
        const doc = newDoc('hello');
        await doc.EmbedByName('Body', 'BodyVector', 'BodyModelID', 'bodyvectorbinary');
        expect(doc.Get('BodyVectorBinary')).toBe(Float32VectorToBase64(VECTOR));
    });

    it('throws "Binary vector field not found" for an unknown binary field, before calling the model', async () => {
        const doc = newDoc('hello');
        await expect(doc.EmbedByName('Body', 'BodyVector', 'BodyModelID', 'NoSuchField'))
            .rejects.toThrow('Binary vector field not found: NoSuchField');
        expect(doc.EmbedCalls).toEqual([]);
        expect(doc.Get('BodyVector')).toBeNull();
    });

    it.each([
        ['undefined', undefined],
        ['empty', ''],
        ['whitespace', '   '],
    ])('treats a %s binary field name as omitted', async (_label, name) => {
        const doc = newDoc('hello');
        doc.Set('BodyVectorBinary', 'AQID');
        expect(await doc.EmbedByName('Body', 'BodyVector', 'BodyModelID', name)).toBe(true);
        expect(doc.Get('BodyVector')).toBe(JSON.stringify(VECTOR));
        expect(doc.Get('BodyVectorBinary')).toBe('AQID');
    });

    it('still reports the other missing fields first', async () => {
        const doc = newDoc('hello');
        await expect(doc.EmbedByName('Nope', 'BodyVector', 'BodyModelID', 'Missing')).rejects.toThrow('Field not found: Nope');
        await expect(doc.EmbedByName('Body', 'Nope', 'BodyModelID', 'Missing')).rejects.toThrow('Vector field not found: Nope');
    });

    it('clears the binary field by name when the text is empty', async () => {
        const doc = newDoc('');
        doc.Set('BodyVectorBinary', 'AQID');
        await doc.EmbedByName('Body', 'BodyVector', 'BodyModelID', 'BodyVectorBinary');
        expect(doc.Get('BodyVectorBinary')).toBeNull();
    });
});

describe('BaseEntity.GenerateEmbeddings / GenerateEmbeddingsByFieldName with binary vector fields', () => {
    it('writes every pair, including a mix of with and without binary companions', async () => {
        const doc = newDoc('body text', 'title text');
        doc.Set('TitleVectorBinary', 'AQID');
        const ok = await doc.EmbedManyByName([
            { fieldName: 'Body', vectorFieldName: 'BodyVector', modelFieldName: 'BodyModelID', binaryVectorFieldName: 'BodyVectorBinary' },
            { fieldName: 'Title', vectorFieldName: 'TitleVector', modelFieldName: 'TitleModelID' },
        ]);
        expect(ok).toBe(true);
        expect(doc.EmbedCalls.sort()).toEqual(['body text', 'title text']);
        expect(doc.Get('BodyVectorBinary')).toBe(Float32VectorToBase64(VECTOR));
        expect(doc.Get('TitleVector')).toBe(JSON.stringify(VECTOR));
        expect(doc.Get('TitleVectorBinary')).toBe('AQID');
    });

    it('rejects when any binary field name is unknown', async () => {
        const doc = newDoc('a', 'b');
        await expect(doc.EmbedManyByName([
            { fieldName: 'Body', vectorFieldName: 'BodyVector', modelFieldName: 'BodyModelID', binaryVectorFieldName: 'BodyVectorBinary' },
            { fieldName: 'Title', vectorFieldName: 'TitleVector', modelFieldName: 'TitleModelID', binaryVectorFieldName: 'Ghost' },
        ])).rejects.toThrow('Binary vector field not found: Ghost');
    });

    it('passes EntityField binary companions through GenerateEmbeddings', async () => {
        const doc = newDoc('body text', '');
        doc.Set('TitleVectorBinary', 'AQID');
        const ok = await doc.EmbedMany([
            { field: doc.F('Body'), vectorField: doc.F('BodyVector'), modelField: doc.F('BodyModelID'), binaryVectorField: doc.F('BodyVectorBinary') },
            { field: doc.F('Title'), vectorField: doc.F('TitleVector'), modelField: doc.F('TitleModelID'), binaryVectorField: doc.F('TitleVectorBinary') },
        ]);
        expect(ok).toBe(true);
        expect(doc.Get('BodyVectorBinary')).toBe(Float32VectorToBase64(VECTOR));
        expect(doc.Get('TitleVectorBinary')).toBeNull(); // empty title clears its companion
    });

    it('returns false when any embedding fails', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => { /* expected */ });
        const doc = newDoc('a', 'b');
        doc.NextResult = new Error('boom');
        const ok = await doc.EmbedMany([
            { field: doc.F('Body'), vectorField: doc.F('BodyVector'), modelField: doc.F('BodyModelID'), binaryVectorField: doc.F('BodyVectorBinary') },
        ]);
        expect(ok).toBe(false);
    });
});
