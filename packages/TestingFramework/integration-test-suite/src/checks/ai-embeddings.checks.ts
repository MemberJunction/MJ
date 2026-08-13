/**
 * ai-embeddings.checks.ts — the 'ai-embeddings' bundle (AE1–AE5): deterministic embedding seams
 * WITHOUT any model call, per test-catalog Domain 4 (the read-only siblings of the mutation-tier
 * AI6/AI14 persisted-embedding checks).
 *
 * TRANSPORT: **CLIENT-CAPABLE** (recommend client-first). Everything reads stored rows through
 * `RunView` and the `AIEngineBase` model catalog — no server-only surface, and deliberately NO
 * invocation of the LocalEmbedding provider (its first call downloads an ONNX model — a network
 * dependency the deterministic tier must never take).
 *
 * WHAT IS PINNED: the persisted-embedding pattern (guides/BASE_ENTITY_SERVER_PATTERNS.md) stores
 * vectors as JSON `number[]` strings with a stamped `EmbeddingModelID` across five entities
 * (AI Agent Notes / AI Agent Examples / Queries / Tags, plus the two vector pairs on Components).
 * These checks audit whatever vectors the deployment has: parseability + per-model dimensional
 * consistency (AE1), no zero/degenerate vectors + the unit-norm convention (AE2), cross-entity
 * dimensional agreement per model (AE3), model-reference integrity into the AI catalog (AE4),
 * and the LocalEmbeddings catalog shape the `EmbedTextLocal` chain requires (AE5).
 *
 * ANTI-VACUITY / DEGRADATION: embeddings are optional per deployment. Every data-dependent check
 * counts its subjects and SKIPS-AS-PASS LOUDLY when none exist ("skip loudly" per the catalog),
 * while shape legs that can always run (catalog probes) assert unconditionally. Zero mutation.
 */
import { RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/** One persisted-embedding surface: an entity + its vector column + the stamped model column. */
interface EmbeddingSource {
    Entity: string;
    VectorField: string;
    ModelField: string;
}

/** Every persisted-embedding surface shipped by the pattern (Components carries two pairs). */
const EMBEDDING_SOURCES: readonly EmbeddingSource[] = [
    { Entity: 'MJ: AI Agent Notes', VectorField: 'EmbeddingVector', ModelField: 'EmbeddingModelID' },
    { Entity: 'MJ: AI Agent Examples', VectorField: 'EmbeddingVector', ModelField: 'EmbeddingModelID' },
    { Entity: 'MJ: Queries', VectorField: 'EmbeddingVector', ModelField: 'EmbeddingModelID' },
    { Entity: 'MJ: Tags', VectorField: 'EmbeddingVector', ModelField: 'EmbeddingModelID' },
    { Entity: 'MJ: Components', VectorField: 'FunctionalRequirementsVector', ModelField: 'FunctionalRequirementsVectorEmbeddingModelID' },
    { Entity: 'MJ: Components', VectorField: 'TechnicalDesignVector', ModelField: 'TechnicalDesignVectorEmbeddingModelID' }
];

/** Cap per surface — enough to catch drift without scanning a large table. */
const MAX_ROWS_PER_SOURCE = 100;

/** A stored vector row, parsed once and shared by AE1–AE4. */
interface StoredVector {
    Entity: string;
    Field: string;
    Id: string;
    ModelId: string | null;
    Raw: string;
    /** Parsed vector; null when the payload is not a valid non-empty finite number[]. */
    Vector: number[] | null;
    ParseProblem?: string;
}

/** Loud, uniform skip-as-pass note. */
function skipNote(checkId: string, reason: string): void {
    console.warn(`  ⚠ ai-embeddings.${checkId} SKIPPED — ${reason}`);
}

/** Parse a persisted vector payload; returns null + reason when it is not a finite number[]. */
function parseVector(raw: string): { vector: number[] | null; problem?: string } {
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return { vector: null, problem: 'payload is not a JSON array' };
        }
        if (parsed.length === 0) {
            return { vector: null, problem: 'payload is an EMPTY array' };
        }
        for (const value of parsed) {
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                return { vector: null, problem: `non-finite/non-number element (${String(value)})` };
            }
        }
        return { vector: parsed as number[] };
    } catch (e) {
        return { vector: null, problem: `not valid JSON (${e instanceof Error ? e.message : String(e)})` };
    }
}

/** L2 norm. */
function l2Norm(vector: number[]): number {
    return Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
}

/** Per-process memo: the stored vectors are loaded once and shared by AE1–AE4. */
let storedVectorsMemo: StoredVector[] | undefined;

/** Load up to MAX_ROWS_PER_SOURCE persisted vectors from every embedding surface (read-only). */
async function loadStoredVectors(ctx: IntegrationCheckContext): Promise<StoredVector[]> {
    if (storedVectorsMemo !== undefined) {
        return storedVectorsMemo;
    }
    const rv = new RunView();
    const collected: StoredVector[] = [];
    for (const source of EMBEDDING_SOURCES) {
        const result = await rv.RunView<Record<string, string | null>>({
            EntityName: source.Entity,
            ExtraFilter: `${source.VectorField} IS NOT NULL`,
            Fields: ['ID', source.VectorField, source.ModelField],
            MaxRows: MAX_ROWS_PER_SOURCE,
            ResultType: 'simple'
        }, ctx.User);
        Assert(result.Success, `'${source.Entity}'.${source.VectorField} query failed: ${result.ErrorMessage}`);
        for (const row of result.Results) {
            const raw = row[source.VectorField];
            if (raw == null) {
                continue; // defensive — the filter should exclude these
            }
            const { vector, problem } = parseVector(raw);
            collected.push({
                Entity: source.Entity,
                Field: source.VectorField,
                Id: String(row.ID),
                ModelId: row[source.ModelField] ?? null,
                Raw: raw,
                Vector: vector,
                ParseProblem: problem
            });
        }
    }
    storedVectorsMemo = collected;
    return collected;
}

/** Short display handle for a stored vector row. */
function label(v: StoredVector): string {
    return `${v.Entity}.${v.Field} ${v.Id}`;
}

export const AiEmbeddingsChecks: NamedCheck[] = [
    {
        Id: 'ai-embeddings.AE1',
        Name: 'AE1: every persisted embedding parses as a non-empty finite number[] with a stamped model id; per-model dims consistent within each surface',
        Fn: async (ctx): Promise<void> => {
            const vectors = await loadStoredVectors(ctx);
            if (vectors.length === 0) {
                skipNote('AE1', `no persisted embeddings across ${EMBEDDING_SOURCES.length} surface(s) — the persisted-embedding pattern is unexercised in this deployment`);
                return;
            }
            const problems: string[] = [];
            for (const v of vectors) {
                if (!v.Vector) {
                    problems.push(`${label(v)}: ${v.ParseProblem}`);
                    continue;
                }
                if (!v.ModelId) {
                    // A vector with no model stamp cannot be compared, re-embedded, or invalidated
                    // on model change — provenance is the pattern's contract.
                    problems.push(`${label(v)}: vector persisted WITHOUT an EmbeddingModelID stamp`);
                }
            }
            // Per (surface, model): every vector must have the same dimensionality.
            const dims = new Map<string, { dim: number; exemplar: string }>();
            for (const v of vectors) {
                if (!v.Vector || !v.ModelId) {
                    continue;
                }
                const key = `${v.Entity}|${v.Field}|${v.ModelId.toLowerCase()}`;
                const existing = dims.get(key);
                if (!existing) {
                    dims.set(key, { dim: v.Vector.length, exemplar: v.Id });
                } else if (existing.dim !== v.Vector.length) {
                    problems.push(`${label(v)}: dim ${v.Vector.length} ≠ ${existing.dim} of sibling ${existing.exemplar} under the SAME model — mixed-dimension store corrupts similarity math`);
                }
            }
            Assert(problems.length === 0, `persisted-embedding integrity violations: ${problems.join('; ')}`);
            console.log(`      → ${vectors.length} stored vector(s) across ${dims.size} (surface, model) group(s): all parse, stamped, dimensionally consistent`);
        }
    },
    {
        Id: 'ai-embeddings.AE2',
        Name: 'AE2: no zero/degenerate stored vectors; unit-L2-norm convention (deviations warned)',
        Fn: async (ctx): Promise<void> => {
            const vectors = (await loadStoredVectors(ctx)).filter(v => v.Vector != null);
            if (vectors.length === 0) {
                skipNote('AE2', 'no parseable persisted embeddings — norm audit is unexercised');
                return;
            }
            const zeros: string[] = [];
            const offUnit: string[] = [];
            for (const v of vectors) {
                const norm = l2Norm(v.Vector as number[]);
                if (norm < 1e-9) {
                    // An all-zero vector matches NOTHING and poisons cosine similarity with
                    // divide-by-zero — it can only be a failed/corrupt write that slipped through.
                    zeros.push(label(v));
                } else if (Math.abs(norm - 1) > 0.15) {
                    // The local + mainstream embedding providers emit (near-)unit vectors; a stray
                    // norm is drift worth surfacing but may be a legitimate non-normalizing model,
                    // so this leg WARNS rather than fails.
                    offUnit.push(`${label(v)} (‖v‖=${norm.toFixed(4)})`);
                }
            }
            if (offUnit.length > 0) {
                console.warn(`      ⚠ ${offUnit.length}/${vectors.length} stored vector(s) deviate from unit norm (warn only — verify the producing model normalizes): ${offUnit.slice(0, 3).join('; ')}${offUnit.length > 3 ? ' …' : ''}`);
            }
            Assert(zeros.length === 0, `ZERO-vector embedding(s) persisted — corrupt writes that poison similarity search: ${zeros.join('; ')}`);
            console.log(`      → ${vectors.length} vector(s): none degenerate; ${offUnit.length} off-unit (warned)`);
        }
    },
    {
        Id: 'ai-embeddings.AE3',
        Name: 'AE3: cross-entity dimensional agreement — one embedding model ⇒ one dimensionality everywhere',
        Fn: async (ctx): Promise<void> => {
            // AE1 pins dims WITHIN a surface; this pins them ACROSS surfaces: a note vector and a
            // query vector produced by the same model must agree, or any cross-source similarity
            // (memory near-dup vs. query search) silently breaks.
            const vectors = (await loadStoredVectors(ctx)).filter(v => v.Vector != null && v.ModelId != null);
            if (vectors.length === 0) {
                skipNote('AE3', 'no stamped persisted embeddings — cross-entity dimension audit is unexercised');
                return;
            }
            const byModel = new Map<string, Map<number, string[]>>();
            for (const v of vectors) {
                const modelKey = (v.ModelId as string).toLowerCase();
                const dimMap = byModel.get(modelKey) ?? new Map<number, string[]>();
                const holders = dimMap.get((v.Vector as number[]).length) ?? [];
                if (holders.length < 3) {
                    holders.push(label(v));
                }
                dimMap.set((v.Vector as number[]).length, holders);
                byModel.set(modelKey, dimMap);
            }
            const conflicts: string[] = [];
            let multiSurfaceModels = 0;
            for (const [modelId, dimMap] of byModel) {
                if (dimMap.size > 1) {
                    const shapes = [...dimMap.entries()].map(([dim, holders]) => `${dim}d (${holders.join(', ')})`);
                    conflicts.push(`model ${modelId} produced ${dimMap.size} distinct dimensionalities: ${shapes.join(' vs ')}`);
                }
                const surfaces = new Set(vectors.filter(v => (v.ModelId as string).toLowerCase() === modelId).map(v => `${v.Entity}|${v.Field}`));
                if (surfaces.size > 1) {
                    multiSurfaceModels++;
                }
            }
            if (multiSurfaceModels === 0) {
                console.warn('      ⚠ ai-embeddings.AE3 — no embedding model spans two surfaces yet; the cross-entity leg degenerates to AE1 (still asserted)');
            }
            Assert(conflicts.length === 0, `cross-entity embedding dimension conflicts: ${conflicts.join('; ')}`);
            console.log(`      → ${byModel.size} model(s) dimensionally consistent across surfaces (${multiSurfaceModels} span multiple surfaces)`);
        }
    },
    {
        Id: 'ai-embeddings.AE4',
        Name: 'AE4: every stamped EmbeddingModelID resolves in the AI model catalog (non-Embeddings types warned)',
        Fn: async (ctx): Promise<void> => {
            const vectors = (await loadStoredVectors(ctx)).filter(v => v.ModelId != null);
            if (vectors.length === 0) {
                skipNote('AE4', 'no stamped persisted embeddings — model-reference audit is unexercised');
                return;
            }
            const engine = AIEngineBase.Instance;
            await engine.Config(false, ctx.User, ctx.Provider);
            const models = engine.Models;

            const missing: string[] = [];
            const wrongType: string[] = [];
            const distinctModelIds = [...new Set(vectors.map(v => (v.ModelId as string).toLowerCase()))];
            for (const modelId of distinctModelIds) {
                const model = models.find(m => UUIDsEqual(m.ID, modelId));
                if (!model) {
                    const holder = vectors.find(v => (v.ModelId as string).toLowerCase() === modelId);
                    missing.push(`${modelId} (stamped on ${holder ? label(holder) : '?'})`);
                    continue;
                }
                if (model.AIModelType !== 'Embeddings') {
                    wrongType.push(`'${model.Name}' is type '${model.AIModelType}'`);
                }
            }
            for (const w of wrongType) {
                console.warn(`      ⚠ stored vectors stamped by a non-'Embeddings' model: ${w} (warn — verify the stamp points at the right catalog row)`);
            }
            Assert(missing.length === 0,
                `stored vectors reference EmbeddingModelID(s) ABSENT from the AI model catalog — re-embedding and provenance are broken for them: ${missing.join('; ')}`);
            console.log(`      → ${distinctModelIds.length} distinct embedding model(s), all resolve in the catalog (${wrongType.length} non-Embeddings type(s) warned)`);
        }
    },
    {
        Id: 'ai-embeddings.AE5',
        Name: 'AE5: LocalEmbeddings catalog shape — the EmbedTextLocal chain has a driver-resolvable local Embeddings model (or is loudly absent)',
        Fn: async (ctx): Promise<void> => {
            // The deterministic tier cannot CALL the local embedder (first use downloads an ONNX
            // model), but it CAN pin the catalog shape `AIEngine.EmbedTextLocal` resolves through:
            // an Active 'Embeddings'-type model from the LocalEmbeddings vendor carrying the
            // DriverClass used for ClassFactory resolution. When the deployment has no such model
            // the check reports the consequence (notes/examples/tags cannot self-embed and the
            // memory near-dup guard degrades) and skips-as-pass.
            const engine = AIEngineBase.Instance;
            await engine.Config(false, ctx.User, ctx.Provider);
            const localEmbedders = engine.Models.filter(m =>
                m.AIModelType === 'Embeddings' &&
                typeof m.Vendor === 'string' && m.Vendor.trim().toLowerCase() === 'localembeddings'
            );
            if (localEmbedders.length === 0) {
                const anyVectors = (await loadStoredVectors(ctx)).length;
                skipNote('AE5', `no Active LocalEmbeddings 'Embeddings' model in the catalog — EmbedTextLocal has nothing to resolve` +
                    (anyVectors > 0
                        ? ` (PRODUCT SUSPICION: ${anyVectors} persisted vector(s) exist, so embedding IS in use here — new note/example saves may be failing silently)`
                        : ' (deployment does not use local embeddings; skip-as-pass)'));
                return;
            }
            const problems: string[] = [];
            for (const model of localEmbedders) {
                if (!model.IsActive) {
                    problems.push(`'${model.Name}' is inactive — EmbedTextLocal filters to active models`);
                }
                if (!model.DriverClass || model.DriverClass.trim().length === 0) {
                    problems.push(`'${model.Name}' has no DriverClass — ClassFactory resolution of the embedder is impossible`);
                }
            }
            Assert(problems.length === 0, `LocalEmbeddings catalog shape violations: ${problems.join('; ')}`);
            AssertEqual(problems.length, 0, 'unreachable'); // keep the assert count honest for tooling
            console.log(`      → ${localEmbedders.length} LocalEmbeddings model(s) present, active, driver-resolvable (e.g. '${localEmbedders[0].Name}' → ${localEmbedders[0].DriverClass})`);
        }
    }
];

for (const check of AiEmbeddingsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
