import { describe, it, expect } from 'vitest';
import { AgentContextInjector } from '../agent-context-injector';
import type { MJAIAgentNoteEntity } from '@memberjunction/core-entities';

/** Minimal note stub carrying only the fields FormatNotesForInjection reads. */
function makeNote(overrides: Partial<MJAIAgentNoteEntity>): MJAIAgentNoteEntity {
    return {
        Status: 'Active',
        Type: 'Preference',
        Note: 'A note',
        AgentID: null,
        UserID: null,
        CompanyID: null,
        PrimaryScopeRecordID: null,
        SecondaryScopes: null,
        ...overrides,
    } as unknown as MJAIAgentNoteEntity;
}

describe('AgentContextInjector.FormatNotesForInjection', () => {
    const injector = new AgentContextInjector();

    it('returns empty string for no notes', () => {
        expect(injector.FormatNotesForInjection([])).toBe('');
    });

    it('renders provisional notes FIRST in their own block with (provisional) labels', () => {
        const output = injector.FormatNotesForInjection([
            makeNote({ Status: 'Active', Note: 'User prefers red charts' }),
            makeNote({ Status: 'Provisional', Note: 'User now loves blue charts' }),
        ]);

        const provisionalBlock = output.indexOf('RECENT NOTES (1 provisional');
        const establishedBlock = output.indexOf('AGENT NOTES (1)');
        expect(provisionalBlock).toBeGreaterThan(-1);
        expect(establishedBlock).toBeGreaterThan(-1);
        expect(provisionalBlock).toBeLessThan(establishedBlock);
        expect(output).toContain('[Preference] (provisional) User now loves blue charts');
        expect(output).toContain('[Preference] User prefers red charts');
    });

    it('states recency-wins precedence for provisional notes in the memory policy', () => {
        const output = injector.FormatNotesForInjection([
            makeNote({ Status: 'Provisional', Note: 'fresh fact' }),
        ]);
        expect(output).toContain('<memory_policy>');
        expect(output).toContain('recency wins');
        expect(output).toContain('follow');
    });

    it('omits the memory policy when includeMemoryPolicy=false', () => {
        const output = injector.FormatNotesForInjection(
            [makeNote({ Status: 'Provisional', Note: 'fresh fact' })],
            false,
        );
        expect(output).not.toContain('<memory_policy>');
        expect(output).toContain('(provisional)');
    });

    it('renders only the established block when no provisional notes exist', () => {
        const output = injector.FormatNotesForInjection([
            makeNote({ Status: 'Active', Note: 'established fact' }),
        ]);
        expect(output).not.toContain('RECENT NOTES');
        expect(output).toContain('AGENT NOTES (1)');
        // No note LINE carries the provisional label (the policy preamble may mention the marker)
        expect(output).not.toContain('] (provisional)');
    });

    it('labels scope for provisional notes the same as established ones', () => {
        const output = injector.FormatNotesForInjection([
            makeNote({ Status: 'Provisional', Note: 'scoped fact', AgentID: 'a1', UserID: 'u1' }),
        ]);
        expect(output).toContain('Scope: Agent + User specific');
    });
});
