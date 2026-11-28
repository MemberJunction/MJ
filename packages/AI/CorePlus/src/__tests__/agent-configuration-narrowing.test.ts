import { describe, expect, it } from 'vitest';
import {
    DoesAgentAllowWidenFromBase,
    FindScopeConfigWideningViolations,
    FoldRebaseAwareChain,
    HasPathTraversalSegment,
    IntersectPayloadPathSets,
    IsAttachmentRootPathWithinAncestor,
    IsPayloadPathSetWithinAncestor,
    IsPayloadScopeWithinAncestor,
    JsonHasAllowWidenFromBaseKey,
    NarrowAttachmentRootPath,
    NarrowPayloadScope,
    NarrowScopeConfigObjects,
    ResolveAgentRunLimits,
    ValidateAgentConfigurationJson,
    type IAgentConfiguration,
} from '../index';

describe('IAgentConfiguration allowWidenFromBase & narrowing helpers', () => {
    it('validates allowWidenFromBase in ValidateAgentConfigurationJson', () => {
        expect(ValidateAgentConfigurationJson(JSON.stringify({ allowWidenFromBase: true }))).toEqual([]);
        expect(ValidateAgentConfigurationJson(JSON.stringify({ allowWidenFromBase: false }))).toEqual([]);
        expect(ValidateAgentConfigurationJson(JSON.stringify({ allowWidenFromBase: null }))).toEqual([]);
        expect(ValidateAgentConfigurationJson(JSON.stringify({ allowWidenFromBase: 'true' }))).toEqual([
            'Configuration.allowWidenFromBase must be a boolean or null.',
        ]);
        expect(ValidateAgentConfigurationJson(JSON.stringify({ allowWidenFromBase: 1 }))).toEqual([
            'Configuration.allowWidenFromBase must be a boolean or null.',
        ]);

        expect(DoesAgentAllowWidenFromBase(JSON.stringify({ allowWidenFromBase: true }))).toBe(true);
        expect(DoesAgentAllowWidenFromBase(JSON.stringify({ allowWidenFromBase: false }))).toBe(false);
        expect(DoesAgentAllowWidenFromBase(null)).toBe(false);
        expect(JsonHasAllowWidenFromBaseKey(JSON.stringify({ allowWidenFromBase: false }))).toBe(true);
        expect(JsonHasAllowWidenFromBaseKey(JSON.stringify({ execution: { requirePlanMode: true } }))).toBe(false);
    });

    it('folds L0 -> L1 -> L2 with rebase at allowWidenFromBase: true and downstream narrowing', () => {
        const nodes = [{ cap: 10 }, { cap: 25 }, { cap: 40 }, { cap: 15 }];
        const configs: Array<IAgentConfiguration | null> = [
            null,
            { allowWidenFromBase: true },
            null,
            null,
        ];
        // L0=10 -> L1(rebase)=25 -> L2(40 clamped to 25)=25 -> L3(15 narrowed)=15
        const result = FoldRebaseAwareChain({
            Nodes: nodes,
            NodeConfigs: configs,
            Seed: nodes[0].cap,
            GetNodeValue: (n) => n.cap,
            Narrow: (acc, next) => Math.min(acc, next),
        });
        expect(result).toBe(15);

        // Without rebase on L1, every step clamps to L0=10
        const strictResult = FoldRebaseAwareChain({
            Nodes: nodes,
            NodeConfigs: [null, null, null, null],
            Seed: nodes[0].cap,
            GetNodeValue: (n) => n.cap,
            Narrow: (acc, next) => Math.min(acc, next),
        });
        expect(strictResult).toBe(10);
    });

    it('intersects payload path glob sets preserving [] (bottom) and * / null (top)', () => {
        expect(IntersectPayloadPathSets(['*'], ['customer.*'])).toEqual(['customer.*']);
        expect(IntersectPayloadPathSets(null, ['customer.*'])).toEqual(['customer.*']);
        expect(IntersectPayloadPathSets(['customer.*'], ['*'])).toEqual(['customer.*']);
        expect(IntersectPayloadPathSets(['customer.*', 'orderId'], ['customer.name', 'secret.key'])).toEqual([
            'customer.name',
        ]);
        expect(IntersectPayloadPathSets(['customer.name'], ['customer.*'])).toEqual(['customer.name']);
        expect(IntersectPayloadPathSets(['customer.*'], ['billing.*'])).toEqual([]);
        expect(IntersectPayloadPathSets([], ['customer.*'])).toEqual([]);
        expect(IntersectPayloadPathSets(['items[*].price'], ['items[0].price'])).toEqual(['items[0].price']);

        expect(IsPayloadPathSetWithinAncestor(['customer.*'], ['customer.name'])).toBe(true);
        expect(IsPayloadPathSetWithinAncestor(['customer.*'], [])).toBe(true);
        expect(IsPayloadPathSetWithinAncestor(['customer.*'], ['customer.name', 'secret.key'])).toBe(false);
        expect(IsPayloadPathSetWithinAncestor(['customer.*'], ['*'])).toBe(false);
        expect(IsPayloadPathSetWithinAncestor([], ['customer.name'])).toBe(false);
        expect(IsPayloadPathSetWithinAncestor([], [])).toBe(true);
    });

    it('locks PayloadScope and AttachmentRootPath subtrees and rejects .. traversal', () => {
        expect(HasPathTraversalSegment('/analysis/../secret')).toBe(true);
        expect(HasPathTraversalSegment('../escape')).toBe(true);
        expect(HasPathTraversalSegment('/analysis/sub')).toBe(false);

        expect(NarrowPayloadScope('/analysis', '/analysis/sub')).toBe('/analysis/sub');
        expect(NarrowPayloadScope('/analysis', '/billing')).toBe('/analysis');
        expect(NarrowPayloadScope('/analysis', '/analysis/../billing')).toBe('/analysis');
        expect(NarrowPayloadScope('/analysis', null)).toBe('/analysis');

        expect(IsPayloadScopeWithinAncestor('/analysis', '/analysis/sub')).toBe(true);
        expect(IsPayloadScopeWithinAncestor('/analysis', '/analysis')).toBe(true);
        expect(IsPayloadScopeWithinAncestor('/analysis', '/billing')).toBe(false);
        expect(IsPayloadScopeWithinAncestor('/analysis', null)).toBe(false);
        expect(IsPayloadScopeWithinAncestor('/analysis', '/analysis/../billing')).toBe(false);

        expect(NarrowAttachmentRootPath('/org/finance', '/org/finance/q4')).toBe('/org/finance/q4');
        expect(NarrowAttachmentRootPath('/org/finance', 'q4/drafts')).toBe('/org/finance/q4/drafts');
        expect(NarrowAttachmentRootPath('/org/finance', '/org/hr')).toBe('/org/finance');
        expect(NarrowAttachmentRootPath('/org/finance', '../hr')).toBe('/org/finance');

        expect(IsAttachmentRootPathWithinAncestor('/org/finance', '/org/finance/q4')).toBe(true);
        expect(IsAttachmentRootPathWithinAncestor('/org/finance', 'q4')).toBe(true);
        expect(IsAttachmentRootPathWithinAncestor('/org/finance', '/org/hr')).toBe(false);
        expect(IsAttachmentRootPathWithinAncestor('/org/finance', '/org/finance/../hr')).toBe(false);
    });

    it('intersects ScopeConfig per key and detects widening violations', () => {
        const ancestor = {
            tenantId: 'tenant-a',
            regions: ['us-east', 'us-west'],
            nested: { tier: 'gold', tags: ['a', 'b'] },
        };
        const child = {
            tenantId: 'tenant-b', // scalar locked to ancestor
            regions: ['us-east', 'eu-west'], // intersected to ['us-east']
            nested: { tier: 'bronze', tags: ['b', 'c'], extra: true },
            department: 'sales', // net-new extra filter allowed
        };
        const narrowed = NarrowScopeConfigObjects(ancestor, child);
        expect(narrowed).toEqual({
            tenantId: 'tenant-a',
            regions: ['us-east'],
            nested: { tier: 'gold', tags: ['b'], extra: true },
            department: 'sales',
        });

        const violations = FindScopeConfigWideningViolations(ancestor, child);
        expect(violations.length).toBeGreaterThanOrEqual(3);
        expect(violations.some((v) => v.includes('tenantId'))).toBe(true);
        expect(violations.some((v) => v.includes('regions'))).toBe(true);
        expect(violations.some((v) => v.includes('nested.tier'))).toBe(true);

        expect(
            FindScopeConfigWideningViolations(ancestor, {
                tenantId: 'tenant-a',
                regions: ['us-east'],
                department: 'sales',
            })
        ).toEqual([]);
    });

    it('ResolveAgentRunLimits rebases at allowWidenFromBase: true while keeping MjConfig ceilings unconditional', () => {
        const l0 = {
            MaxCostPerRun: 5,
            MaxTokensPerRun: 100000,
            MaxTimePerRun: 600,
            TypeConfiguration: null,
            Configuration: null,
        };
        const l1Rebase = {
            MaxCostPerRun: 25,
            MaxTokensPerRun: null, // unset inherits L0 (100000)
            MaxTimePerRun: 1200,
            TypeConfiguration: null,
            Configuration: JSON.stringify({ allowWidenFromBase: true }),
        };
        const l2Narrow = {
            MaxCostPerRun: 15, // above L0 (5), within L1 (25)
            MaxTokensPerRun: 500000, // L2 without allowWidenFromBase clamped to L0's 100000
            MaxTimePerRun: 3000, // clamped to L1's 1200
            TypeConfiguration: null,
            Configuration: null,
        };

        const withoutOrgCap = ResolveAgentRunLimits({
            AncestorAgents: [l0, l1Rebase],
            Agent: l2Narrow,
        });
        expect(withoutOrgCap.Limits.Budgets.PerRun.MaxCostUsd).toBe(15);
        expect(withoutOrgCap.Limits.Budgets.PerRun.MaxTokens).toBe(100000);
        expect(withoutOrgCap.Limits.Budgets.PerRun.MaxWallClockMs).toBe(1200000);

        // Even with allowWidenFromBase: true on L1, mj.config.cjs ceiling ALWAYS clamps unconditionally
        const withOrgCap = ResolveAgentRunLimits({
            MjConfigLimits: { Budgets: { PerRun: { MaxCostUsd: 10 } } },
            AncestorAgents: [l0],
            Agent: l1Rebase,
            Options: { EnforceConfiguredCeilings: true },
        });
        expect(withOrgCap.Limits.Budgets.PerRun.MaxCostUsd).toBe(10);
    });
});
