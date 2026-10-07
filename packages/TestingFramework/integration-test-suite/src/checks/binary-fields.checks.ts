/**
 * binary-fields.checks.ts — the 'binary-fields' bundle (BF1–BF6, IT101): binary (varbinary / bytea)
 * fields end to end, and the binary vector columns that ride on them.
 *
 * THE CONTRACT UNDER TEST. A binary field's value is a **base64 string** everywhere above the
 * database: in `BaseEntity`, in every cache, in RunView results and on the GraphQL wire. Providers
 * convert at the DB boundary (rows read → base64; base64 saved → bytes). RunView **omits** binary
 * fields unless the caller sets `IncludeBinaryFields: true` or names a binary field in `Fields`; a
 * single-record `Load()` always includes them. See guides/BINARY_FIELDS_GUIDE.md.
 *
 * TRANSPORT: **CLIENT-FIRST.** Run over `GraphQLDataProvider`, every check proves the whole chain —
 * client BaseEntity → base64 in the mutation → resolver → provider hex/bytea binding → SQL → the
 * returned row → provider base64 → JSON → client — which is exactly where an encoding bug (a Buffer
 * serialized as `{type:'Buffer',data:[...]}`, a `varbinary(1)` declaration truncating the value,
 * a field silently dropped from the query) would surface. Server transport runs the same checks
 * against the database provider directly.
 *
 *   - BF1  Metadata: the seven binary vector companion columns exist, are binary, and sit beside
 *          their JSON column.
 *   - BF2  Selection: RunView omits binary fields by default, includes them on request or when a
 *          binary field is named in Fields, and the two shapes never share a cache entry.
 *   - BF3  Stored vectors: every persisted binary vector decodes to whole, finite float32 values and
 *          agrees with its JSON companion to float32 precision.
 *   - BF4  Byte fidelity (mutation): all 256 byte values survive create → Load → RunView → update →
 *          clear, byte for byte.
 *   - BF5  Validation: a non-base64 value is refused before any INSERT, with a message naming base64.
 *   - BF6  Vector round trip (mutation): a 1,536-dimension float32 vector saved as binary reads back
 *          bit-identical, through a RunView that only NAMES the binary field.
 *
 * FIXTURES: BF4–BF6 write throwaway `MJ: Entity Record Documents` rows — the entity whose
 * `VectorBinary` column the vector pipeline actually uses — under an existing Entity Document and
 * Vector Index (seeded on every install; the checks skip loudly when none exist). Each row's RecordID
 * carries the run prefix and its DocumentText the "(mj-integration-test — safe to delete)" tag, and
 * each check deletes what it wrote in a finally block. No pre-existing record is ever modified.
 */
import { RunView } from '@memberjunction/core';
import type { BaseEntity, EntityInfo, IMetadataProvider, RunViewParams } from '@memberjunction/core';
import {
    Base64ToBytes, Base64ToFloat32Vector, BytesToBase64, Float32VectorToBase64, IsValidBase64,
} from '@memberjunction/global';
import type { MJEntityRecordDocumentEntity } from '@memberjunction/core-entities';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const ERD_ENTITY = 'MJ: Entity Record Documents';
const BINARY_FIELD = 'VectorBinary';
const FIXTURE_TAG = '(mj-integration-test — safe to delete)';
const ROWS_PER_SURFACE = 100;

/** One persisted embedding: an entity, its JSON vector column and its binary companion. */
interface VectorSurface {
    Entity: string;
    JsonField: string;
    BinaryField: string;
}

/** Every binary vector companion column shipped by V202610061614__v6.2.x__Binary_Vector_Columns. */
const VECTOR_SURFACES: readonly VectorSurface[] = [
    { Entity: 'MJ: Entity Record Documents', JsonField: 'VectorJSON', BinaryField: 'VectorBinary' },
    { Entity: 'MJ: AI Agent Notes', JsonField: 'EmbeddingVector', BinaryField: 'EmbeddingVectorBinary' },
    { Entity: 'MJ: AI Agent Examples', JsonField: 'EmbeddingVector', BinaryField: 'EmbeddingVectorBinary' },
    { Entity: 'MJ: Queries', JsonField: 'EmbeddingVector', BinaryField: 'EmbeddingVectorBinary' },
    { Entity: 'MJ: Tags', JsonField: 'EmbeddingVector', BinaryField: 'EmbeddingVectorBinary' },
    { Entity: 'MJ: Components', JsonField: 'FunctionalRequirementsVector', BinaryField: 'FunctionalRequirementsVectorBinary' },
    { Entity: 'MJ: Components', JsonField: 'TechnicalDesignVector', BinaryField: 'TechnicalDesignVectorBinary' },
];

/** Loud, uniform skip-as-pass note. */
function skipNote(checkId: string, reason: string): void {
    console.warn(`  ⚠ binary-fields.${checkId} SKIPPED — ${reason}`);
}

function rv(ctx: IntegrationCheckContext): RunView {
    return RunView.FromMetadataProvider(ctx.Provider);
}

function entityOrFail(provider: IMetadataProvider, name: string): EntityInfo {
    const entity = provider.EntityByName(name);
    Assert(entity != null, `entity '${name}' is not in metadata`);
    return entity!;
}

/** Runs a simple RunView and fails the check on a provider error (RunView never throws). */
async function runSimple<T>(ctx: IntegrationCheckContext, params: RunViewParams): Promise<T[]> {
    const result = await rv(ctx).RunView<T>({ ...params, ResultType: 'simple' }, ctx.User);
    Assert(result.Success, `RunView on '${params.EntityName}' failed: ${result.ErrorMessage}`);
    return result.Results ?? [];
}

/** The parents every fixture Entity Record Document hangs off — an existing Entity Document and Vector Index. */
interface ErdReferences {
    EntityID: string;
    EntityDocumentID: string;
    VectorIndexID: string;
}

/** Borrows an existing Entity Document and Vector Index as fixture parents, or null when the install has neither. */
async function findErdReferences(ctx: IntegrationCheckContext): Promise<ErdReferences | null> {
    const [docs, indexes] = await rv(ctx).RunViews([
        { EntityName: 'MJ: Entity Documents', Fields: ['ID', 'EntityID'], MaxRows: 1, ResultType: 'simple' },
        { EntityName: 'MJ: Vector Indexes', Fields: ['ID'], MaxRows: 1, ResultType: 'simple' },
    ], ctx.User);
    Assert(docs.Success && indexes.Success, `fixture parent lookup failed: ${docs.ErrorMessage || indexes.ErrorMessage}`);
    const doc = docs.Results[0] as { ID?: string; EntityID?: string } | undefined;
    const index = indexes.Results[0] as { ID?: string } | undefined;
    return doc?.ID && doc.EntityID && index?.ID ? { EntityID: doc.EntityID, EntityDocumentID: doc.ID, VectorIndexID: index.ID } : null;
}

/** Creates (but does not save) a tagged Entity Record Document carrying `vectorBinary`. */
async function newErdRow(
    ctx: IntegrationCheckContext, refs: ErdReferences, label: string, vectorBinary: string | null,
): Promise<MJEntityRecordDocumentEntity> {
    const row = await ctx.Provider.GetEntityObject<MJEntityRecordDocumentEntity>(ERD_ENTITY, ctx.User);
    row.NewRecord();
    row.EntityID = refs.EntityID;
    row.EntityDocumentID = refs.EntityDocumentID;
    row.VectorIndexID = refs.VectorIndexID;
    row.RecordID = `mj-it101-${Date.now()}-${label}`;
    row.DocumentText = `binary-fields fixture ${FIXTURE_TAG}`;
    row.EntityRecordUpdatedAt = new Date();
    row.VectorBinary = vectorBinary;
    return row;
}

/** Saves `row`, failing the check with the provider's complete message on refusal. */
async function saveOrFail(row: BaseEntity, what: string): Promise<void> {
    const saved = await row.Save();
    Assert(saved, `${what}: Save() failed — ${row.LatestResult?.CompleteMessage ?? 'no message'}`);
}

/** Best-effort fixture removal; logs rather than throws so a check failure still reports first. */
async function deleteQuietly(row: BaseEntity | null): Promise<void> {
    if (!row || !row.IsSaved) return;
    const deleted = await row.Delete();
    if (!deleted) {
        console.warn(`  ⚠ binary-fields: could not delete fixture row ${row.PrimaryKey.ToString()}: ${row.LatestResult?.CompleteMessage}`);
    }
}

/** Reloads a fixture row by id through a fresh entity object (the Load path, not the save echo). */
async function reload(ctx: IntegrationCheckContext, id: string): Promise<MJEntityRecordDocumentEntity> {
    const fresh = await ctx.Provider.GetEntityObject<MJEntityRecordDocumentEntity>(ERD_ENTITY, ctx.User);
    const loaded = await fresh.Load(id);
    Assert(loaded, `Load(${id}) failed: ${fresh.LatestResult?.CompleteMessage ?? 'no message'}`);
    return fresh;
}

/** Reads one fixture row's binary field through RunView, asking for binary fields explicitly. */
async function readBinaryViaRunView(ctx: IntegrationCheckContext, id: string): Promise<string | null | undefined> {
    const rows = await runSimple<{ ID: string; VectorBinary?: string | null }>(ctx, {
        EntityName: ERD_ENTITY,
        ExtraFilter: `ID='${id}'`,
        IncludeBinaryFields: true,
        BypassCache: true,
    });
    AssertEqual(rows.length, 1, `RunView for fixture ${id} row count`);
    return rows[0].VectorBinary;
}

function assertSameBytes(actual: string | null | undefined, expected: Uint8Array, where: string): void {
    Assert(typeof actual === 'string', `${where}: expected a base64 string, got ${actual === null ? 'null' : typeof actual}`);
    Assert(IsValidBase64(actual!), `${where}: value is not valid base64 (${actual!.slice(0, 40)}…)`);
    const bytes = Base64ToBytes(actual!);
    AssertEqual(bytes.length, expected.length, `${where}: byte length`);
    for (let i = 0; i < expected.length; i++) {
        Assert(bytes[i] === expected[i], `${where}: byte ${i} is ${bytes[i]}, expected ${expected[i]}`);
    }
}

/** Every value 0–255, then the run in reverse — catches sign, UTF-8 and truncation bugs alike. */
function allByteValues(): Uint8Array {
    const bytes = new Uint8Array(512);
    for (let i = 0; i < 256; i++) {
        bytes[i] = i;
        bytes[511 - i] = i;
    }
    return bytes;
}

export const BinaryFieldsChecks: NamedCheck[] = [
    {
        Id: 'binary-fields.BF1',
        Name: 'BF1: the seven binary vector companion columns exist, are binary, and sit beside their JSON vector column',
        Fn: async (ctx): Promise<void> => {
            const problems: string[] = [];
            for (const surface of VECTOR_SURFACES) {
                const entity = entityOrFail(ctx.Provider, surface.Entity);
                const binary = entity.Fields.find(f => f.Name === surface.BinaryField);
                const json = entity.Fields.find(f => f.Name === surface.JsonField);
                if (!binary) { problems.push(`${surface.Entity}.${surface.BinaryField} missing`); continue; }
                if (!json) problems.push(`${surface.Entity}.${surface.JsonField} (JSON companion) missing`);
                if (!binary.IsBinaryFieldType) problems.push(`${surface.Entity}.${surface.BinaryField} has non-binary type '${binary.Type}'`);
                if (!binary.AllowsNull) problems.push(`${surface.Entity}.${surface.BinaryField} must be nullable (rows written before it existed)`);
                if (!entity.BinaryFields.some(f => f.Name === surface.BinaryField)) {
                    problems.push(`${surface.Entity}.BinaryFields does not list ${surface.BinaryField}`);
                }
            }
            Assert(problems.length === 0, `binary vector column metadata: ${problems.join('; ')}`);
            console.log(`      → ${VECTOR_SURFACES.length} binary vector companion column(s) present and typed binary`);
        },
    },
    {
        Id: 'binary-fields.BF2',
        Name: 'BF2: RunView omits binary fields by default, includes them on request or when named in Fields, and never shares a cache entry between the two shapes',
        Fn: async (ctx): Promise<void> => {
            const entityName = 'MJ: Entity Record Documents';
            const probe = { EntityName: entityName, MaxRows: 3, CacheLocal: true } satisfies RunViewParams;
            // Default → with flag → default again: the third read must not be served the flagged rows.
            const before = await runSimple<Record<string, unknown>>(ctx, probe);
            const flagged = await runSimple<Record<string, unknown>>(ctx, { ...probe, IncludeBinaryFields: true });
            const after = await runSimple<Record<string, unknown>>(ctx, probe);
            const named = await runSimple<Record<string, unknown>>(ctx, { EntityName: entityName, MaxRows: 3, Fields: ['ID', 'VectorBinary'] });

            if (before.length === 0) {
                skipNote('BF2', `'${entityName}' has no rows — key presence cannot be observed (empty result shape trivially agrees)`);
                return;
            }
            for (const [label, rows] of [['default', before], ['default after a flagged read', after]] as const) {
                Assert(rows.every(r => !('VectorBinary' in r)), `${label}: a binary field was returned without being asked for`);
            }
            Assert(flagged.every(r => 'VectorBinary' in r), 'IncludeBinaryFields: true did not return VectorBinary');
            Assert(named.every(r => 'VectorBinary' in r), 'naming VectorBinary in Fields did not return it');
            for (const r of [...flagged, ...named]) {
                const value = r['VectorBinary'];
                Assert(value === null || (typeof value === 'string' && IsValidBase64(value)),
                    `VectorBinary must arrive as base64 or null, got ${typeof value}`);
            }
            console.log(`      → ${before.length} row(s): omitted by default, present when flagged or named, no cache bleed`);
        },
    },
    {
        Id: 'binary-fields.BF3',
        Name: 'BF3: every persisted binary vector decodes to whole finite float32 values and agrees with its JSON companion',
        Fn: async (ctx): Promise<void> => {
            let checked = 0;
            const problems: string[] = [];
            for (const surface of VECTOR_SURFACES) {
                const rows = await runSimple<Record<string, unknown>>(ctx, {
                    EntityName: surface.Entity,
                    Fields: ['ID', surface.JsonField, surface.BinaryField],
                    ExtraFilter: `${surface.BinaryField} IS NOT NULL`,
                    MaxRows: ROWS_PER_SURFACE,
                });
                for (const row of rows) {
                    checked++;
                    problems.push(...compareStoredVector(surface, row));
                }
            }
            if (checked === 0) {
                skipNote('BF3', 'no row holds a binary vector yet — nothing has been embedded since the binary columns were added');
                return;
            }
            Assert(problems.length === 0, `stored binary vectors: ${problems.slice(0, 10).join('; ')}${problems.length > 10 ? ` … (+${problems.length - 10})` : ''}`);
            console.log(`      → ${checked} stored binary vector(s) decode cleanly and match their JSON companion`);
        },
    },
    {
        Id: 'binary-fields.BF4',
        Name: 'BF4: all 256 byte values survive create → Load → RunView → update → clear, byte for byte',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const refs = await findErdReferences(ctx);
            if (!refs) { skipNote('BF4', 'no Entity Document or Vector Index to hang a fixture row off'); return; }
            const original = allByteValues();
            const replacement = original.slice().reverse().map(b => b ^ 0x5a);
            let row: MJEntityRecordDocumentEntity | null = null;
            try {
                row = await newErdRow(ctx, refs, 'bf4', BytesToBase64(original));
                await saveOrFail(row, 'create');
                assertSameBytes(row.VectorBinary, original, 'save echo');
                assertSameBytes((await reload(ctx, row.ID)).VectorBinary, original, 'Load()');
                assertSameBytes(await readBinaryViaRunView(ctx, row.ID), original, 'RunView');
                // The same row through a default RunView: the binary field must be absent, not null.
                const plain = await runSimple<Record<string, unknown>>(ctx, { EntityName: ERD_ENTITY, ExtraFilter: `ID='${row.ID}'`, BypassCache: true });
                AssertEqual(plain.length, 1, 'default RunView row count');
                Assert(!(BINARY_FIELD in plain[0]), 'a default RunView returned the binary field');

                row.VectorBinary = BytesToBase64(replacement);
                await saveOrFail(row, 'update');
                assertSameBytes((await reload(ctx, row.ID)).VectorBinary, replacement, 'Load() after update');

                row.VectorBinary = null;
                await saveOrFail(row, 'clear');
                AssertEqual((await reload(ctx, row.ID)).VectorBinary, null, 'cleared binary field reads back as null');
            } finally {
                await deleteQuietly(row);
            }
        },
    },
    {
        Id: 'binary-fields.BF5',
        Name: 'BF5: a non-base64 value in a binary field is refused before any INSERT, naming base64',
        Fn: async (ctx): Promise<void> => {
            const refs = await findErdReferences(ctx);
            if (!refs) { skipNote('BF5', 'no Entity Document or Vector Index to hang a fixture row off'); return; }
            const row = await newErdRow(ctx, refs, 'bf5', 'this is not base64!');
            try {
                const saved = await row.Save();
                Assert(!saved, 'a non-base64 binary value was accepted');
                const message = row.LatestResult?.CompleteMessage ?? '';
                Assert(/base64/i.test(message), `refusal message does not mention base64: "${message}"`);
                Assert(!row.IsSaved, 'the refused row reports itself as saved');
            } finally {
                await deleteQuietly(row); // only reached if validation regressed and the row was written
            }
        },
    },
    {
        Id: 'binary-fields.BF6',
        Name: 'BF6: a 1,536-dimension float32 vector saved as binary reads back bit-identical through a RunView that only names the field',
        RequiresMutation: true,
        Fn: async (ctx): Promise<void> => {
            const refs = await findErdReferences(ctx);
            if (!refs) { skipNote('BF6', 'no Entity Document or Vector Index to hang a fixture row off'); return; }
            const source = Array.from({ length: 1536 }, (_, i) => Math.sin(i * 0.37) / (1 + (i % 7)));
            const expected = Float32Array.from(source);
            let row: MJEntityRecordDocumentEntity | null = null;
            try {
                row = await newErdRow(ctx, refs, 'bf6', Float32VectorToBase64(source));
                await saveOrFail(row, 'create');
                const rows = await runSimple<{ ID: string; VectorBinary: string | null }>(ctx, {
                    EntityName: ERD_ENTITY,
                    Fields: ['ID', BINARY_FIELD], // naming the binary field is enough — no IncludeBinaryFields
                    ExtraFilter: `ID='${row.ID}'`,
                    BypassCache: true,
                });
                AssertEqual(rows.length, 1, 'fixture row count');
                const decoded = Base64ToFloat32Vector(rows[0].VectorBinary);
                Assert(decoded != null, 'the stored vector did not decode as float32');
                AssertEqual(decoded!.length, expected.length, 'dimension count');
                for (let i = 0; i < expected.length; i++) {
                    Assert(Object.is(decoded![i], expected[i]), `dimension ${i}: ${decoded![i]} !== ${expected[i]}`);
                }
            } finally {
                await deleteQuietly(row);
            }
        },
    },
];

/** Compares one row's binary vector with its JSON companion; returns problems (empty when consistent). */
function compareStoredVector(surface: VectorSurface, row: Record<string, unknown>): string[] {
    const where = `${surface.Entity}[${String(row['ID'])}].${surface.BinaryField}`;
    const binary = row[surface.BinaryField];
    if (typeof binary !== 'string') return [`${where}: arrived as ${typeof binary}, not base64`];
    const vector = Base64ToFloat32Vector(binary);
    if (!vector) return [`${where}: not whole float32 values`];
    if (vector.length === 0) return [`${where}: empty vector`];
    if (!vector.every(Number.isFinite)) return [`${where}: holds a non-finite value`];
    const json = row[surface.JsonField];
    if (typeof json !== 'string' || json.length === 0) return []; // binary-only row: nothing to compare
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch { return [`${where}: JSON companion does not parse`]; }
    if (!Array.isArray(parsed) || parsed.length !== vector.length) {
        return [`${where}: ${vector.length} dims vs JSON ${Array.isArray(parsed) ? parsed.length : 'non-array'}`];
    }
    for (let i = 0; i < vector.length; i++) {
        if (Math.fround(Number(parsed[i])) !== vector[i]) return [`${where}: dimension ${i} disagrees with the JSON companion`];
    }
    return [];
}

for (const check of BinaryFieldsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
