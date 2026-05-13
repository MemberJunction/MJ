import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrganicKeyClusterRefiner } from '../discovery/OrganicKeyClusterRefiner.js';
import { OrganicKeyCluster } from '../types/organic-keys.js';
import { AIConfig } from '../types/config.js';
import type { BaseLLM, ChatResult } from '@memberjunction/ai';

/**
 * Build a minimal cluster fixture.
 */
function makeCluster(overrides: Partial<OrganicKeyCluster> = {}): OrganicKeyCluster {
    return {
        id: 'cluster_0',
        concept: '',
        normalization: 'LowerCaseTrim',
        confidence: 0,
        reasoning: '',
        tags: [],
        maxIntraDistance: 0.05,
        members: [
            {
                schema: 'Person',
                table: 'Person',
                column: 'BusinessEntityID',
                participatesInFK: true,
                fkTarget: { schema: 'Person', table: 'BusinessEntity', column: 'BusinessEntityID' },
            },
            {
                schema: 'Purchasing',
                table: 'Vendor',
                column: 'BusinessEntityID',
                participatesInFK: true,
                fkTarget: { schema: 'Person', table: 'BusinessEntityContact', column: 'BusinessEntityID' },
            },
        ],
        ...overrides,
    };
}

/** Build an AIConfig stub — refiner uses provider/apiKey/model from this. */
function makeAIConfig(): AIConfig {
    return {
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
        apiKey: 'test-key',
        temperature: 0.1,
    };
}

/**
 * Build a mock BaseLLM that returns a predetermined JSON payload.
 * Mirrors the shape of ChatResult that real providers produce.
 */
function makeMockLLM(jsonContent: string, opts: { success?: boolean; errorMessage?: string } = {}): BaseLLM {
    const result = {
        success: opts.success !== false,
        errorMessage: opts.errorMessage,
        data: {
            choices: [
                {
                    message: { content: jsonContent },
                },
            ],
            usage: {
                totalTokens: 100,
                promptTokens: 80,
                completionTokens: 20,
            },
        },
    } as unknown as ChatResult;

    return {
        ChatCompletion: vi.fn().mockResolvedValue(result),
    } as unknown as BaseLLM;
}

describe('OrganicKeyClusterRefiner', () => {
    let descriptions: Map<string, string>;

    beforeEach(() => {
        descriptions = new Map([
            ['Person.Person.BusinessEntityID', 'Unique identifier for a person in the system.'],
            ['Purchasing.Vendor.BusinessEntityID', 'Primary key linking the vendor to its business entity record.'],
        ]);
    });

    describe('refine outcome: keep', () => {
        it('returns refined cluster with concept, normalization, confidence, reasoning', async () => {
            const mockLLM = makeMockLLM(
                JSON.stringify({
                    concept: 'business_entity_id',
                    isUsefulOrganicKey: true,
                    normalization: 'ExactMatch',
                    confidence: 0.95,
                    reasoning: 'All members reference the same BusinessEntity identity.',
                }),
            );
            const refiner = OrganicKeyClusterRefiner.withLLM(makeAIConfig(), mockLLM);
            const result = await refiner.refine(makeCluster(), descriptions);

            expect(result.outcome).toBe('keep');
            expect(result.refinedCluster).toBeDefined();
            expect(result.refinedCluster!.concept).toBe('business_entity_id');
            expect(result.refinedCluster!.normalization).toBe('ExactMatch');
            expect(result.refinedCluster!.confidence).toBe(0.95);
            expect(result.refinedCluster!.reasoning).toContain('BusinessEntity');
        });

        it('ejects outliers listed by the LLM', async () => {
            const cluster = makeCluster({
                members: [
                    { schema: 'Person', table: 'Person', column: 'BusinessEntityID', participatesInFK: true },
                    { schema: 'Purchasing', table: 'Vendor', column: 'BusinessEntityID', participatesInFK: true },
                    { schema: 'Sales', table: 'BadFit', column: 'BusinessEntityID', participatesInFK: false },
                ],
            });
            const mockLLM = makeMockLLM(
                JSON.stringify({
                    concept: 'business_entity_id',
                    isUsefulOrganicKey: true,
                    normalization: 'ExactMatch',
                    confidence: 0.9,
                    reasoning: 'Two solid members, one outlier.',
                    outliers: ['Sales.BadFit.BusinessEntityID'],
                }),
            );
            const refiner = OrganicKeyClusterRefiner.withLLM(makeAIConfig(), mockLLM);
            const result = await refiner.refine(cluster, descriptions);

            expect(result.outcome).toBe('keep');
            expect(result.refinedCluster!.members.length).toBe(2);
            expect(
                result.refinedCluster!.members.some((m) => m.table === 'BadFit'),
            ).toBe(false);
        });

        it('clamps confidence into [0, 1]', async () => {
            const mockLLM = makeMockLLM(
                JSON.stringify({
                    concept: 'test',
                    isUsefulOrganicKey: true,
                    normalization: 'Trim',
                    confidence: 1.5,
                    reasoning: 'Test.',
                }),
            );
            const refiner = OrganicKeyClusterRefiner.withLLM(makeAIConfig(), mockLLM);
            const result = await refiner.refine(makeCluster(), descriptions);
            expect(result.refinedCluster!.confidence).toBe(1);
        });
    });

    describe('refine outcome: reject', () => {
        it('returns reject when LLM marks cluster as not useful', async () => {
            const mockLLM = makeMockLLM(
                JSON.stringify({
                    concept: 'audit_timestamp',
                    isUsefulOrganicKey: false,
                    normalization: 'ExactMatch',
                    confidence: 0.9,
                    reasoning: 'Audit timestamps are not useful for organic key matching.',
                }),
            );
            const refiner = OrganicKeyClusterRefiner.withLLM(makeAIConfig(), mockLLM);
            const result = await refiner.refine(makeCluster(), descriptions);

            expect(result.outcome).toBe('reject');
            expect(result.refinedCluster).toBeUndefined();
            expect(result.rejectReason).toContain('Audit');
        });
    });

    describe('refine outcome: split', () => {
        it('returns sub-clusters when LLM partitions a mixed cluster', async () => {
            const cluster = makeCluster({
                members: [
                    { schema: 'Person', table: 'Person', column: 'StateProvinceID', participatesInFK: false },
                    { schema: 'Sales', table: 'SalesTaxRate', column: 'StateProvinceID', participatesInFK: false },
                    { schema: 'Person', table: 'StateProvince', column: 'CountryRegionCode', participatesInFK: false },
                ],
            });
            const mockLLM = makeMockLLM(
                JSON.stringify({
                    concept: 'mixed',
                    isUsefulOrganicKey: false,
                    normalization: 'ExactMatch',
                    confidence: 0.9,
                    reasoning: 'Two distinct concepts mixed.',
                    subClusters: [
                        {
                            concept: 'state_province_id',
                            members: [
                                'Person.Person.StateProvinceID',
                                'Sales.SalesTaxRate.StateProvinceID',
                            ],
                            normalization: 'ExactMatch',
                            isUsefulOrganicKey: true,
                            reasoning: 'State province identifiers.',
                        },
                        {
                            concept: 'country_region_code',
                            members: ['Person.StateProvince.CountryRegionCode'],
                            normalization: 'Trim',
                            isUsefulOrganicKey: true,
                            reasoning: 'ISO country code.',
                        },
                    ],
                }),
            );
            const refiner = OrganicKeyClusterRefiner.withLLM(makeAIConfig(), mockLLM);
            const result = await refiner.refine(cluster, descriptions);

            expect(result.outcome).toBe('split');
            expect(result.subClusters).toBeDefined();
            expect(result.subClusters!.length).toBe(2);
            expect(result.subClusters![0].concept).toBe('state_province_id');
            expect(result.subClusters![0].members.length).toBe(2);
            expect(result.subClusters![1].concept).toBe('country_region_code');
        });

        it('drops sub-clusters the LLM marks as not useful', async () => {
            const mockLLM = makeMockLLM(
                JSON.stringify({
                    concept: 'mixed',
                    isUsefulOrganicKey: false,
                    normalization: 'ExactMatch',
                    confidence: 0.9,
                    reasoning: 'Split into one useful + one not.',
                    subClusters: [
                        {
                            concept: 'useful_concept',
                            members: ['Person.Person.BusinessEntityID', 'Purchasing.Vendor.BusinessEntityID'],
                            normalization: 'ExactMatch',
                            isUsefulOrganicKey: true,
                            reasoning: 'Real concept.',
                        },
                        {
                            concept: 'not_useful',
                            members: ['Person.Person.BusinessEntityID'],
                            normalization: 'ExactMatch',
                            isUsefulOrganicKey: false,
                            reasoning: 'Not useful.',
                        },
                    ],
                }),
            );
            const refiner = OrganicKeyClusterRefiner.withLLM(makeAIConfig(), mockLLM);
            const result = await refiner.refine(makeCluster(), descriptions);

            expect(result.outcome).toBe('split');
            expect(result.subClusters!.length).toBe(1);
            expect(result.subClusters![0].concept).toBe('useful_concept');
        });
    });

    describe('refine outcome: error', () => {
        it('returns error when LLM call fails', async () => {
            const mockLLM = makeMockLLM('', { success: false, errorMessage: 'Rate limited' });
            const refiner = OrganicKeyClusterRefiner.withLLM(makeAIConfig(), mockLLM);
            const result = await refiner.refine(makeCluster(), descriptions);

            expect(result.outcome).toBe('error');
            expect(result.errorMessage).toContain('Rate limited');
        });

        it('returns error when LLM returns unparseable JSON', async () => {
            const mockLLM = makeMockLLM('this is not valid JSON {{{');
            const refiner = OrganicKeyClusterRefiner.withLLM(makeAIConfig(), mockLLM);
            const result = await refiner.refine(makeCluster(), descriptions);

            expect(result.outcome).toBe('error');
            expect(result.errorMessage).toContain('parse');
        });

        it('strips markdown fences before JSON parsing', async () => {
            const mockLLM = makeMockLLM(
                '```json\n{"concept":"test","isUsefulOrganicKey":true,"normalization":"ExactMatch","confidence":0.8,"reasoning":"Test."}\n```',
            );
            const refiner = OrganicKeyClusterRefiner.withLLM(makeAIConfig(), mockLLM);
            const result = await refiner.refine(makeCluster(), descriptions);

            expect(result.outcome).toBe('keep');
            expect(result.refinedCluster!.concept).toBe('test');
        });
    });

    describe('refineAll batched processing', () => {
        it('processes multiple clusters with bounded concurrency', async () => {
            const mockLLM = makeMockLLM(
                JSON.stringify({
                    concept: 'business_entity_id',
                    isUsefulOrganicKey: true,
                    normalization: 'ExactMatch',
                    confidence: 0.9,
                    reasoning: 'Coherent.',
                }),
            );
            const refiner = OrganicKeyClusterRefiner.withLLM(makeAIConfig(), mockLLM);
            const clusters = [makeCluster({ id: 'c0' }), makeCluster({ id: 'c1' }), makeCluster({ id: 'c2' })];
            const result = await refiner.refineAll(clusters, descriptions, { concurrency: 2 });

            expect(result.confirmed.length).toBe(3);
            expect(result.rejected).toBe(0);
            expect(result.split).toBe(0);
            expect(result.errors).toBe(0);
            expect(result.tokens.total).toBe(300);
        });

        it('aggregates outcomes correctly across mixed responses', async () => {
            // First call: keep. Second: reject. Third: error.
            const keepResponse = JSON.stringify({
                concept: 'kept',
                isUsefulOrganicKey: true,
                normalization: 'ExactMatch',
                confidence: 0.9,
                reasoning: 'Yes.',
            });
            const rejectResponse = JSON.stringify({
                concept: 'rejected',
                isUsefulOrganicKey: false,
                normalization: 'ExactMatch',
                confidence: 0.9,
                reasoning: 'No.',
            });
            const successResult = {
                success: true,
                data: {
                    choices: [{ message: { content: keepResponse } }],
                    usage: { totalTokens: 100, promptTokens: 80, completionTokens: 20 },
                },
            } as unknown as ChatResult;
            const rejectResult = {
                success: true,
                data: {
                    choices: [{ message: { content: rejectResponse } }],
                    usage: { totalTokens: 100, promptTokens: 80, completionTokens: 20 },
                },
            } as unknown as ChatResult;
            const errorResult = {
                success: false,
                errorMessage: 'Network error',
                data: { choices: [], usage: { totalTokens: 0, promptTokens: 0, completionTokens: 0 } },
            } as unknown as ChatResult;
            const mockLLM = {
                ChatCompletion: vi
                    .fn()
                    .mockResolvedValueOnce(successResult)
                    .mockResolvedValueOnce(rejectResult)
                    .mockResolvedValueOnce(errorResult),
            } as unknown as BaseLLM;

            const refiner = OrganicKeyClusterRefiner.withLLM(makeAIConfig(), mockLLM);
            const clusters = [makeCluster({ id: 'c0' }), makeCluster({ id: 'c1' }), makeCluster({ id: 'c2' })];
            // Sequential concurrency = 1 to get predictable response ordering
            const result = await refiner.refineAll(clusters, descriptions, { concurrency: 1 });

            expect(result.confirmed.length).toBe(1);
            expect(result.rejected).toBe(1);
            expect(result.errors).toBe(1);
        });
    });
});
