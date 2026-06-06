import { UserInfo, IMetadataProvider, RunView, LogError, LogStatus } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import { MJContentItemEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AIModelRunner, AIPromptRunner } from '@memberjunction/ai-prompts';
// NOTE: AIPromptParams lives in @memberjunction/ai-core-plus, which is a direct dependency
// of @memberjunction/ai-prompts (already a TagEngine dependency) and is therefore resolvable.
// Ideally it would be declared as a direct dependency in this package's package.json — that
// declaration is deferred per the task constraints (no package.json edits in this change).
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import {
    ClusteringEngine,
    InMemoryVectorSource,
    ClusterConfig,
    ClusterInputVector,
    ClusterResult,
} from '@memberjunction/clustering-engine';

/**
 * A single proposed taxonomy node returned by
 * {@link generateSeedTaxonomy}. Forms a hierarchical tree (top-level = named
 * clusters; optional second level = representative sub-themes). Nothing here is
 * persisted — callers decide whether to materialize these as formal Tags.
 */
export interface SeedTaxonomyNode {
    /** Proposed tag name (LLM-generated cluster theme or sub-theme). */
    Name: string;
    /** Optional short description / rationale for the proposed tag. */
    Description?: string;
    /** Number of source content items that contributed to this node (top-level only). */
    MemberCount?: number;
    /** Child nodes (second-level sub-themes). Empty/omitted for leaf nodes. */
    Children?: SeedTaxonomyNode[];
}

/**
 * Outcome of a seed-taxonomy generation run.
 */
export interface SeedTaxonomyResult {
    /** The proposed taxonomy tree (NOT persisted). */
    Nodes: SeedTaxonomyNode[];
    /** How the taxonomy was produced — clustering of embeddings, or the AI-prompt fallback. */
    Method: 'clustering' | 'prompt-fallback';
    /** Number of content items sampled / considered. */
    SampleSize: number;
    /** Human-readable note (e.g., why the fallback was used). */
    Message?: string;
}

/** Shape the fallback "Generate Seed Taxonomy" prompt is expected to return. */
interface SeedTaxonomyPromptResult {
    taxonomy: SeedTaxonomyNode[];
}

/** Name of the AI Prompt used for the no-vector fallback path. */
const SEED_TAXONOMY_PROMPT_NAME = 'Generate Seed Taxonomy';

/** Default cap on how many content items the fallback prompt summarizes. */
const FALLBACK_SAMPLE_TEXT_CHARS = 600;

/**
 * Generate a proposed hierarchical tag taxonomy for a content source WITHOUT
 * persisting anything.
 *
 * Primary path: embed a sample of the source's content items, cluster them via
 * {@link ClusteringEngine} (which names clusters with an LLM), and turn each
 * named cluster into a top-level taxonomy node.
 *
 * Fallback path: when no embeddings can be produced (no embedding model, empty
 * texts, etc.), run the "Generate Seed Taxonomy" AI prompt over a sample of the
 * source's content item texts and use its proposed tree.
 *
 * @param sourceID    The ContentSource ID whose items seed the taxonomy.
 * @param sampleSize  Max number of content items to consider.
 * @param contextUser User context (required server-side).
 * @param provider    Optional metadata provider override.
 */
export async function generateSeedTaxonomy(
    sourceID: string,
    sampleSize: number,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
): Promise<SeedTaxonomyResult> {
    const cappedSample = sampleSize && sampleSize > 0 ? sampleSize : 200;

    const items = await fetchSourceContentItems(sourceID, cappedSample, contextUser);
    if (items.length === 0) {
        return { Nodes: [], Method: 'prompt-fallback', SampleSize: 0, Message: 'No content items found for the source.' };
    }

    // Primary path: embed + cluster.
    const vectors = await embedContentItems(items, contextUser);
    if (vectors.length >= 2) {
        const clusterResult = await runClustering(vectors, contextUser);
        const nodes = buildTaxonomyFromClusters(clusterResult, vectors);
        if (nodes.length > 0) {
            return { Nodes: nodes, Method: 'clustering', SampleSize: items.length };
        }
        LogStatus('generateSeedTaxonomy: clustering produced no nodes — falling back to prompt.');
    } else {
        LogStatus('generateSeedTaxonomy: embeddings unavailable or insufficient — falling back to prompt.');
    }

    // Fallback path: single AI prompt over a sample of item texts.
    const fallbackNodes = await runFallbackPrompt(items, contextUser);
    return {
        Nodes: fallbackNodes,
        Method: 'prompt-fallback',
        SampleSize: items.length,
        Message: vectors.length < 2 ? 'Vectors unavailable; used AI prompt over sampled content.' : undefined,
    };
}

/** Load up to `sampleSize` content items (with text) for the source. */
async function fetchSourceContentItems(
    sourceID: string,
    sampleSize: number,
    contextUser?: UserInfo,
): Promise<MJContentItemEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<MJContentItemEntity>(
        {
            EntityName: 'MJ: Content Items',
            ExtraFilter: `ContentSourceID = '${sourceID}' AND Text IS NOT NULL AND Text <> ''`,
            OrderBy: '__mj_CreatedAt DESC',
            MaxRows: sampleSize,
            ResultType: 'entity_object',
        },
        contextUser,
    );
    if (!result.Success) {
        LogError(`generateSeedTaxonomy: failed to load content items: ${result.ErrorMessage}`);
        return [];
    }
    return result.Results;
}

/**
 * Embed each content item's text into a {@link ClusterInputVector}. Uses
 * AIModelRunner for tracked embedding runs. Returns an empty array when no
 * embedding model is available or embedding fails entirely.
 */
async function embedContentItems(
    items: MJContentItemEntity[],
    contextUser?: UserInfo,
): Promise<ClusterInputVector[]> {
    if (!contextUser) {
        LogError('generateSeedTaxonomy: no contextUser available for embedding.');
        return [];
    }

    await AIEngine.Instance.Config(false, contextUser);

    const texts = items.map(buildEmbeddingText);
    try {
        const runner = new AIModelRunner();
        const result = await runner.RunEmbedding({
            Texts: texts,
            ContextUser: contextUser,
            Description: `Seed taxonomy embeddings (${items.length} content items)`,
        });

        if (!result.Success || result.Vectors.length !== items.length) {
            LogError(`generateSeedTaxonomy: embedding failed or returned ${result.Vectors.length}/${items.length} vectors: ${result.ErrorMessage ?? 'unknown'}`);
            return [];
        }

        const vectors: ClusterInputVector[] = [];
        for (let i = 0; i < items.length; i++) {
            const vec = result.Vectors[i];
            if (vec && vec.length > 0) {
                vectors.push({
                    Key: NormalizeUUID(items[i].ID),
                    Vector: vec,
                    Label: items[i].Name ?? items[i].ID,
                });
            }
        }
        return vectors;
    } catch (error) {
        LogError(`generateSeedTaxonomy: embedding exception: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
}

/** Build the text to embed for a content item: Name + Description + Text. */
function buildEmbeddingText(item: MJContentItemEntity): string {
    const parts: string[] = [];
    if (item.Name) parts.push(item.Name);
    if (item.Description) parts.push(item.Description);
    if (item.Text) parts.push(item.Text);
    return parts.join('\n');
}

/** Run the clustering pipeline with LLM naming over the supplied vectors. */
async function runClustering(
    vectors: ClusterInputVector[],
    contextUser?: UserInfo,
): Promise<ClusterResult> {
    const engine = new ClusteringEngine();
    const k = engine.SuggestK(vectors);
    const config: ClusterConfig = {
        Algorithm: 'kmeans',
        K: Math.max(1, k),
        Epsilon: 0.3,
        MinPoints: 3,
        DistanceMetric: 'cosine',
        MaxRecords: vectors.length,
        Filter: '',
        NameClusters: true,
        Dimensions: 2,
    };
    const source = new InMemoryVectorSource(vectors);
    return engine.RunPipeline(config, source, contextUser);
}

/**
 * Convert a clustering result into a single-level taxonomy tree — one top-level
 * node per named cluster. (A second level is left to callers / a future
 * refinement pass; the typed shape supports it via {@link SeedTaxonomyNode.Children}.)
 */
function buildTaxonomyFromClusters(
    result: ClusterResult,
    vectors: ClusterInputVector[],
): SeedTaxonomyNode[] {
    const nodes: SeedTaxonomyNode[] = [];
    for (const cluster of result.Clusters) {
        if (cluster.MemberCount === 0) continue;
        nodes.push({
            Name: cluster.Label,
            MemberCount: cluster.MemberCount,
            Children: buildClusterChildren(cluster.Index, result, vectors),
        });
    }
    return nodes;
}

/**
 * Build representative second-level children for a cluster from a few member
 * labels. Kept lightweight — these are suggestions, not authoritative tags.
 */
function buildClusterChildren(
    clusterIndex: number,
    result: ClusterResult,
    _vectors: ClusterInputVector[],
): SeedTaxonomyNode[] | undefined {
    const members = result.Points.filter(p => p.ClusterIndex === clusterIndex);
    if (members.length <= 1) {
        return undefined;
    }
    // Surface up to 3 distinct member labels as candidate sub-themes.
    const seen = new Set<string>();
    const children: SeedTaxonomyNode[] = [];
    for (const m of members) {
        const label = (m.Label ?? '').trim();
        if (label.length === 0 || seen.has(label.toLowerCase())) continue;
        seen.add(label.toLowerCase());
        children.push({ Name: label });
        if (children.length >= 3) break;
    }
    return children.length > 0 ? children : undefined;
}

/**
 * Fallback: run the "Generate Seed Taxonomy" AI prompt over a sample of item
 * texts. Returns [] if the prompt is missing or fails — the caller surfaces an
 * empty taxonomy rather than throwing.
 */
async function runFallbackPrompt(
    items: MJContentItemEntity[],
    contextUser?: UserInfo,
): Promise<SeedTaxonomyNode[]> {
    try {
        await AIEngine.Instance.Config(false, contextUser);
        const prompt = AIEngine.Instance.Prompts.find(p => p.Name === SEED_TAXONOMY_PROMPT_NAME);
        if (!prompt) {
            LogError(`generateSeedTaxonomy: fallback prompt "${SEED_TAXONOMY_PROMPT_NAME}" not found — returning empty taxonomy.`);
            return [];
        }

        const samples = items.map(item => ({
            title: item.Name ?? '',
            excerpt: (item.Text ?? '').substring(0, FALLBACK_SAMPLE_TEXT_CHARS),
        }));

        const params = new AIPromptParams();
        params.prompt = prompt;
        params.contextUser = contextUser;
        params.data = { items: samples };

        const runner = new AIPromptRunner();
        const result = await runner.ExecutePrompt<SeedTaxonomyPromptResult>(params);
        if (!result.success || !result.result || !Array.isArray(result.result.taxonomy)) {
            LogError(`generateSeedTaxonomy: fallback prompt execution failed: ${result.errorMessage ?? 'unknown error'}`);
            return [];
        }
        return result.result.taxonomy;
    } catch (error) {
        LogError(`generateSeedTaxonomy: fallback prompt exception: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
}
