import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SemanticClusterExpander } from '../discovery/SemanticClusterExpander.js';
import type { OrganicKeyCluster } from '../types/organic-keys.js';
import type { DetectorInputColumn } from '../discovery/OrganicKeyClusterDetector.js';
import type { AIConfig } from '../types/config.js';

// ─── Mock the createLLMInstance factory + ChatCompletion ───────────────────
const mockChatCompletion = vi.fn();

vi.mock('../utils/llm-factory.js', () => {
    return {
        createLLMInstance: vi.fn(() => ({
            ChatCompletion: mockChatCompletion,
        })),
    };
});

vi.mock('@memberjunction/ai', () => ({ BaseLLM: class {} }));

// ─── Test helpers ──────────────────────────────────────────────────────────
function aiConfig(): AIConfig {
    return { provider: 'gemini', model: 'gemini-3-flash-preview', apiKey: 'test' };
}

function f32(...vals: number[]): Float32Array {
    return Float32Array.from(vals);
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

function cluster(
    id: string,
    concept: string,
    members: { schema: string; table: string; column: string }[],
    confidence = 0.9,
): OrganicKeyCluster {
    return {
        id,
        concept,
        normalization: 'LowerCaseTrim',
        members: members.map((m) => ({
            ...m,
            participatesInFK: false,
            fkTarget: null,
        })),
        confidence,
        reasoning: '',
        tags: ['no-fk-no-pk'],
        maxIntraDistance: 0.05,
    };
}

function descriptionsFromColumns(columns: DetectorInputColumn[]): Map<string, string> {
    const m = new Map<string, string>();
    for (const c of columns) {
        m.set(`${c.schema}.${c.table}.${c.column}`, c.description ?? '');
    }
    return m;
}

function mockLLMResponse(
    payload: { additions: { column: string; reasoning: string }[] },
    tokens = { total: 100, prompt: 60, completion: 40 },
) {
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

describe('SemanticClusterExpander', () => {
    beforeEach(() => {
        mockChatCompletion.mockReset();
    });

    describe('no-candidates short-circuit', () => {
        it('does not call LLM when there are no residual columns', async () => {
            const c1 = col('S', 'T1', 'Email', unit([1, 0]));
            const c2 = col('S', 'T2', 'Email', unit([1, 0]));
            const clusters = [cluster('c1', 'email_address', [c1, c2])];

            const ex = new SemanticClusterExpander(aiConfig());
            const result = await ex.expandAll(clusters, [c1, c2], descriptionsFromColumns([c1, c2]));

            expect(result.addedMemberCount).toBe(0);
            expect(mockChatCompletion).not.toHaveBeenCalled();
            expect(result.perCluster[0].outcome).toBe('no-candidates');
        });

        it('does not call LLM when no residual column meets the similarity floor', async () => {
            const c1 = col('S', 'T1', 'Email', unit([1, 0]));
            const c2 = col('S', 'T2', 'Email', unit([1, 0]));
            const distant = col('S', 'Other', 'X', unit([0, 1])); // orthogonal to email centroid
            const clusters = [cluster('c1', 'email_address', [c1, c2])];

            const ex = new SemanticClusterExpander(aiConfig());
            const result = await ex.expandAll(
                clusters,
                [c1, c2, distant],
                descriptionsFromColumns([c1, c2, distant]),
                { similarityFloor: 0.8 },
            );

            expect(result.addedMemberCount).toBe(0);
            expect(mockChatCompletion).not.toHaveBeenCalled();
        });
    });

    describe('expansion via LLM confirmation', () => {
        it('adds candidates the LLM confirms', async () => {
            const c1 = col('S', 'T1', 'Email', unit([1, 0, 0]));
            const c2 = col('S', 'T2', 'Email', unit([1, 0, 0]));
            const candidate = col('S', 'T3', 'ContactEmail', unit([0.9, 0.1, 0]));
            const distractor = col('S', 'T4', 'EmailServerHost', unit([0.85, 0.15, 0]));

            mockLLMResponse({
                additions: [
                    {
                        column: 'S.T3.ContactEmail',
                        reasoning: 'Same email-address value space',
                    },
                ],
            });

            const clusters = [cluster('c1', 'email_address', [c1, c2])];
            const ex = new SemanticClusterExpander(aiConfig());
            const result = await ex.expandAll(
                clusters,
                [c1, c2, candidate, distractor],
                descriptionsFromColumns([c1, c2, candidate, distractor]),
            );

            expect(result.addedMemberCount).toBe(1);
            expect(clusters[0].members).toHaveLength(3);
            expect(clusters[0].members[2].column).toBe('ContactEmail');
            expect(result.perCluster[0].outcome).toBe('expanded');
        });

        it('does NOT add candidates the LLM rejects', async () => {
            const c1 = col('S', 'T1', 'Email', unit([1, 0]));
            const c2 = col('S', 'T2', 'Email', unit([1, 0]));
            const candidate = col('S', 'T3', 'EmailServerHost', unit([0.9, 0.1]));

            mockLLMResponse({ additions: [] });

            const clusters = [cluster('c1', 'email_address', [c1, c2])];
            const ex = new SemanticClusterExpander(aiConfig());
            const result = await ex.expandAll(
                clusters,
                [c1, c2, candidate],
                descriptionsFromColumns([c1, c2, candidate]),
            );

            expect(result.addedMemberCount).toBe(0);
            expect(clusters[0].members).toHaveLength(2);
            expect(result.perCluster[0].outcome).toBe('no-additions');
        });

        it('ignores LLM-hallucinated column references that were not in the candidate list', async () => {
            const c1 = col('S', 'T1', 'Email', unit([1, 0]));
            const c2 = col('S', 'T2', 'Email', unit([1, 0]));
            const candidate = col('S', 'T3', 'ContactEmail', unit([0.9, 0.1]));

            mockLLMResponse({
                additions: [
                    { column: 'S.T3.ContactEmail', reasoning: 'belongs' },
                    { column: 'S.Fake.NeverProvided', reasoning: 'hallucinated' },
                ],
            });

            const clusters = [cluster('c1', 'email_address', [c1, c2])];
            const ex = new SemanticClusterExpander(aiConfig());
            const result = await ex.expandAll(
                clusters,
                [c1, c2, candidate],
                descriptionsFromColumns([c1, c2, candidate]),
            );

            // Only the legitimate candidate is added; the hallucinated one is dropped
            expect(result.addedMemberCount).toBe(1);
            expect(clusters[0].members.map((m) => m.column)).toEqual(['Email', 'Email', 'ContactEmail']);
        });
    });

    describe('multi-cluster claim arbitration', () => {
        it('processes clusters in descending-confidence order so strongest claims first', async () => {
            const c1 = col('S', 'T1', 'Email', unit([1, 0]));
            const c2 = col('S', 'T2', 'Phone', unit([0, 1]));
            const shared = col('S', 'T3', 'Contact', unit([0.7, 0.7])); // near both centroids

            // High-confidence email cluster runs first, claims `shared`
            mockLLMResponse({
                additions: [{ column: 'S.T3.Contact', reasoning: 'claimed by email' }],
            });
            // Phone cluster never sees `shared` (already assigned)
            mockLLMResponse({ additions: [] });

            const clusters = [
                cluster('c2', 'phone_number', [c2], 0.7),
                cluster('c1', 'email_address', [c1], 0.95), // higher conf — should run FIRST
            ];

            const ex = new SemanticClusterExpander(aiConfig());
            await ex.expandAll(
                clusters,
                [c1, c2, shared],
                descriptionsFromColumns([c1, c2, shared]),
                { concurrency: 1 },
            );

            // email_address (c1, higher conf) gets the contact column
            expect(clusters[1].members).toHaveLength(2);
            expect(clusters[1].members[1].column).toBe('Contact');
            // phone_number (c2, lower conf) does not
            expect(clusters[0].members).toHaveLength(1);
        });
    });

    describe('error handling', () => {
        it('records an error outcome when the LLM call throws', async () => {
            const c1 = col('S', 'T1', 'Email', unit([1, 0]));
            const c2 = col('S', 'T2', 'Email', unit([1, 0]));
            const candidate = col('S', 'T3', 'ContactEmail', unit([0.9, 0.1]));

            mockChatCompletion.mockRejectedValueOnce(new Error('rate limit'));

            const clusters = [cluster('c1', 'email_address', [c1, c2])];
            const ex = new SemanticClusterExpander(aiConfig());
            const result = await ex.expandAll(
                clusters,
                [c1, c2, candidate],
                descriptionsFromColumns([c1, c2, candidate]),
            );

            expect(result.addedMemberCount).toBe(0);
            expect(result.perCluster[0].outcome).toBe('error');
            expect(result.perCluster[0].errorMessage).toContain('rate limit');
            // Original cluster members unchanged
            expect(clusters[0].members).toHaveLength(2);
        });

        it('records error when LLM returns success=false', async () => {
            const c1 = col('S', 'T1', 'Email', unit([1, 0]));
            const c2 = col('S', 'T2', 'Email', unit([1, 0]));
            const candidate = col('S', 'T3', 'ContactEmail', unit([0.9, 0.1]));

            mockChatCompletion.mockResolvedValueOnce({
                success: false,
                errorMessage: 'quota exceeded',
            });

            const clusters = [cluster('c1', 'email_address', [c1, c2])];
            const ex = new SemanticClusterExpander(aiConfig());
            const result = await ex.expandAll(
                clusters,
                [c1, c2, candidate],
                descriptionsFromColumns([c1, c2, candidate]),
            );

            expect(result.perCluster[0].outcome).toBe('error');
            expect(result.perCluster[0].errorMessage).toContain('quota');
        });

        it('handles malformed LLM JSON gracefully (returns no additions)', async () => {
            const c1 = col('S', 'T1', 'Email', unit([1, 0]));
            const c2 = col('S', 'T2', 'Email', unit([1, 0]));
            const candidate = col('S', 'T3', 'ContactEmail', unit([0.9, 0.1]));

            mockChatCompletion.mockResolvedValueOnce({
                success: true,
                data: {
                    choices: [{ message: { content: '{not valid json' } }],
                    usage: { totalTokens: 50, promptTokens: 30, completionTokens: 20 },
                },
            });

            const clusters = [cluster('c1', 'email_address', [c1, c2])];
            const ex = new SemanticClusterExpander(aiConfig());
            const result = await ex.expandAll(
                clusters,
                [c1, c2, candidate],
                descriptionsFromColumns([c1, c2, candidate]),
            );

            expect(result.addedMemberCount).toBe(0);
            expect(result.perCluster[0].outcome).toBe('no-additions');
        });
    });

    describe('topK and similarity floor', () => {
        it('respects topK by sending only the top-K candidates to the LLM', async () => {
            const c1 = col('S', 'T1', 'Email', unit([1, 0]));
            const c2 = col('S', 'T2', 'Email', unit([1, 0]));
            const cands = [
                col('S', 'TA', 'CA', unit([0.99, 0.14])),
                col('S', 'TB', 'CB', unit([0.95, 0.31])),
                col('S', 'TC', 'CC', unit([0.85, 0.53])),
                col('S', 'TD', 'CD', unit([0.7, 0.71])),
                col('S', 'TE', 'CE', unit([0.6, 0.8])),
            ];

            mockLLMResponse({ additions: [] });

            const clusters = [cluster('c1', 'email_address', [c1, c2])];
            const ex = new SemanticClusterExpander(aiConfig());
            await ex.expandAll(
                clusters,
                [c1, c2, ...cands],
                descriptionsFromColumns([c1, c2, ...cands]),
                { topK: 2 },
            );

            expect(mockChatCompletion).toHaveBeenCalledOnce();
            // Inspect the user prompt to verify only top-2 made it
            const userMessage = mockChatCompletion.mock.calls[0][0].messages[1].content;
            expect(userMessage).toContain('TA.CA');
            expect(userMessage).toContain('TB.CB');
            expect(userMessage).not.toContain('TC.CC');
        });
    });

    describe('token accounting', () => {
        it('aggregates token usage across all per-cluster LLM calls', async () => {
            const c1 = col('S', 'T1', 'Email', unit([1, 0]));
            const c2 = col('S', 'T2', 'Phone', unit([0, 1]));
            const candidate1 = col('S', 'T3', 'X', unit([0.9, 0.1]));
            const candidate2 = col('S', 'T4', 'Y', unit([0.1, 0.9]));

            mockLLMResponse({ additions: [] }, { total: 100, prompt: 60, completion: 40 });
            mockLLMResponse({ additions: [] }, { total: 80, prompt: 50, completion: 30 });

            const clusters = [
                cluster('c1', 'email_address', [c1]),
                cluster('c2', 'phone_number', [c2]),
            ];
            const ex = new SemanticClusterExpander(aiConfig());
            const result = await ex.expandAll(
                clusters,
                [c1, c2, candidate1, candidate2],
                descriptionsFromColumns([c1, c2, candidate1, candidate2]),
                { concurrency: 1 },
            );

            expect(result.tokensUsed).toBe(180);
            expect(result.inputTokens).toBe(110);
            expect(result.outputTokens).toBe(70);
        });
    });
});
