import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MissingConceptsDetector } from '../discovery/MissingConceptsDetector.js';
import type { OrganicKeyCluster } from '../types/organic-keys.js';
import type { DetectorInputColumn } from '../discovery/OrganicKeyClusterDetector.js';
import type { AIConfig } from '../types/config.js';
import type { EmbeddingProvider } from '../discovery/EmbeddingProvider.js';

// ─── Mock the createLLMInstance factory + ChatCompletion ───────────────────
const mockChatCompletion = vi.fn();
vi.mock('../utils/llm-factory.js', () => ({
    createLLMInstance: vi.fn(() => ({ ChatCompletion: mockChatCompletion })),
}));
vi.mock('@memberjunction/ai', () => ({ BaseLLM: class {} }));

// ─── Helpers ──────────────────────────────────────────────────────────────
function aiConfig(): AIConfig {
    return { provider: 'gemini', model: 'gemini-3-flash-preview', apiKey: 'test' };
}
function unit(vec: number[]): Float32Array {
    let n = 0;
    for (const v of vec) n += v * v;
    n = Math.sqrt(n) || 1;
    return Float32Array.from(vec.map((v) => v / n));
}
function col(
    schema: string,
    table: string,
    column: string,
    embedding?: Float32Array,
    overrides: Partial<DetectorInputColumn> = {},
): DetectorInputColumn {
    return {
        schema,
        table,
        column,
        dataType: 'nvarchar(255)',
        description: `${column} description`,
        isPrimaryKey: false,
        participatesInFK: false,
        embedding,
        ...overrides,
    };
}
function descriptionsFromColumns(cs: DetectorInputColumn[]): Map<string, string> {
    const m = new Map<string, string>();
    for (const c of cs) m.set(`${c.schema}.${c.table}.${c.column}`, c.description ?? '');
    return m;
}

function makeMockEmbedder(vectors: Float32Array[]): EmbeddingProvider {
    return {
        embed: vi.fn(async (texts: string[]) => texts.map((_, i) => vectors[i] ?? unit([1, 0]))),
        provider: 'mock',
        model: 'mock',
    };
}
function mockLLMResponse(payload: object, tokens = { total: 100, prompt: 60, completion: 40 }) {
    mockChatCompletion.mockResolvedValueOnce({
        success: true,
        data: {
            choices: [{ message: { content: JSON.stringify(payload) } }],
            usage: {
                totalTokens: tokens.total,
                promptTokens: tokens.prompt,
                completionTokens: tokens.completion,
            },
        },
    });
}
function cluster(id: string, concept: string, memberCol: DetectorInputColumn): OrganicKeyCluster {
    return {
        id,
        concept,
        normalization: 'LowerCaseTrim',
        members: [
            {
                schema: memberCol.schema,
                table: memberCol.table,
                column: memberCol.column,
                participatesInFK: false,
                fkTarget: null,
            },
        ],
        confidence: 0.9,
        reasoning: '',
        tags: ['no-fk-no-pk'],
        maxIntraDistance: 0,
    };
}

describe('MissingConceptsDetector', () => {
    beforeEach(() => mockChatCompletion.mockReset());

    describe('residual-empty short-circuit', () => {
        it('returns immediately when there are no residual columns', async () => {
            const c1 = col('S', 'T1', 'Email', unit([1, 0]));
            const confirmed = [cluster('c1', 'email_address', c1)];
            const embedder = makeMockEmbedder([]);

            const d = new MissingConceptsDetector(aiConfig(), embedder);
            const r = await d.findAndExpand(confirmed, [c1], descriptionsFromColumns([c1]));

            expect(r.newClusters).toHaveLength(0);
            expect(r.proposedConcepts).toHaveLength(0);
            expect(mockChatCompletion).not.toHaveBeenCalled();
        });
    });

    describe('discovery → confirmation full pipeline', () => {
        it('proposes a missing concept and creates a cluster from confirmed K-NN members', async () => {
            const emailCol = col('S', 'T1', 'Email', unit([1, 0]));
            const postal1 = col('S', 'T2', 'PostalCode', unit([0, 1]));
            const postal2 = col('S', 'T3', 'ZipCode', unit([0.05, 0.99]));
            const unrelated = col('S', 'T4', 'Random', unit([0.5, -0.5]));

            // Discovery LLM call: proposes 'postal_code'
            mockLLMResponse({
                missingConcepts: [
                    {
                        concept: 'postal_code',
                        description: 'Postal / ZIP code identifying a delivery location',
                        normalization: 'Trim',
                        reasoning: 'PostalCode and ZipCode columns present in residual sample',
                    },
                ],
            });

            // Member-confirmation LLM call: confirms both postal columns
            mockLLMResponse({
                members: [
                    { column: 'S.T2.PostalCode', reasoning: 'standard postal code' },
                    { column: 'S.T3.ZipCode', reasoning: 'US ZIP code' },
                ],
            });

            // Concept embedding anchor lands near (0,1) so it matches postal cols
            const conceptAnchor = unit([0, 1]);
            const embedder = makeMockEmbedder([conceptAnchor]);

            const confirmed = [cluster('c1', 'email_address', emailCol)];
            const d = new MissingConceptsDetector(aiConfig(), embedder);
            const r = await d.findAndExpand(
                confirmed,
                [emailCol, postal1, postal2, unrelated],
                descriptionsFromColumns([emailCol, postal1, postal2, unrelated]),
            );

            expect(r.newClusters).toHaveLength(1);
            expect(r.newClusters[0].concept).toBe('postal_code');
            expect(r.newClusters[0].members).toHaveLength(2);
            expect(r.newClusters[0].normalization).toBe('Trim');
            expect(r.proposedConcepts[0].outcome).toBe('cluster-created');
            expect(r.proposedConcepts[0].confirmedMembers).toBe(2);
        });

        it('returns empty result when LLM proposes no missing concepts', async () => {
            const c1 = col('S', 'T1', 'Email', unit([1, 0]));
            const c2 = col('S', 'T2', 'Phone', unit([0, 1]));

            mockLLMResponse({ missingConcepts: [] });

            const embedder = makeMockEmbedder([]);
            const confirmed = [cluster('a', 'email_address', c1)];
            const d = new MissingConceptsDetector(aiConfig(), embedder);
            const r = await d.findAndExpand(
                confirmed,
                [c1, c2],
                descriptionsFromColumns([c1, c2]),
            );

            expect(r.newClusters).toHaveLength(0);
            expect(r.proposedConcepts).toHaveLength(0);
            // Only the discovery call should have happened (no confirmation needed)
            expect(mockChatCompletion).toHaveBeenCalledOnce();
        });

        it('rejects proposed concepts that result in too-small clusters (< min shape)', async () => {
            const c1 = col('S', 'T1', 'Email', unit([1, 0]));
            const lone = col('S', 'T2', 'WeirdField', unit([0, 1]));

            mockLLMResponse({
                missingConcepts: [
                    {
                        concept: 'weird_thing',
                        description: 'A weird concept',
                        normalization: 'ExactMatch',
                        reasoning: 'maybe?',
                    },
                ],
            });
            mockLLMResponse({
                members: [{ column: 'S.T2.WeirdField', reasoning: 'only one' }],
            });

            const embedder = makeMockEmbedder([unit([0, 1])]);
            const confirmed = [cluster('a', 'email_address', c1)];
            const d = new MissingConceptsDetector(aiConfig(), embedder);
            const r = await d.findAndExpand(
                confirmed,
                [c1, lone],
                descriptionsFromColumns([c1, lone]),
            );

            expect(r.newClusters).toHaveLength(0);
            expect(r.proposedConcepts[0].outcome).toBe('rejected-too-small');
        });
    });

    describe('error handling', () => {
        it('reports error when the discovery LLM call throws', async () => {
            const c1 = col('S', 'T1', 'Email', unit([1, 0]));
            const c2 = col('S', 'T2', 'Other', unit([0, 1]));

            mockChatCompletion.mockRejectedValueOnce(new Error('rate limit'));

            const embedder = makeMockEmbedder([]);
            const confirmed = [cluster('a', 'email_address', c1)];
            const d = new MissingConceptsDetector(aiConfig(), embedder);
            const r = await d.findAndExpand(
                confirmed,
                [c1, c2],
                descriptionsFromColumns([c1, c2]),
            );

            expect(r.newClusters).toHaveLength(0);
            expect(r.proposedConcepts).toHaveLength(1);
            expect(r.proposedConcepts[0].outcome).toBe('error');
            expect(r.proposedConcepts[0].errorMessage).toContain('rate limit');
        });

        it('reports error per-concept when member confirmation fails', async () => {
            const c1 = col('S', 'T1', 'Email', unit([1, 0]));
            const candidate = col('S', 'T2', 'PostalCode', unit([0, 1]));

            mockLLMResponse({
                missingConcepts: [
                    {
                        concept: 'postal_code',
                        description: 'postal',
                        normalization: 'Trim',
                        reasoning: 'PostalCode in residual',
                    },
                ],
            });
            // Member confirmation throws
            mockChatCompletion.mockRejectedValueOnce(new Error('quota'));

            const embedder = makeMockEmbedder([unit([0, 1])]);
            const confirmed = [cluster('a', 'email_address', c1)];
            const d = new MissingConceptsDetector(aiConfig(), embedder);
            const r = await d.findAndExpand(
                confirmed,
                [c1, candidate],
                descriptionsFromColumns([c1, candidate]),
            );

            expect(r.newClusters).toHaveLength(0);
            expect(r.proposedConcepts[0].outcome).toBe('error');
            expect(r.proposedConcepts[0].errorMessage).toContain('quota');
        });
    });

    describe('token accounting', () => {
        it('aggregates tokens across discovery + member-confirmation calls', async () => {
            const c1 = col('S', 'T1', 'Email', unit([1, 0]));
            const p1 = col('S', 'T2', 'PostalCode', unit([0, 1]));
            const p2 = col('S', 'T3', 'ZipCode', unit([0.05, 0.99]));

            mockLLMResponse(
                {
                    missingConcepts: [
                        {
                            concept: 'postal_code',
                            description: 'postal',
                            normalization: 'Trim',
                            reasoning: 'r',
                        },
                    ],
                },
                { total: 200, prompt: 150, completion: 50 },
            );
            mockLLMResponse(
                {
                    members: [
                        { column: 'S.T2.PostalCode', reasoning: 'a' },
                        { column: 'S.T3.ZipCode', reasoning: 'b' },
                    ],
                },
                { total: 100, prompt: 70, completion: 30 },
            );

            const embedder = makeMockEmbedder([unit([0, 1])]);
            const confirmed = [cluster('a', 'email_address', c1)];
            const d = new MissingConceptsDetector(aiConfig(), embedder);
            const r = await d.findAndExpand(
                confirmed,
                [c1, p1, p2],
                descriptionsFromColumns([c1, p1, p2]),
            );

            expect(r.tokensUsed).toBe(300);
            expect(r.inputTokens).toBe(220);
            expect(r.outputTokens).toBe(80);
        });
    });
});
