import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import {
    parsePipelineSpec,
    validatePipelineSpec,
    buildFeatureOutputViewModels,
    buildPromptParamViewModels,
    formatRawPipelineJson,
} from '../record-process-form.component';
import type { DataFeatureSpec, EntityMetadataStub } from '@memberjunction/feature-pipelines';
import type { EntityInfo, EntityFieldInfo } from '@memberjunction/core';

describe('Feature Pipeline Details (Option A) — View-Model & Logic Engines', () => {
    const sampleSpec: DataFeatureSpec = {
        Name: 'Activity Tagging and Sentiment',
        Description: 'Extracts sentiment score and category tags for activities',
        PromptID: 'prompt-uuid-12345',
        Context: {
            QueryID: 'query-uuid-67890',
            QueryParams: {
                ActivityID: 'ID',
                Notes: 'Description',
            },
        },
        Outputs: [
            {
                Name: 'SentimentScore',
                Ref: '$.sentiment',
                FeatureKind: 'numeric',
                Target: {
                    Mode: 'field',
                    EntityFieldName: 'SentimentScore',
                },
                Constraint: {
                    Type: 'numeric',
                    Min: -1.0,
                    Max: 1.0,
                    ViolationPolicy: 'null',
                },
            },
            {
                Name: 'ActivityTags',
                Ref: '$.tags',
                FeatureKind: 'categorical',
                Target: {
                    Mode: 'field',
                    EntityFieldName: 'Tags',
                },
                Constraint: {
                    Type: 'enum',
                    Values: ['Support', 'Sales', 'Feedback', 'Inquiry'],
                    OnViolation: 'coerce-to-other',
                },
            },
        ],
        Caching: {
            Cacheable: true,
            Scope: 'pipeline',
        },
        Watermark: {
            Enabled: true,
            Strategy: 'Checksum',
        },
        CaptureReasoning: true,
    };

    const mockFields: Partial<EntityFieldInfo>[] = [
        { Name: 'ID', TSType: 'string', Type: 'nvarchar' },
        { Name: 'Subject', TSType: 'string', Type: 'nvarchar' },
        { Name: 'Description', TSType: 'string', Type: 'nvarchar' },
        { Name: 'SentimentScore', TSType: 'number', Type: 'decimal' },
        { Name: 'Tags', TSType: 'string', Type: 'nvarchar' },
    ];

    const mockEntityInfo: Partial<EntityInfo> = {
        ID: 'entity-activities-id',
        Name: 'Activities',
        DisplayName: 'Activities',
        Fields: mockFields as EntityFieldInfo[],
    };

    const entityStub: EntityMetadataStub = {
        Name: 'Activities',
        Fields: (mockFields as EntityFieldInfo[]).map((f) => ({
            Name: f.Name,
            TSType: f.TSType,
        })),
    };

    describe('parsePipelineSpec', () => {
        it('correctly parses valid DataFeatureSpec from JSON configuration', () => {
            const raw = JSON.stringify(sampleSpec);
            const spec = parsePipelineSpec(raw);
            expect(spec).not.toBeNull();
            expect(spec?.Name).toBe('Activity Tagging and Sentiment');
            expect(spec?.PromptID).toBe('prompt-uuid-12345');
            expect(spec?.Outputs.length).toBe(2);
        });

        it('handles null, undefined, empty string, or invalid JSON gracefully', () => {
            expect(parsePipelineSpec(null)).toBeNull();
            expect(parsePipelineSpec(undefined)).toBeNull();
            expect(parsePipelineSpec('')).toBeNull();
            expect(parsePipelineSpec('{broken json')).toBeNull();
        });
    });

    describe('validatePipelineSpec', () => {
        it('validates a complete spec without error-level issues', () => {
            const issues = validatePipelineSpec(sampleSpec, entityStub);
            const errors = issues.filter((i) => i.Severity === 'error');
            expect(errors.length).toBe(0);
        });

        it('detects missing prompt or required spec fields', () => {
            const invalidSpec = { ...sampleSpec, PromptID: '' };
            const issues = validatePipelineSpec(invalidSpec, entityStub);
            expect(issues.some((i) => i.Path === 'PromptID')).toBe(true);
        });
    });

    describe('buildFeatureOutputViewModels', () => {
        it('maps spec outputs to rich view-models with constraint summaries and field verification', () => {
            const outputs = buildFeatureOutputViewModels(sampleSpec, mockEntityInfo as EntityInfo);
            expect(outputs.length).toBe(2);

            const sentiment = outputs.find((o) => o.Name === 'SentimentScore');
            expect(sentiment).toBeDefined();
            expect(sentiment?.FeatureKind).toBe('numeric');
            expect(sentiment?.TargetField).toBe('SentimentScore');
            expect(sentiment?.TargetFieldExists).toBe(true);
            expect(sentiment?.TargetFieldType).toBe('number');
            expect(sentiment?.ConstraintSummary).toBe('[-1, 1]');
            expect(sentiment?.ReasoningTarget).toBe('Enabled');

            const tags = outputs.find((o) => o.Name === 'ActivityTags');
            expect(tags).toBeDefined();
            expect(tags?.TargetField).toBe('Tags');
            expect(tags?.TargetFieldExists).toBe(true);
            expect(tags?.ConstraintSummary).toContain('Allowed: Support, Sales, Feedback');
        });

        it('flags missing columns when target field does not exist in target entity', () => {
            const alteredSpec: DataFeatureSpec = {
                ...sampleSpec,
                Outputs: [
                    {
                        Name: 'UnmappedFeature',
                        Ref: '$.unmapped',
                        FeatureKind: 'numeric',
                        Target: {
                            Mode: 'field',
                            EntityFieldName: 'NonExistentColumn99',
                        },
                    },
                ],
            };

            const outputs = buildFeatureOutputViewModels(alteredSpec, mockEntityInfo as EntityInfo);
            expect(outputs.length).toBe(1);
            expect(outputs[0].TargetFieldExists).toBe(false);
            expect(outputs[0].TargetFieldType).toBe('unbound');
        });

        it('falls back to OutputMapping JSON when spec outputs are empty', () => {
            const fallbackMapping = JSON.stringify({
                fields: {
                    SentimentScore: '$.inferredSentiment',
                    Tags: '$.inferredTags',
                },
            });

            const outputs = buildFeatureOutputViewModels(null, mockEntityInfo as EntityInfo, fallbackMapping);
            expect(outputs.length).toBe(2);
            expect(outputs.some((o) => o.TargetField === 'SentimentScore' && o.TargetFieldExists)).toBe(true);
            expect(outputs.some((o) => o.TargetField === 'Tags' && o.TargetFieldExists)).toBe(true);
        });
    });

    describe('buildPromptParamViewModels', () => {
        it('extracts parameter mappings from Context.QueryParams', () => {
            const params = buildPromptParamViewModels(sampleSpec);
            expect(params.length).toBe(2);
            expect(params).toEqual([
                { Param: '@ActivityID', Field: 'ID' },
                { Param: '@Notes', Field: 'Description' },
            ]);
        });

        it('falls back to InputMapping JSON when spec query params are absent', () => {
            const inputMapping = JSON.stringify({
                ParamA: 'FieldA',
                ParamB: 'FieldB',
            });
            const params = buildPromptParamViewModels(null, inputMapping);
            expect(params).toEqual([
                { Param: '@ParamA', Field: 'FieldA' },
                { Param: '@ParamB', Field: 'FieldB' },
            ]);
        });
    });

    describe('formatRawPipelineJson', () => {
        it('formats raw JSON configuration with readable indentation', () => {
            const raw = JSON.stringify({ a: 1, b: 'test' });
            const formatted = formatRawPipelineJson(raw);
            expect(formatted).toBe('{\n  "a": 1,\n  "b": "test"\n}');
        });

        it('returns empty string for null or empty configuration', () => {
            expect(formatRawPipelineJson(null)).toBe('');
            expect(formatRawPipelineJson('')).toBe('');
        });
    });
});
