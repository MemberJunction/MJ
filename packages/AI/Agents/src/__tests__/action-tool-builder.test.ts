import { describe, it, expect } from 'vitest';
import { BuildToolFromAction, BuildActionToolSet, SanitizeToolName } from '../native-tools/action-tool-builder';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';
import type { MJActionParamEntity } from '@memberjunction/core-entities';

/** Minimal stand-ins: the builder reads plain fields, so a literal is a faithful input. */
const action = (Name: string, Description: string | null = null, ID = Name): MJActionEntityExtended =>
    ({ ID, Name, Description } as unknown as MJActionEntityExtended);

/** An Action with result codes, the way the engine's related-record collection exposes them. */
const actionWithCodes = (
    Name: string,
    Description: string,
    codes: Array<{ ResultCode: string; IsSuccess: boolean; Description: string | null }>
): MJActionEntityExtended =>
    ({ ID: Name, Name, Description, ResultCodes: { Items: codes } } as unknown as MJActionEntityExtended);

const param = (over: Partial<MJActionParamEntity>): MJActionParamEntity => ({
    Name: 'p', Type: 'Input', ValueType: 'Scalar', IsArray: false, IsRequired: false,
    Description: null, DefaultValue: null, ...over
} as unknown as MJActionParamEntity);

describe('sanitizeToolName', () => {
    it('produces a provider-legal name', () => {
        expect(SanitizeToolName('Run Ad-hoc Query')).toBe('run_ad_hoc_query');
        expect(SanitizeToolName('  Get   Weather!! ')).toBe('get_weather');
        expect(SanitizeToolName('A/B — Test')).toBe('a_b_test');
    });

    it('caps at the 64-character provider limit', () => {
        expect(SanitizeToolName('x'.repeat(200))).toHaveLength(64);
    });
});

describe('buildToolFromAction', () => {
    it('declares only Input and Both params — never Output', () => {
        const tool = BuildToolFromAction(action('Do Thing'), [
            param({ Name: 'inValue', Type: 'Input' }),
            param({ Name: 'bothValue', Type: 'Both' }),
            param({ Name: 'outValue', Type: 'Output' })
        ]);
        const props = (tool.inputSchema as { properties: Record<string, unknown> }).properties;
        expect(Object.keys(props).sort()).toEqual(['bothValue', 'inValue']);
    });

    it('maps Scalar to the union type the plan specifies', () => {
        const tool = BuildToolFromAction(action('T'), [param({ Name: 'n', ValueType: 'Scalar' })]);
        const props = (tool.inputSchema as { properties: Record<string, { type: unknown }> }).properties;
        expect(props.n.type).toEqual(['string', 'number', 'boolean']);
    });

    it('maps every opaque ValueType to string, not object', () => {
        // Measured: 'Other' typed as object produced `Query: {}` on 40% of calls.
        for (const vt of ['Other', 'Simple Object', 'BaseEntity Sub-Class', 'MediaOutput'] as const) {
            const tool = BuildToolFromAction(action('T'), [param({ Name: 'q', ValueType: vt })]);
            const props = (tool.inputSchema as { properties: Record<string, { type: unknown }> }).properties;
            expect(props.q.type).toBe('string');
        }
    });

    it('wraps arrays around the element schema rather than replacing it', () => {
        const tool = BuildToolFromAction(action('T'), [param({ Name: 'ids', ValueType: 'Scalar', IsArray: true })]);
        const props = (tool.inputSchema as { properties: Record<string, { type: string; items: { type: unknown } }> }).properties;
        expect(props.ids.type).toBe('array');
        expect(props.ids.items.type).toEqual(['string', 'number', 'boolean']);
    });

    it('lists required params and omits the key when there are none', () => {
        const withReq = BuildToolFromAction(action('T'), [param({ Name: 'a', IsRequired: true }), param({ Name: 'b' })]);
        expect((withReq.inputSchema as { required: string[] }).required).toEqual(['a']);
        const noReq = BuildToolFromAction(action('T'), [param({ Name: 'b' })]);
        expect(noReq.inputSchema).not.toHaveProperty('required');
    });

    it('carries DefaultValue into the description, since the schema has nowhere for it', () => {
        const tool = BuildToolFromAction(action('T'), [param({ Name: 'top', Description: 'Row cap.', DefaultValue: '100' })]);
        const props = (tool.inputSchema as { properties: Record<string, { description: string }> }).properties;
        expect(props.top.description).toBe('Row cap. Default: 100.');
    });

    it('phrases the tool description prescriptively', () => {
        expect(BuildToolFromAction(action('Get Weather', 'Fetch current conditions'), []).description)
            .toBe('Call this when you need to: Fetch current conditions');
    });
});

describe('buildActionToolSet', () => {
    it('returns a reverse map so a call resolves back to its Action', () => {
        const a = action('Run Ad-hoc Query', null, 'id-1');
        const set = BuildActionToolSet([a], new Map([['id-1', [param({ Name: 'Query', ValueType: 'Other' })]]]));
        expect(set.tools).toHaveLength(1);
        expect(set.byToolName.get('run_ad_hoc_query')?.action).toBe(a);
    });

    it('throws on a post-sanitization collision instead of silently shadowing', () => {
        // Without this, every call to the shared name dispatches whichever Action registered
        // last — a routing bug that presents as a model error.
        expect(() => BuildActionToolSet(
            [action('Get Weather', null, 'id-1'), action('Get-Weather', null, 'id-2')],
            new Map()
        )).toThrow(/collision/i);
    });

    it('throws when a name sanitizes to nothing', () => {
        expect(() => BuildActionToolSet([action('!!!', null, 'id-1')], new Map())).toThrow(/empty tool name/i);
    });
});

/**
 * The description must carry what the prose catalog carries — outputs and result codes included.
 * Measurement showed the cost of leaving them out: identical confusion pairs in both arms, but
 * P(right tool | acted) 12pp worse in native on GPT-OSS-120B, because the discriminating lines
 * (`NO_MATCHES ✓ … Proceed with ad-hoc SQL`) were in the prose and not in the declaration.
 */
describe('buildToolFromAction — description parity with the prose catalog', () => {
    it('lists output params under Returns, with their descriptions', () => {
        const tool = BuildToolFromAction(action('Run Query', 'Execute SQL'), [
            param({ Name: 'Query', Type: 'Input' }),
            param({ Name: 'Results', Type: 'Output', Description: 'Array of result rows' }),
            param({ Name: 'RowCount', Type: 'Output', Description: null })
        ]);
        expect(tool.description).toContain('Returns: Results (Array of result rows), RowCount');
        // Output params are described, never declared as inputs.
        expect(Object.keys((tool.inputSchema as { properties: Record<string, unknown> }).properties)).toEqual(['Query']);
    });

    it("lists result codes under Results with the prose catalog's ✓/✗ convention", () => {
        const tool = BuildToolFromAction(actionWithCodes('Search Catalog', 'Find saved queries', [
            { ResultCode: 'SUCCESS', IsSuccess: true, Description: 'Found matches.' },
            { ResultCode: 'NO_MATCHES', IsSuccess: true, Description: 'Nothing matched. Proceed with ad-hoc SQL.' },
            { ResultCode: 'EMBEDDING_FAILED', IsSuccess: false, Description: null }
        ]), []);
        expect(tool.description).toContain(
            'Results: SUCCESS ✓ Found matches. · NO_MATCHES ✓ Nothing matched. Proceed with ad-hoc SQL. · EMBEDDING_FAILED ✗');
    });

    it('omits a description that merely restates its code', () => {
        const tool = BuildToolFromAction(actionWithCodes('T', 'd', [
            { ResultCode: 'SUCCESS', IsSuccess: true, Description: 'success' }
        ]), []);
        expect(tool.description).toContain('Results: SUCCESS ✓');
        expect(tool.description).not.toContain('SUCCESS ✓ success');
    });

    it('adds no Returns or Results section when there is nothing to say', () => {
        expect(BuildToolFromAction(action('Get Weather', 'Fetch current conditions'), []).description)
            .toBe('Call this when you need to: Fetch current conditions');
    });

    it('never exceeds the description ceiling', () => {
        const long = 'x'.repeat(600);
        const tool = BuildToolFromAction(
            actionWithCodes('Big', 'Does many things', Array.from({ length: 20 }, (_, i) =>
                ({ ResultCode: `CODE_${i}`, IsSuccess: i % 2 === 0, Description: long }))),
            Array.from({ length: 16 }, (_, i) => param({ Name: `Out${i}`, Type: 'Output', Description: long })));
        expect(tool.description.length).toBeLessThanOrEqual(1024);
    });

    it('shrinks descriptions before dropping names or codes', () => {
        // Names and codes are the cheap, high-information part; a blind slice would keep the first
        // few in full and lose the rest, which is the worst trade available.
        const long = 'y'.repeat(500);
        const tool = BuildToolFromAction(
            actionWithCodes('Big', 'Does many things', Array.from({ length: 14 }, (_, i) =>
                ({ ResultCode: `CODE_${i}`, IsSuccess: true, Description: long }))),
            Array.from({ length: 10 }, (_, i) => param({ Name: `Out${i}`, Type: 'Output', Description: long })));
        for (let i = 0; i < 14; i++) expect(tool.description).toContain(`CODE_${i} ✓`);
        for (let i = 0; i < 10; i++) expect(tool.description).toContain(`Out${i}`);
        expect(tool.description.length).toBeLessThanOrEqual(1024);
    });

    it('degrades a Run Ad-hoc Query-sized action to names and codes — the measured operating point', () => {
        // 8 outputs and 9 result codes with sentence-long text. This shape was measured at
        // full detail (4,096) and compact (1,024): compact won on selection accuracy on every model
        // and the smallest model paid ~700 tokens/call for the sentences. So a large Action is
        // EXPECTED to lose its per-item prose here while keeping every name and code.
        const tool = BuildToolFromAction(
            actionWithCodes('Run Ad-hoc Query', 'Executes a read-only SQL SELECT query.', Array.from({ length: 9 }, (_, i) =>
                ({ ResultCode: `CODE_${i}`, IsSuccess: i === 0, Description: 'Query contains non-SELECT statements (INSERT, UPDATE, DELETE, DROP, etc.). Only SELECT queries are allowed.' }))),
            Array.from({ length: 8 }, (_, i) => param({ Name: `Out${i}`, Type: 'Output', Description: 'Array of result rows. Each row is an object with column names as keys and values as data.' })));
        expect(tool.description.length).toBeLessThanOrEqual(1024);
        for (let i = 0; i < 9; i++) expect(tool.description).toContain(`CODE_${i} ${i === 0 ? '✓' : '✗'}`);
        for (let i = 0; i < 8; i++) expect(tool.description).toContain(`Out${i}`);
    });
});

import { FilterDeclarableActions } from '../native-tools/action-tool-builder';

describe('filterDeclarableActions — per agent-action declaration control', () => {
    const action = (id: string, name: string) => ({ ID: id, Name: name } as unknown as MJActionEntityExtended);
    const actions = [action('A1', 'Scoped Search'), action('A2', 'Get Weather'), action('A3', 'Skill Granted Action')];

    it('keeps every action when no row opts out', () => {
        const rows = [{ ActionID: 'A1', DeclareAsNativeTool: true }, { ActionID: 'A2', DeclareAsNativeTool: true }];
        expect(FilterDeclarableActions(actions, rows).map((a) => a.Name)).toEqual(['Scoped Search', 'Get Weather', 'Skill Granted Action']);
    });

    it('drops an action whose agent-action row says DeclareAsNativeTool = false', () => {
        const rows = [{ ActionID: 'A1', DeclareAsNativeTool: false }, { ActionID: 'A2', DeclareAsNativeTool: true }];
        expect(FilterDeclarableActions(actions, rows).map((a) => a.Name)).toEqual(['Get Weather', 'Skill Granted Action']);
    });

    it('matches action IDs case-insensitively, as every other UUID comparison in the framework does', () => {
        expect(FilterDeclarableActions(actions, [{ ActionID: 'a1', DeclareAsNativeTool: false }]).map((a) => a.Name)).toEqual(['Get Weather', 'Skill Granted Action']);
    });

    it('keeps an action with no agent-action row at all (a skill-granted action is declarable by default)', () => {
        expect(FilterDeclarableActions(actions, []).length).toBe(3);
    });
});
