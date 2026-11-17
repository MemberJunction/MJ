/**
 * Note status on the cache (Recent/All) path of `AgentContextInjector.GetNotesForContext`: the injectable
 * set is Active + Provisional, the same set the semantic path uses (#1934). Pending, Archived and Revoked
 * notes are never injected.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJAIAgentNoteEntity } from '@memberjunction/core-entities';

const h = vi.hoisted(() => ({
    notes: [] as MJAIAgentNoteEntity[],
}));

vi.mock('@memberjunction/aiengine', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/aiengine')>();
    return {
        ...actual,
        AIEngine: {
            Instance: {
                get AgentNotes() { return h.notes; },
                AgentNoteTypes: [],
            },
        },
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, LogStatus: vi.fn(), LogError: vi.fn() };
});

import { AgentContextInjector } from '../agent-context-injector';

const AGENT_ID = 'agent-1';
const contextUser = { ID: 'user-1' } as unknown as UserInfo;

type NoteStatus = MJAIAgentNoteEntity['Status'];

function note(ID: string, Status: NoteStatus): MJAIAgentNoteEntity {
    const fields: Pick<MJAIAgentNoteEntity,
        'ID' | 'AgentID' | 'UserID' | 'CompanyID' | 'Status' | 'Note' | 'Type' | 'AgentNoteTypeID' |
        'PrimaryScopeEntityID' | 'PrimaryScopeRecordID' | 'SecondaryScopes' | '__mj_CreatedAt'> = {
        ID, AgentID: AGENT_ID, UserID: null, CompanyID: null, Status, Note: `note ${ID}`, Type: 'Preference', AgentNoteTypeID: null,
        PrimaryScopeEntityID: null, PrimaryScopeRecordID: null, SecondaryScopes: null, __mj_CreatedAt: new Date('2026-09-01T00:00:00Z'),
    };
    return fields as MJAIAgentNoteEntity;
}

const ids = (rows: Array<{ ID: string }>): string[] => rows.map(r => r.ID).sort();

describe('AgentContextInjector — injectable note statuses on the cache path', () => {
    const injector = new AgentContextInjector();

    beforeEach(() => {
        h.notes = [
            note('active', 'Active'),
            note('provisional', 'Provisional'),
            note('pending', 'Pending'),
            note('archived', 'Archived'),
            note('revoked', 'Revoked'),
        ];
    });

    it.each(['Recent', 'All'] as const)('returns Active and Provisional notes under the %s strategy', async (strategy) => {
        const notes = await injector.GetNotesForContext({ agentId: AGENT_ID, strategy, maxNotes: 10, contextUser });
        expect(ids(notes)).toEqual(['active', 'provisional']);
    });
});
