import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConceptMergePass, normalizeConceptName } from '../discovery/ConceptMergePass.js';
import {
    OrganicKeyCluster,
    OrganicKeyClusterMember,
} from '../types/organic-keys.js';
import { AIConfig } from '../types/config.js';

// ─── Mock the @memberjunction/ai BaseLLM via the ClassFactory ─────────────────
const mockChatCompletion = vi.fn();

vi.mock('@memberjunction/global', () => {
    return {
        MJGlobal: {
            Instance: {
                ClassFactory: {
                    CreateInstance: vi.fn(() => ({
                        ChatCompletion: mockChatCompletion,
                    })),
                },
            },
        },
    };
});

vi.mock('@memberjunction/ai', () => {
    return {
        BaseLLM: class {},
    };
});

function aiConfig(): AIConfig {
    return { provider: 'gemini', model: 'gemini-3-flash-preview', apiKey: 'test-key' };
}

function member(schema: string, table: string, column: string): OrganicKeyClusterMember {
    return { schema, table, column, participatesInFK: false, fkTarget: null };
}

function cluster(
    id: string,
    concept: string,
    members: OrganicKeyClusterMember[],
    overrides: Partial<OrganicKeyCluster> = {},
): OrganicKeyCluster {
    return {
        id,
        concept,
        normalization: 'ExactMatch',
        members,
        confidence: 0.9,
        reasoning: `Cluster ${id} reasoning`,
        tags: ['no-fk-no-pk'],
        maxIntraDistance: 0.05,
        ...overrides,
    };
}

function mockLLMResponse(payload: object, tokens = { total: 100, prompt: 60, completion: 40 }) {
    mockChatCompletion.mockResolvedValueOnce({
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

describe('ConceptMergePass', () => {
    beforeEach(() => {
        mockChatCompletion.mockReset();
    });

    describe('normalizeConceptName', () => {
        it('lowercases and collapses separators', () => {
            expect(normalizeConceptName('Email Address')).toBe('email_address');
            expect(normalizeConceptName('Email-Address')).toBe('email_address');
            expect(normalizeConceptName('email_address')).toBe('email_address');
            expect(normalizeConceptName('  EMAIL  ADDRESS  ')).toBe('email_address');
        });

        it('handles repeated separators and edge whitespace', () => {
            expect(normalizeConceptName('foo___bar')).toBe('foo_bar');
            expect(normalizeConceptName('_leading_trailing_')).toBe('leading_trailing');
        });

        it('returns empty string for empty/null input', () => {
            expect(normalizeConceptName('')).toBe('');
            expect(normalizeConceptName(null as unknown as string)).toBe('');
            expect(normalizeConceptName(undefined as unknown as string)).toBe('');
        });
    });

    describe('mergeAll — basic behavior', () => {
        it('returns input unchanged when all concepts are unique (no LLM calls)', async () => {
            const clusters = [
                cluster('c1', 'email_address', [member('s', 't1', 'email')]),
                cluster('c2', 'phone_number', [member('s', 't2', 'phone')]),
                cluster('c3', 'customer_id', [member('s', 't3', 'cid')]),
            ];
            const pass = new ConceptMergePass(aiConfig());
            const result = await pass.mergeAll(clusters);

            expect(result.clusters).toHaveLength(3);
            expect(result.mergeGroups).toHaveLength(0);
            expect(result.mergedAwayCount).toBe(0);
            expect(mockChatCompletion).not.toHaveBeenCalled();
        });

        it('passes single-cluster concept groups through without LLM call', async () => {
            const clusters = [cluster('only', 'email_address', [member('s', 't', 'email')])];
            const pass = new ConceptMergePass(aiConfig());
            const result = await pass.mergeAll(clusters);

            expect(result.clusters).toEqual(clusters);
            expect(mockChatCompletion).not.toHaveBeenCalled();
        });
    });

    describe('mergeAll — same-concept groups', () => {
        it('merges all when LLM says mergeAll=true', async () => {
            const c1 = cluster('c1', 'product_id', [member('s', 'Product', 'ProductID')]);
            const c2 = cluster('c2', 'product_id', [member('s', 'ProductHistory', 'ProductID')]);
            const c3 = cluster('c3', 'product_id', [member('s', 'OrderDetail', 'ProductID')]);

            mockLLMResponse({
                mergeAll: true,
                reasoning: 'All reference the same Product entity',
            });

            const pass = new ConceptMergePass(aiConfig());
            const result = await pass.mergeAll([c1, c2, c3]);

            expect(result.clusters).toHaveLength(1);
            const merged = result.clusters[0];
            expect(merged.members).toHaveLength(3);
            expect(merged.mergedFromClusterIds).toEqual(['c1', 'c2', 'c3']);
            expect(merged.mergeReasoning).toContain('Product');
            expect(result.mergedAwayCount).toBe(2);
            expect(result.mergeGroups[0].outcome).toBe('merged-all');
            expect(mockChatCompletion).toHaveBeenCalledOnce();
        });

        it('keeps separate when LLM says mergeAll=false and gives no partition', async () => {
            const c1 = cluster('c1', 'customer_id', [member('s', 'Internal', 'cid')]);
            const c2 = cluster('c2', 'customer_id', [member('s', 'External', 'cid')]);

            mockLLMResponse({
                mergeAll: false,
                reasoning: 'Different ID spaces, internal vs external',
            });

            const pass = new ConceptMergePass(aiConfig());
            const result = await pass.mergeAll([c1, c2]);

            expect(result.clusters).toHaveLength(2);
            expect(result.mergeGroups[0].outcome).toBe('kept-separate');
            expect(result.mergedAwayCount).toBe(0);
        });

        it('partial-merges per partition', async () => {
            // 4 clusters all called 'business_entity_id'; LLM partitions into {c1,c2} merged, {c3} alone, {c4} alone
            const c1 = cluster('c1', 'business_entity_id', [member('p', 'Person', 'beid')]);
            const c2 = cluster('c2', 'business_entity_id', [member('p', 'Vendor', 'beid')]);
            const c3 = cluster('c3', 'business_entity_id', [member('s', 'Store', 'beid')]);
            const c4 = cluster('c4', 'business_entity_id', [member('x', 'Other', 'beid')]);

            mockLLMResponse({
                mergeAll: false,
                partition: [
                    {
                        clusterIds: ['c1', 'c2'],
                        reasoning: 'Person and Vendor share BusinessEntity identity',
                    },
                    { clusterIds: ['c3'], reasoning: 'Store is a different hierarchy' },
                    { clusterIds: ['c4'], reasoning: 'Other is separate' },
                ],
                reasoning: 'Partial merge: Person+Vendor share value space, others are distinct',
            });

            const pass = new ConceptMergePass(aiConfig());
            const result = await pass.mergeAll([c1, c2, c3, c4]);

            expect(result.clusters).toHaveLength(3);
            const merged = result.clusters.find((c) => c.mergedFromClusterIds);
            expect(merged?.mergedFromClusterIds).toEqual(['c1', 'c2']);
            expect(merged?.members).toHaveLength(2);
            expect(result.mergeGroups[0].outcome).toBe('merged-partial');
            expect(result.mergedAwayCount).toBe(1);
        });

        it('handles partition where input cluster ID is omitted (keeps it separate)', async () => {
            const c1 = cluster('c1', 'concept', [member('s', 't1', 'c')]);
            const c2 = cluster('c2', 'concept', [member('s', 't2', 'c')]);
            const c3 = cluster('c3', 'concept', [member('s', 't3', 'c')]);

            mockLLMResponse({
                mergeAll: false,
                partition: [
                    { clusterIds: ['c1', 'c2'] },
                    // c3 not mentioned at all
                ],
                reasoning: 'Partial',
            });

            const pass = new ConceptMergePass(aiConfig());
            const result = await pass.mergeAll([c1, c2, c3]);

            expect(result.clusters).toHaveLength(2); // merged{c1,c2} + c3
            expect(result.clusters.some((c) => c.id === 'c3')).toBe(true);
        });
    });

    describe('mergeAll — merge mechanics', () => {
        it('dedupes members across merged clusters', async () => {
            const m1 = member('s', 't', 'shared');
            const m2 = member('s', 't', 'shared'); // duplicate
            const m3 = member('s', 't', 'unique');
            const c1 = cluster('c1', 'concept', [m1, m3]);
            const c2 = cluster('c2', 'concept', [m2]);

            mockLLMResponse({ mergeAll: true, reasoning: 'merge' });

            const pass = new ConceptMergePass(aiConfig());
            const result = await pass.mergeAll([c1, c2]);

            expect(result.clusters[0].members).toHaveLength(2);
        });

        it('picks base cluster by highest confidence', async () => {
            const c1 = cluster('low', 'concept', [member('s', 't', 'a')], { confidence: 0.7, reasoning: 'low' });
            const c2 = cluster('high', 'concept', [member('s', 't', 'b')], { confidence: 0.95, reasoning: 'high' });

            mockLLMResponse({ mergeAll: true, reasoning: 'merge' });

            const pass = new ConceptMergePass(aiConfig());
            const result = await pass.mergeAll([c1, c2]);

            expect(result.clusters[0].reasoning).toBe('high');
            expect(result.clusters[0].confidence).toBe(0.95);
        });

        it('unions tags and drops fk-redundant-single-target if fk-fragmented is present', async () => {
            const c1 = cluster('c1', 'concept', [member('s', 't', 'a')], {
                tags: ['fk-redundant-single-target'],
            });
            const c2 = cluster('c2', 'concept', [member('s', 't', 'b')], {
                tags: ['fk-fragmented'],
            });

            mockLLMResponse({ mergeAll: true, reasoning: 'merge' });

            const pass = new ConceptMergePass(aiConfig());
            const result = await pass.mergeAll([c1, c2]);

            expect(result.clusters[0].tags).toContain('fk-fragmented');
            expect(result.clusters[0].tags).not.toContain('fk-redundant-single-target');
        });

        it('drops uninformative "mixed" tag when other tags are present', async () => {
            const c1 = cluster('c1', 'concept', [member('s', 't', 'a')], { tags: ['mixed'] });
            const c2 = cluster('c2', 'concept', [member('s', 't', 'b')], { tags: ['no-fk-no-pk'] });

            mockLLMResponse({ mergeAll: true, reasoning: 'merge' });

            const pass = new ConceptMergePass(aiConfig());
            const result = await pass.mergeAll([c1, c2]);

            expect(result.clusters[0].tags).toContain('no-fk-no-pk');
            expect(result.clusters[0].tags).not.toContain('mixed');
        });

        it('keeps "mixed" tag when no other tags are present', async () => {
            const c1 = cluster('c1', 'concept', [member('s', 't', 'a')], { tags: ['mixed'] });
            const c2 = cluster('c2', 'concept', [member('s', 't', 'b')], { tags: ['mixed'] });

            mockLLMResponse({ mergeAll: true, reasoning: 'merge' });

            const pass = new ConceptMergePass(aiConfig());
            const result = await pass.mergeAll([c1, c2]);

            expect(result.clusters[0].tags).toEqual(['mixed']);
        });
    });

    describe('mergeAll — error handling', () => {
        it('keeps clusters separate when LLM call throws', async () => {
            mockChatCompletion.mockRejectedValueOnce(new Error('LLM unavailable'));

            const c1 = cluster('c1', 'concept', [member('s', 't1', 'a')]);
            const c2 = cluster('c2', 'concept', [member('s', 't2', 'a')]);

            const pass = new ConceptMergePass(aiConfig());
            const result = await pass.mergeAll([c1, c2]);

            expect(result.clusters).toHaveLength(2);
            expect(result.mergeGroups[0].outcome).toBe('error');
            expect(result.mergeGroups[0].errorMessage).toContain('LLM unavailable');
        });

        it('keeps clusters separate when LLM returns malformed JSON', async () => {
            mockChatCompletion.mockResolvedValueOnce({
                data: {
                    choices: [{ message: { content: '{not valid json' } }],
                    usage: { totalTokens: 50, promptTokens: 30, completionTokens: 20 },
                },
            });

            const pass = new ConceptMergePass(aiConfig());
            const result = await pass.mergeAll([
                cluster('c1', 'concept', [member('s', 't', 'a')]),
                cluster('c2', 'concept', [member('s', 't', 'b')]),
            ]);

            expect(result.clusters).toHaveLength(2);
            expect(result.mergeGroups[0].outcome).toBe('error');
        });

        it('keeps separate when LLM response is missing mergeAll field', async () => {
            mockLLMResponse({ reasoning: 'forgot the field' });

            const pass = new ConceptMergePass(aiConfig());
            const result = await pass.mergeAll([
                cluster('c1', 'c', [member('s', 't', 'a')]),
                cluster('c2', 'c', [member('s', 't', 'b')]),
            ]);

            expect(result.mergeGroups[0].outcome).toBe('error');
        });
    });

    describe('mergeAll — concept-name variants', () => {
        it('groups clusters with capitalization/separator variants of the same concept', async () => {
            const c1 = cluster('c1', 'Email Address', [member('s', 't1', 'a')]);
            const c2 = cluster('c2', 'email_address', [member('s', 't2', 'b')]);
            const c3 = cluster('c3', 'EMAIL-ADDRESS', [member('s', 't3', 'c')]);

            mockLLMResponse({ mergeAll: true, reasoning: 'merge' });

            const pass = new ConceptMergePass(aiConfig());
            const result = await pass.mergeAll([c1, c2, c3]);

            expect(result.clusters).toHaveLength(1);
            expect(mockChatCompletion).toHaveBeenCalledOnce();
        });
    });

    describe('mergeAll — token accounting', () => {
        it('aggregates token usage across multiple LLM calls', async () => {
            const c1 = cluster('c1', 'concept_a', [member('s', 't', 'a')]);
            const c2 = cluster('c2', 'concept_a', [member('s', 't', 'b')]);
            const c3 = cluster('c3', 'concept_b', [member('s', 't', 'c')]);
            const c4 = cluster('c4', 'concept_b', [member('s', 't', 'd')]);

            mockLLMResponse({ mergeAll: true, reasoning: 'merge a' }, { total: 100, prompt: 60, completion: 40 });
            mockLLMResponse({ mergeAll: false, reasoning: 'keep b' }, { total: 80, prompt: 50, completion: 30 });

            const pass = new ConceptMergePass(aiConfig());
            const result = await pass.mergeAll([c1, c2, c3, c4]);

            expect(result.tokensUsed).toBe(180);
            expect(result.inputTokens).toBe(110);
            expect(result.outputTokens).toBe(70);
            expect(mockChatCompletion).toHaveBeenCalledTimes(2);
        });
    });
});
