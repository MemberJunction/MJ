/**
 * `SharedOnly` on `AgentContextInjector`: under a run audience (`ExecuteAgentParams.Audience`) only notes and
 * examples with no `UserID` are injected — one user's memory is never shown to a room — on both the cache path
 * and the semantic (vector) path, with scope matching still applied.
 *
 * The semantic path's vector search is stood in for, but its base filter is the REAL
 * `AIEngine.composeNoteFilters` / `composeExampleFilters`: those skip the user check entirely when `userId` is
 * undefined, so "shared only" cannot be expressed by passing no user. The regression tests pin that trap and
 * that the injector's explicit filter closes it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJAIAgentExampleEntity, MJAIAgentNoteEntity } from '@memberjunction/core-entities';
import type { ExampleEmbeddingMetadata, ExampleMatchResult, NoteEmbeddingMetadata, NoteMatchResult } from '@memberjunction/aiengine';

type NoteFilter = (metadata: NoteEmbeddingMetadata) => boolean;
type ExampleFilter = (metadata: ExampleEmbeddingMetadata) => boolean;
type ComposeNotes = (agentId?: string, userId?: string, companyId?: string, extra?: NoteFilter) => NoteFilter;
type ComposeExamples = (agentId?: string, userId?: string, companyId?: string, extra?: ExampleFilter) => ExampleFilter;

const h = vi.hoisted(() => ({
    notes: [] as MJAIAgentNoteEntity[],
    examples: [] as MJAIAgentExampleEntity[],
    /** The real AIEngine base filters, captured from the actual module. */
    composeNotes: undefined as ComposeNotes | undefined,
    composeExamples: undefined as ComposeExamples | undefined,
}));

vi.mock('@memberjunction/aiengine', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/aiengine')>();
    const prototype = actual.AIEngine.prototype as unknown as { composeNoteFilters: ComposeNotes; composeExampleFilters: ComposeExamples };
    h.composeNotes = prototype.composeNoteFilters;
    h.composeExamples = prototype.composeExampleFilters;
    return {
        ...actual,
        AIEngine: {
            Instance: {
                get AgentNotes() { return h.notes; },
                get AgentExamples() { return h.examples; },
                AgentNoteTypes: [],
                // The vector search, minus the vectors: every candidate scores 0.9, filtered by the REAL base filter.
                FindSimilarAgentNotes: async (
                    _q: string, agentId?: string, userId?: string, companyId?: string, topK = 5, _min = 0.5, extra?: NoteFilter
                ): Promise<NoteMatchResult[]> => {
                    const filter = h.composeNotes!(agentId, userId, companyId, extra);
                    return h.notes.filter(n => filter(noteMetadata(n))).slice(0, topK).map(note => ({ note, similarity: 0.9 }));
                },
                FindSimilarAgentExamples: async (
                    _q: string, agentId?: string, userId?: string, companyId?: string, topK = 3, _min = 0.5, extra?: ExampleFilter
                ): Promise<ExampleMatchResult[]> => {
                    const filter = h.composeExamples!(agentId, userId, companyId, extra);
                    return h.examples.filter(e => filter(exampleMetadata(e))).slice(0, topK).map(example => ({ example, similarity: 0.9 }));
                },
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
const ME = 'user-me';
const OTHER = 'user-other';
const contextUser = { ID: ME } as unknown as UserInfo;

type ScopedFields =
    'ID' | 'AgentID' | 'UserID' | 'CompanyID' | 'Status' | 'PrimaryScopeEntityID' | 'PrimaryScopeRecordID' | 'SecondaryScopes' | '__mj_CreatedAt';

function note(ID: string, UserID: string | null, PrimaryScopeRecordID: string | null = null): MJAIAgentNoteEntity {
    const fields: Pick<MJAIAgentNoteEntity, ScopedFields | 'Note' | 'Type' | 'AgentNoteTypeID'> = {
        ID, AgentID: AGENT_ID, UserID, CompanyID: null, Status: 'Active', Note: `note ${ID}`, Type: 'Preference', AgentNoteTypeID: null,
        PrimaryScopeEntityID: null, PrimaryScopeRecordID, SecondaryScopes: null, __mj_CreatedAt: new Date('2026-09-01T00:00:00Z'),
    };
    return fields as MJAIAgentNoteEntity;
}

function example(ID: string, UserID: string | null): MJAIAgentExampleEntity {
    const fields: Pick<MJAIAgentExampleEntity, ScopedFields | 'ExampleInput' | 'ExampleOutput' | 'SuccessScore'> = {
        ID, AgentID: AGENT_ID, UserID, CompanyID: null, Status: 'Active', ExampleInput: `q ${ID}`, ExampleOutput: `a ${ID}`, SuccessScore: null,
        PrimaryScopeEntityID: null, PrimaryScopeRecordID: null, SecondaryScopes: null, __mj_CreatedAt: new Date('2026-09-01T00:00:00Z'),
    };
    return fields as MJAIAgentExampleEntity;
}

function noteMetadata(n: MJAIAgentNoteEntity): NoteEmbeddingMetadata {
    return { id: n.ID, agentId: n.AgentID, userId: n.UserID, companyId: n.CompanyID, type: n.Type, noteText: n.Note ?? '', noteEntity: n };
}

function exampleMetadata(e: MJAIAgentExampleEntity): ExampleEmbeddingMetadata {
    return {
        id: e.ID, agentId: e.AgentID, userId: e.UserID, companyId: e.CompanyID, type: 'Example',
        exampleInput: e.ExampleInput, exampleOutput: e.ExampleOutput, successScore: e.SuccessScore, exampleEntity: e,
    };
}

const ids = (rows: Array<{ ID: string }>): string[] => rows.map(r => r.ID).sort();

describe('AgentContextInjector — SharedOnly (a run with an audience)', () => {
    const injector = new AgentContextInjector();

    beforeEach(() => {
        h.notes = [note('shared', null), note('mine', ME), note('theirs', OTHER)];
        h.examples = [example('shared', null), example('mine', ME), example('theirs', OTHER)];
    });

    describe('cache path', () => {
        const notesFor = (SharedOnly: boolean, userId: string | undefined = ME) => injector.GetNotesForContext({
            agentId: AGENT_ID, userId, strategy: 'Recent', maxNotes: 10, contextUser, SharedOnly,
        });
        const examplesFor = (SharedOnly: boolean) => injector.GetExamplesForContext({
            agentId: AGENT_ID, userId: ME, strategy: 'Recent', maxExamples: 10, contextUser, SharedOnly,
        });

        it("injects the caller's own notes without it (control) and only shared notes with it", async () => {
            expect(ids(await notesFor(false))).toEqual(['mine', 'shared']);
            expect(ids(await notesFor(true))).toEqual(['shared']);
        });

        it("injects the caller's own examples without it (control) and only shared examples with it", async () => {
            expect(ids(await examplesFor(false))).toEqual(['mine', 'shared']);
            expect(ids(await examplesFor(true))).toEqual(['shared']);
        });

        it('still applies scope matching to shared notes', async () => {
            h.notes = [note('shared-here', null, 'org-1'), note('shared-elsewhere', null, 'org-2'), note('global', null)];
            const notes = await injector.GetNotesForContext({
                agentId: AGENT_ID, userId: ME, strategy: 'Recent', maxNotes: 10, contextUser, SharedOnly: true, primaryScopeRecordId: 'org-1',
            });
            expect(ids(notes)).toEqual(['global', 'shared-here']);
        });
    });

    describe('semantic path', () => {
        const relevantNotes = (SharedOnly: boolean, userId: string | undefined = ME) => injector.GetNotesForContext({
            agentId: AGENT_ID, userId, currentInput: 'what do I like?', strategy: 'Relevant', maxNotes: 10, contextUser, SharedOnly,
        });
        const semanticExamples = (SharedOnly: boolean, userId: string | undefined = ME) => injector.GetExamplesForContext({
            agentId: AGENT_ID, userId, currentInput: 'what do I like?', strategy: 'Semantic', maxExamples: 10, contextUser, SharedOnly,
        });

        it("injects the caller's own notes without it (control) and only shared notes with it", async () => {
            expect(ids(await relevantNotes(false))).toEqual(['mine', 'shared']);
            expect(ids(await relevantNotes(true))).toEqual(['shared']);
        });

        it("injects the caller's own examples without it (control) and only shared examples with it", async () => {
            expect(ids(await semanticExamples(false))).toEqual(['mine', 'shared']);
            expect(ids(await semanticExamples(true))).toEqual(['shared']);
        });

        it('still applies scope matching to shared notes', async () => {
            h.notes = [note('shared-here', null, 'org-1'), note('shared-elsewhere', null, 'org-2'), note('mine-here', ME, 'org-1')];
            const notes = await injector.GetNotesForContext({
                agentId: AGENT_ID, userId: ME, currentInput: 'q', strategy: 'Relevant', maxNotes: 10, contextUser,
                SharedOnly: true, primaryScopeRecordId: 'org-1',
            });
            expect(ids(notes)).toEqual(['shared-here']);
        });
    });

    describe('regression: an undefined userId is not "shared only"', () => {
        it("the real AIEngine base filter lets every user's note through when userId is undefined (the trap)", () => {
            const filter = h.composeNotes!(AGENT_ID, undefined, undefined, undefined);
            expect(h.notes.filter(n => filter(noteMetadata(n))).map(n => n.ID).sort()).toEqual(['mine', 'shared', 'theirs']);
            const exampleFilter = h.composeExamples!(AGENT_ID, undefined, undefined, undefined);
            expect(h.examples.filter(e => exampleFilter(exampleMetadata(e))).map(e => e.ID).sort()).toEqual(['mine', 'shared', 'theirs']);
        });

        it("SharedOnly with an undefined userId injects no other user's note or example through the semantic path", async () => {
            const notes = await injector.GetNotesForContext({
                agentId: AGENT_ID, userId: undefined, currentInput: 'q', strategy: 'Relevant', maxNotes: 10, contextUser, SharedOnly: true,
            });
            const examples = await injector.GetExamplesForContext({
                agentId: AGENT_ID, userId: undefined, currentInput: 'q', strategy: 'Semantic', maxExamples: 10, contextUser, SharedOnly: true,
            });
            expect(ids(notes)).toEqual(['shared']);
            expect(ids(examples)).toEqual(['shared']);
        });
    });
});
