import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams, type AIPromptRunResult } from '@memberjunction/ai-core-plus';
import { RecordProcessorContext, RecordRef } from '@memberjunction/record-set-processor-base';
import { DataFeatureSpec } from '@memberjunction/feature-pipelines';
import { InferProcessor } from '../processors/InferProcessor';

describe('InferProcessor constraint enforcement', () => {
    const USER = {} as UserInfo;
    const record: RecordRef = {
        EntityID: 'ENT-1',
        RecordID: 'rec-123',
        Record: { ID: 'rec-123', Title: 'VP of Sales', RawComp: '150000' },
    };

    const mockPrompt = {
        ID: 'PROMPT-1',
        Name: 'Classify Job Title',
        ValidationBehavior: 'Warn' as 'Warn' | 'Strict' | 'None',
    };

    let executedParams: unknown;
    let executedValidationBehavior: string | undefined;
    let mockResult: unknown = {};
    let mockSuccess = true;
    let mockErrorMessage: string | undefined;

    beforeEach(() => {
        executedParams = undefined;
        executedValidationBehavior = undefined;
        mockResult = {};
        mockSuccess = true;
        mockErrorMessage = undefined;

        vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(undefined);
        // @ts-expect-error mock prompt getter
        vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([mockPrompt]);

        vi.spyOn(AIPromptRunner.prototype, 'ExecutePrompt').mockImplementation(async (params: unknown) => {
            executedParams = params;
            executedValidationBehavior = (params as { prompt?: { ValidationBehavior?: string } }).prompt?.ValidationBehavior;
            return {
                success: mockSuccess,
                errorMessage: mockErrorMessage,
                result: mockResult,
                promptRun: { ID: 'RUN-AI-1' },
            };
        });
    });

    const mockContext: RecordProcessorContext = {
        contextUser: USER,
        provider: {
            EntityByID: () => ({
                Name: 'Person',
                Fields: [
                    { Name: 'Compensation', TSType: 'number' },
                    { Name: 'Notes', TSType: 'string' },
                ],
            }),
        } as unknown as IMetadataProvider,
        processRunID: 'RUN-PROC-1',
    };

    it('injects constraint block into prompt data and enforces Strict validation behavior', async () => {
        const spec: DataFeatureSpec = {
            Name: 'Job Seniority Pipeline',
            Description: 'Classifies seniority and salary',
            PromptID: 'PROMPT-1',
            Context: { Fields: ['Title'] },
            Caching: { Cacheable: false },
            Outputs: [
                {
                    Ref: '$.seniority',
                    Name: 'Seniority',
                    Constraint: {
                        Type: 'enum',
                        Values: ['Executive', 'Director', 'Manager', 'Individual Contributor'],
                        OnViolation: 'fail',
                    },
                    Target: { Mode: 'field', EntityFieldName: 'Seniority' },
                },
            ],
        };

        mockResult = { seniority: 'Director' };

        const processor = new InferProcessor('PROMPT-1', undefined, spec);
        const result = await processor.ProcessRecord(record, mockContext);

        expect(result.Status).toBe('Succeeded');
        expect(result.ResultPayload).toEqual({ seniority: 'Director' });

        // Verify Layer 1 prompt configuration: Strict during execution, restored to Warn afterwards
        const params = executedParams as { data: Record<string, unknown> };
        expect(executedValidationBehavior).toBe('Strict');
        expect(mockPrompt.ValidationBehavior).toBe('Warn');
        expect(params.data.constraints).toBeDefined();
        expect(params.data.ConstraintBlock).toBeDefined();
        expect(typeof params.data.constraints).toBe('string');
        expect(params.data.constraints).toContain('Individual Contributor');
    });

    it('fails when output violates constraint and OnViolation is fail', async () => {
        const spec: DataFeatureSpec = {
            Name: 'Job Seniority Pipeline',
            Description: 'Classifies seniority',
            PromptID: 'PROMPT-1',
            Context: { Fields: ['Title'] },
            Caching: { Cacheable: false },
            Outputs: [
                {
                    Ref: '$.seniority',
                    Name: 'Seniority',
                    Constraint: {
                        Type: 'enum',
                        Values: ['Executive', 'Director', 'Manager'],
                        OnViolation: 'fail',
                    },
                    Target: { Mode: 'field', EntityFieldName: 'Seniority' },
                },
            ],
        };

        // Out of vocabulary answer
        mockResult = { seniority: 'Intern' };

        const processor = new InferProcessor('PROMPT-1', undefined, spec);
        const result = await processor.ProcessRecord(record, mockContext);

        expect(result.Status).toBe('Failed');
        expect(result.ErrorMessage).toContain("Constraint violation for 'Seniority'");
        expect(result.ErrorMessage).toContain("'Intern' is not in the allowed vocabulary");
        expect(result.AIPromptRunID).toBe('RUN-AI-1');
    });

    it('coerces to null and records violation when OnViolation is null', async () => {
        const spec: DataFeatureSpec = {
            Name: 'Job Seniority Pipeline',
            Description: 'Classifies seniority',
            PromptID: 'PROMPT-1',
            Context: { Fields: ['Title'] },
            Caching: { Cacheable: false },
            Outputs: [
                {
                    Ref: '$.seniority',
                    Name: 'Seniority',
                    Constraint: {
                        Type: 'enum',
                        Values: ['Executive', 'Director', 'Manager'],
                        OnViolation: 'null',
                    },
                    Target: { Mode: 'field', EntityFieldName: 'Seniority' },
                },
            ],
        };

        mockResult = { seniority: 'VP' };

        const processor = new InferProcessor('PROMPT-1', undefined, spec);
        const result = await processor.ProcessRecord(record, mockContext);

        expect(result.Status).toBe('Succeeded');
        const payload = result.ResultPayload as { seniority: unknown; _violations?: Array<{ outputName: string; policy: string }> };
        expect(payload.seniority).toBeNull();
        expect(payload._violations?.length).toBe(1);
        expect(payload._violations?.[0].outputName).toBe('Seniority');
        expect(payload._violations?.[0].policy).toBe('null');
    });

    it('coerces to Other and records violation when OnViolation is coerce-to-other', async () => {
        const spec: DataFeatureSpec = {
            Name: 'Job Seniority Pipeline',
            Description: 'Classifies seniority',
            PromptID: 'PROMPT-1',
            Context: { Fields: ['Title'] },
            Caching: { Cacheable: false },
            Outputs: [
                {
                    Ref: '$.seniority',
                    Name: 'Seniority',
                    Constraint: {
                        Type: 'enum',
                        Values: ['Executive', 'Director', 'Manager'],
                        OnViolation: 'coerce-to-other',
                    },
                    Target: { Mode: 'field', EntityFieldName: 'Seniority' },
                },
            ],
        };

        mockResult = { seniority: 'VP' };

        const processor = new InferProcessor('PROMPT-1', undefined, spec);
        const result = await processor.ProcessRecord(record, mockContext);

        expect(result.Status).toBe('Succeeded');
        const payload = result.ResultPayload as { seniority: unknown; _violations?: Array<{ outputName: string; policy: string }> };
        expect(payload.seniority).toBe('Other');
        expect(payload._violations?.length).toBe(1);
        expect(payload._violations?.[0].outputName).toBe('Seniority');
        expect(payload._violations?.[0].policy).toBe('coerce-to-other');
    });

    it('coerces quoted string to number when target field is numeric', async () => {
        const spec: DataFeatureSpec = {
            Name: 'Compensation Pipeline',
            Description: 'Extracts numeric comp',
            PromptID: 'PROMPT-1',
            Context: { Fields: ['RawComp'] },
            Caching: { Cacheable: false },
            Outputs: [
                {
                    Ref: '$.comp',
                    Name: 'Compensation',
                    Constraint: {
                        Type: 'numeric',
                        Min: 0,
                        Max: 1000000,
                        OnViolation: 'fail',
                    },
                    Target: { Mode: 'field', EntityFieldName: 'Compensation' },
                },
            ],
        };

        // Target field Compensation has TSType: 'number' in mock provider
        mockResult = { comp: '150000' };

        const processor = new InferProcessor('PROMPT-1', undefined, spec);
        const result = await processor.ProcessRecord(record, mockContext);

        expect(result.Status).toBe('Succeeded');
        expect((result.ResultPayload as { comp: unknown }).comp).toBe(150000);
    });

    it('rejects quoted string for numeric constraint when target field is not numeric', async () => {
        const spec: DataFeatureSpec = {
            Name: 'Notes Pipeline',
            Description: 'Extracts rating',
            PromptID: 'PROMPT-1',
            Context: { Fields: ['RawComp'] },
            Caching: { Cacheable: false },
            Outputs: [
                {
                    Ref: '$.rating',
                    Name: 'Notes',
                    Constraint: {
                        Type: 'numeric',
                        Min: 0,
                        Max: 10,
                        OnViolation: 'fail',
                    },
                    Target: { Mode: 'field', EntityFieldName: 'Notes' },
                },
            ],
        };

        // Target field Notes has TSType: 'string' in mock provider
        mockResult = { rating: '5' };

        const processor = new InferProcessor('PROMPT-1', undefined, spec);
        const result = await processor.ProcessRecord(record, mockContext);

        expect(result.Status).toBe('Failed');
        expect(result.ErrorMessage).toContain('Numeric constraint rejected quoted string value');
    });

    it('populates PromptVersionHash on successful RecordResult', async () => {
        const spec: DataFeatureSpec = {
            Name: 'Provenance Test',
            PromptID: 'PROMPT-1',
            Outputs: [
                {
                    Ref: '$.res',
                    Name: 'Res',
                    Target: { Mode: 'field', EntityFieldName: 'Notes' },
                },
            ],
        };
        mockResult = { res: 'Done' };

        const processor = new InferProcessor('PROMPT-1', undefined, spec);
        const result = await processor.ProcessRecord(record, mockContext);

        expect(result.Status).toBe('Succeeded');
        expect(result.PromptVersionHash).toBeDefined();
        expect(typeof result.PromptVersionHash).toBe('string');
        expect(result.PromptVersionHash!.length).toBe(64); // SHA-256 hex length
    });

    it('filters record fields when Context.Fields is specified', async () => {
        const spec: DataFeatureSpec = {
            Name: 'Field Filter Pipeline',
            PromptID: 'PROMPT-1',
            Context: { Fields: ['Title'] }, // Only Title, exclude RawComp
            Outputs: [
                {
                    Ref: '$.res',
                    Name: 'Res',
                    Target: { Mode: 'field', EntityFieldName: 'Notes' },
                },
            ],
        };
        mockResult = { res: 'Done' };

        const processor = new InferProcessor('PROMPT-1', undefined, spec);
        await processor.ProcessRecord(record, mockContext);

        const promptData = (executedParams as { data: Record<string, unknown> }).data;
        const promptRecord = promptData.record as Record<string, unknown>;
        expect(promptRecord.Title).toBe('VP of Sales');
        expect(promptRecord.RawComp).toBeUndefined();
    });

    it('allows subclasses to override P1-6 lifecycle hooks', async () => {
        let beforeExecuteCalled = false;
        let afterExecuteCalled = false;

        class CustomInferProcessor extends InferProcessor {
            protected override async beforePromptExecute(params: AIPromptParams, rec: RecordRef, ctx: RecordProcessorContext): Promise<void> {
                beforeExecuteCalled = true;
            }
            protected override async afterPromptExecute(res: AIPromptRunResult<unknown>, rec: RecordRef, ctx: RecordProcessorContext): Promise<unknown> {
                afterExecuteCalled = true;
                return { custom: 'value' };
            }
        }

        const spec: DataFeatureSpec = {
            Name: 'Hook Pipeline',
            PromptID: 'PROMPT-1',
            Outputs: [
                {
                    Ref: '$.custom',
                    Name: 'Custom',
                    Target: { Mode: 'field', EntityFieldName: 'Notes' },
                },
            ],
        };

        const processor = new CustomInferProcessor('PROMPT-1', undefined, spec);
        const result = await processor.ProcessRecord(record, mockContext);

        expect(result.Status).toBe('Succeeded');
        expect(beforeExecuteCalled).toBe(true);
        expect(afterExecuteCalled).toBe(true);
        expect(result.ResultPayload).toEqual({ custom: 'value' });
    });

    it('writes back coerced nested property paths and enum casing without mutating prompt singleton', async () => {
        const spec: DataFeatureSpec = {
            Name: 'Nested Pipeline',
            PromptID: 'PROMPT-1',
            Outputs: [
                {
                    Ref: '$.analysis.sentimentScore',
                    Name: 'Score',
                    Constraint: {
                        Type: 'numeric',
                        Min: 0,
                        Max: 100,
                        OnViolation: 'fail',
                    },
                    Target: { Mode: 'field', EntityFieldName: 'Compensation' }, // numeric target
                },
                {
                    Ref: '$.analysis.seniority',
                    Name: 'Seniority',
                    Constraint: {
                        Type: 'enum',
                        Values: ['Director', 'Manager', 'IC'],
                        OnViolation: 'fail',
                    },
                    Target: { Mode: 'field', EntityFieldName: 'Notes' },
                },
            ],
        };

        mockPrompt.ValidationBehavior = 'Warn';
        mockResult = {
            analysis: {
                sentimentScore: '95',
                seniority: 'director',
            },
        };

        const processor = new InferProcessor('PROMPT-1', undefined, spec);
        const result = await processor.ProcessRecord(record, mockContext);

        expect(result.Status).toBe('Succeeded');
        const payload = result.ResultPayload as {
            analysis: { sentimentScore: number; seniority: string };
        };
        expect(payload.analysis.sentimentScore).toBe(95);
        expect(payload.analysis.seniority).toBe('Director');
        // Prompt singleton ValidationBehavior was restored to its original value
        expect(mockPrompt.ValidationBehavior).toBe('Warn');
    });
});
