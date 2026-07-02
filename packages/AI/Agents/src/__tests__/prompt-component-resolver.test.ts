import { describe, it, expect } from 'vitest';
import { MJScopedPromptPartEntity } from '@memberjunction/core-entities';
import { PromptComponentResolver, PromptComponentScope } from '../prompt-component-resolver';

/**
 * Builds a ScopedPromptPart-shaped fixture (only the fields the resolver reads).
 * Defaults: Active, global (no scope), Override, Priority 0, Sort 0, System role.
 */
function part(over: Partial<Record<string, unknown>>): MJScopedPromptPartEntity {
    return {
        PromptID: 'P1',
        Name: 'X',
        Role: 'System',
        Sort: 0,
        Text: 'text',
        Status: 'Active',
        PrimaryScopeEntityID: null,
        PrimaryScopeRecordID: null,
        SecondaryScopes: null,
        MergeBehavior: 'Override',
        Priority: 0,
        ...over,
    } as unknown as MJScopedPromptPartEntity;
}

/** Resolver whose candidate set is the supplied fixtures (mirrors base PromptID + Status filtering). */
class TestResolver extends PromptComponentResolver {
    constructor(private fixtures: MJScopedPromptPartEntity[]) {
        super();
    }
    protected override getCandidates(promptID: string): MJScopedPromptPartEntity[] {
        return this.fixtures.filter(
            (p) => p.PromptID === promptID && (p.Status === 'Active' || p.Status === 'Provisional'),
        );
    }
}

const ORG_SCOPE: PromptComponentScope = { primaryScopeEntityId: 'E1', primaryScopeRecordId: 'ORG1' };
const names = (parts: MJScopedPromptPartEntity[]) => parts.map((p) => `${p.Name}=${p.Text}`);

describe('PromptComponentResolver — scope cascade (Override)', () => {
    const fixtures = [
        part({ Name: 'Persona', Text: 'GLOBAL' }),
        part({ Name: 'Persona', Text: 'ORG', PrimaryScopeEntityID: 'E1', PrimaryScopeRecordID: 'ORG1' }),
    ];

    it('most-specific (org) part wins when the run is in that scope', () => {
        const r = new TestResolver(fixtures).Resolve('P1', ORG_SCOPE);
        expect(names(r)).toEqual(['Persona=ORG']); // replace: only the org part
    });

    it('falls back to the global part when the run has no scope', () => {
        const r = new TestResolver(fixtures).Resolve('P1', {});
        expect(names(r)).toEqual(['Persona=GLOBAL']); // org part filtered out, global wins
    });

    it('uses the global part when the run is in a DIFFERENT org', () => {
        const r = new TestResolver(fixtures).Resolve('P1', { primaryScopeEntityId: 'E1', primaryScopeRecordId: 'OTHER' });
        expect(names(r)).toEqual(['Persona=GLOBAL']);
    });
});

describe('PromptComponentResolver — MergeBehavior Append', () => {
    it('includes BOTH same-named parts when the in-scope (most-specific) one is Append', () => {
        const fixtures = [
            part({ Name: 'Rule', Text: 'G', Sort: 1, MergeBehavior: 'Append' }),
            part({ Name: 'Rule', Text: 'O', Sort: 2, MergeBehavior: 'Append', PrimaryScopeEntityID: 'E1', PrimaryScopeRecordID: 'ORG1' }),
        ];
        const r = new TestResolver(fixtures).Resolve('P1', ORG_SCOPE);
        expect(names(r)).toEqual(['Rule=G', 'Rule=O']); // additive within the Name, ordered by Sort
    });
});

describe('PromptComponentResolver — additive across Names', () => {
    it('keeps every distinct Name, ordered by Sort', () => {
        const fixtures = [
            part({ Name: 'Tone', Text: 'T', Sort: 20 }),
            part({ Name: 'Persona', Text: 'P', Sort: 10 }),
        ];
        const r = new TestResolver(fixtures).Resolve('P1', {});
        expect(names(r)).toEqual(['Persona=P', 'Tone=T']); // Sort ASC
    });
});

describe('PromptComponentResolver — Priority tie-break', () => {
    it('higher Priority wins among same-Name parts at equal scope specificity (Override)', () => {
        const fixtures = [
            part({ Name: 'Persona', Text: 'LOW', Priority: 1 }),
            part({ Name: 'Persona', Text: 'HIGH', Priority: 5 }),
        ];
        const r = new TestResolver(fixtures).Resolve('P1', {});
        expect(names(r)).toEqual(['Persona=HIGH']);
    });
});

describe('PromptComponentResolver — status filtering', () => {
    it('excludes Archived, includes Active and Provisional', () => {
        const fixtures = [
            part({ Name: 'A', Text: 'a', Status: 'Active' }),
            part({ Name: 'B', Text: 'b', Status: 'Provisional' }),
            part({ Name: 'C', Text: 'c', Status: 'Archived' }),
        ];
        const r = new TestResolver(fixtures).Resolve('P1', {});
        expect(names(r).sort()).toEqual(['A=a', 'B=b']);
    });
});

describe('PromptComponentResolver — role-faithful assembly', () => {
    it('preserves roles and coalesces adjacent same-role parts', () => {
        const resolver = new PromptComponentResolver();
        const msgs = resolver.AssembleMessages([
            part({ Name: 'Sys1', Role: 'System', Text: 'You are helpful.' }),
            part({ Name: 'Sys2', Role: 'System', Text: 'Be concise.' }),
            part({ Name: 'Ex', Role: 'Assistant', Text: 'Got it.' }),
        ]);
        expect(msgs).toEqual([
            { role: 'system', content: 'You are helpful.\n\nBe concise.' }, // adjacent system coalesced
            { role: 'assistant', content: 'Got it.' },
        ]);
    });

    it('skips empty parts', () => {
        const resolver = new PromptComponentResolver();
        expect(resolver.AssembleMessages([part({ Text: '   ' })])).toEqual([]);
    });
});

describe('PromptComponentResolver — secondary scope (cascading)', () => {
    it('a part requiring a secondary dimension only matches when the run supplies it', () => {
        const fixtures = [
            part({ Name: 'Persona', Text: 'GLOBAL' }),
            part({ Name: 'Persona', Text: 'CHANNELED', SecondaryScopes: JSON.stringify({ ChannelID: 'C1' }) }),
        ];
        const inChannel = new TestResolver(fixtures).Resolve('P1', { secondaryScopes: { ChannelID: 'C1' } });
        expect(names(inChannel)).toEqual(['Persona=CHANNELED']); // secondary match (+4) beats global

        const noChannel = new TestResolver(fixtures).Resolve('P1', {});
        expect(names(noChannel)).toEqual(['Persona=GLOBAL']); // channel part excluded
    });
});
