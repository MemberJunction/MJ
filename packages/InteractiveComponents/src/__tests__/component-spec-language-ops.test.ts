import { describe, it, expect } from 'vitest';
import {
    COMPONENT_LANGUAGES,
    ComponentDataRequirements,
    ComponentOperationDataRequirement,
    ComponentSpec,
    ComponentSpecRuntime,
    DEFAULT_COMPONENT_LANGUAGE,
    IsComponentLanguage,
    IsComponentOperationDataRequirement,
    IsComponentTsxMetadata,
    IsOperationAllowed,
    IsValidOperationKey,
    ResolveAllowedOperations,
    ResolveComponentLanguage,
    ResolveComponentLanguageInfo,
    ResolveErasableSyntaxOnly,
    TSX_DISALLOWED_SYNTAX_KINDS,
    ValidateComponentLanguageSpec,
    ValidateOperationAllowlist,
} from '../index';

function createLegacyJsxSpec(overrides: Partial<ComponentSpec> = {}): ComponentSpec {
    return {
        name: 'LegacyRevenueChart',
        location: 'embedded',
        description: 'Legacy JSX revenue chart without language or operations fields',
        title: 'Revenue Chart',
        type: 'chart',
        code: 'function LegacyRevenueChart({ data }) { return <div>{data.length}</div>; }',
        functionalRequirements: 'Render revenue chart',
        technicalDesign: 'Uses Recharts',
        exampleUsage: '<LegacyRevenueChart />',
        dataRequirements: {
            mode: 'views',
            entities: [
                {
                    name: 'Invoices',
                    displayFields: ['ID', 'Total'],
                    fieldMetadata: [],
                    permissionLevelNeeded: ['read'],
                },
            ],
            queries: [],
        },
        ...overrides,
    };
}

describe('ComponentSpec language & erasableSyntaxOnly (P6)', () => {
    it('exports supported languages with jsx default', () => {
        expect(COMPONENT_LANGUAGES).toEqual(['jsx', 'tsx']);
        expect(DEFAULT_COMPONENT_LANGUAGE).toBe('jsx');
        expect(IsComponentLanguage('jsx')).toBe(true);
        expect(IsComponentLanguage('tsx')).toBe(true);
        expect(IsComponentLanguage('ts')).toBe(false);
        expect(IsComponentLanguage('python')).toBe(false);
        expect(IsComponentLanguage(undefined)).toBe(false);
    });

    it('defaults omitted language on legacy JSX specs to jsx without modification (G9)', () => {
        const legacy = createLegacyJsxSpec();
        expect(legacy.language).toBeUndefined();
        expect(ResolveComponentLanguage(legacy)).toBe('jsx');
        expect(ResolveErasableSyntaxOnly(legacy)).toBe(false);

        const info = ResolveComponentLanguageInfo(legacy);
        expect(info).toEqual({
            language: 'jsx',
            isTsx: false,
            erasableSyntaxOnly: false,
            jsxTransform: 'react',
            disallowedSyntax: [],
        });

        const validation = ValidateComponentLanguageSpec(legacy);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toEqual([]);
        expect(validation.resolved?.language).toBe('jsx');
    });

    it('resolves TSX defaults with erasableSyntaxOnly: true and validates tsxMetadata', () => {
        const tsxSpec = createLegacyJsxSpec({
            name: 'TypedPipelineWidget',
            language: 'tsx',
            code: 'export function TypedPipelineWidget(props: { title: string }) { return <div>{props.title}</div>; }',
        });

        expect(ResolveComponentLanguage(tsxSpec)).toBe('tsx');
        expect(ResolveErasableSyntaxOnly(tsxSpec)).toBe(true);

        const info = ResolveComponentLanguageInfo(tsxSpec);
        expect(info.isTsx).toBe(true);
        expect(info.erasableSyntaxOnly).toBe(true);
        expect(info.disallowedSyntax).toEqual(TSX_DISALLOWED_SYNTAX_KINDS);

        const explicitTsxSpec = createLegacyJsxSpec({
            language: 'tsx',
            erasableSyntaxOnly: true,
            tsxMetadata: {
                erasableSyntaxOnly: true,
                jsxTransform: 'react-jsx',
                targetTypeScriptVersion: '5.9',
                disallowedSyntax: ['enum', 'namespace', 'parameter-property'],
            },
        });
        expect(IsComponentTsxMetadata(explicitTsxSpec.tsxMetadata)).toBe(true);
        const validation = ValidateComponentLanguageSpec(explicitTsxSpec);
        expect(validation.valid).toBe(true);
        expect(validation.resolved?.jsxTransform).toBe('react-jsx');
        expect(validation.resolved?.disallowedSyntax).toEqual(['enum', 'namespace', 'parameter-property']);
    });

    it('rejects unsupported language strings, malformed tsxMetadata, and conflicting flags', () => {
        const badLang = ValidateComponentLanguageSpec({ language: 'svelte' });
        expect(badLang.valid).toBe(false);
        expect(badLang.errors[0]).toContain('Unsupported component language');

        const badMeta = ValidateComponentLanguageSpec({
            language: 'tsx',
            tsxMetadata: { erasableSyntaxOnly: 'yes', disallowedSyntax: ['classes'] },
        });
        expect(badMeta.valid).toBe(false);

        const conflict = ValidateComponentLanguageSpec({
            language: 'tsx',
            erasableSyntaxOnly: false,
            tsxMetadata: { erasableSyntaxOnly: true },
        });
        expect(conflict.valid).toBe(false);
        expect(conflict.errors[0]).toContain('Conflicting erasableSyntaxOnly');
    });

    it('preserves JSON.stringify / JSON.parse round-trip parity for JSX and TSX specs', () => {
        const tsxWithOps = createLegacyJsxSpec({
            language: 'tsx',
            erasableSyntaxOnly: true,
            tsxMetadata: {
                erasableSyntaxOnly: true,
                jsxTransform: 'react-jsx',
            },
            dataRequirements: {
                mode: 'hybrid',
                entities: [],
                queries: [],
                operations: [
                    {
                        operationKey: 'Template.Run',
                        executionMode: 'Sync',
                        requiredScope: 'templates:execute',
                        description: 'Render summary template',
                    },
                ],
            },
        });

        const roundTripped = ComponentSpecRuntime.FromJSON(JSON.stringify(tsxWithOps));
        expect(roundTripped.language).toBe('tsx');
        expect(roundTripped.erasableSyntaxOnly).toBe(true);
        expect(roundTripped.tsxMetadata?.jsxTransform).toBe('react-jsx');
        expect(ResolveAllowedOperations(roundTripped.dataRequirements)).toHaveLength(1);
        expect(IsOperationAllowed(roundTripped.dataRequirements, 'Template.Run')).toBe(true);
    });
});

describe('ComponentDataRequirements.operations allowlist (P11)', () => {
    it('enforces strict default-deny when operations is omitted or null', () => {
        const legacyReq: ComponentDataRequirements = {
            mode: 'views',
            entities: [],
            queries: [],
        };

        expect(ResolveAllowedOperations(legacyReq)).toEqual([]);
        expect(ResolveAllowedOperations(undefined)).toEqual([]);
        expect(ResolveAllowedOperations(null)).toEqual([]);
        expect(IsOperationAllowed(legacyReq, 'Template.Run')).toBe(false);
        expect(IsOperationAllowed(undefined, 'Template.Run')).toBe(false);
    });

    it('validates exact operation keys and rejects empty, whitespace, or wildcard patterns', () => {
        expect(IsValidOperationKey('Template.Run')).toBe(true);
        expect(IsValidOperationKey('RecordProcess.GetRunStatus')).toBe(true);
        expect(IsValidOperationKey('org/domain:Run_v2-check')).toBe(true);

        expect(IsValidOperationKey('')).toBe(false);
        expect(IsValidOperationKey('   ')).toBe(false);
        expect(IsValidOperationKey(' Template.Run')).toBe(false);
        expect(IsValidOperationKey('*')).toBe(false);
        expect(IsValidOperationKey('RecordProcess.*')).toBe(false);
        expect(IsValidOperationKey('Template.R?n')).toBe(false);
        expect(IsValidOperationKey('.leadingDot')).toBe(false);
    });

    it('validates ComponentOperationDataRequirement entries and rejects duplicates/malformed entries', () => {
        const validOp: ComponentOperationDataRequirement = {
            operationKey: 'PredictiveStudio.ScoreRecordSet',
            description: 'Score lead renewal probabilities',
            executionMode: 'LongRunning',
            requiredScope: 'ml:score',
            inputSchema: {
                type: 'object',
                properties: { modelId: { type: 'string' } },
            },
            maxCallsPerMinute: 12,
            optional: true,
        };
        expect(IsComponentOperationDataRequirement(validOp)).toBe(true);

        const validResult = ValidateOperationAllowlist([
            validOp,
            { operationKey: 'Template.Run', executionMode: 'Sync' },
        ]);
        expect(validResult.valid).toBe(true);
        expect(validResult.allowlist).toHaveLength(2);

        const invalidResult = ValidateOperationAllowlist([
            { operationKey: 'RecordProcess.*' },
            { operationKey: '' },
            { operationKey: 'Template.Run', maxCallsPerMinute: -5 },
            { operationKey: 'Template.Run' },
            { operationKey: 'Template.Run' }, // duplicate
        ]);
        expect(invalidResult.valid).toBe(false);
        expect(invalidResult.errors.length).toBeGreaterThanOrEqual(4);
    });

    it('never leaks invalid/wildcard entries through ResolveAllowedOperations or IsOperationAllowed', () => {
        const hostileRequirements: ComponentDataRequirements = {
            mode: 'views',
            entities: [],
            queries: [],
            operations: [
                { operationKey: '*' },
                { operationKey: 'RecordProcess.*' },
                { operationKey: 'Template.Run' },
            ],
        };

        const resolved = ResolveAllowedOperations(hostileRequirements);
        expect(resolved.map((o) => o.operationKey)).toEqual(['Template.Run']);
        expect(IsOperationAllowed(hostileRequirements, '*')).toBe(false);
        expect(IsOperationAllowed(hostileRequirements, 'RecordProcess.CancelRun')).toBe(false);
        expect(IsOperationAllowed(hostileRequirements, 'Template.Run')).toBe(true);
    });
});
