import { describe, it, expect } from 'vitest';
import { AgentContextInjector } from '../agent-context-injector';
import type { MJAIAgentNoteEntity, MJAIAgentExampleEntity, MJAIAgentNoteTypeEntity } from '@memberjunction/core-entities';

/**
 * Regression coverage for the agent-context date-sort crash.
 *
 * These comparators read `__mj_CreatedAt`, which is DECLARED `Date` but can hold a raw ISO
 * string at runtime once a cross-server cache event has replaced the engine's entity rows with
 * plain JSON objects. Optional chaining does not save the old `a.__mj_CreatedAt?.getTime()`
 * form — `"2026-08-01T00:00:00.000Z"?.getTime` is `undefined`, and calling it throws
 * `__mj_CreatedAt?.getTime is not a function`, which is the exact error that killed the agent
 * run this fixes.
 *
 * So every case below feeds PLAIN OBJECTS with string dates: the shape a poisoned cache holds.
 *
 * The sorts are private, so tests reach them through a typed test-access cast — the same
 * `as unknown as` convention the sibling formatting suite already uses for entity stubs. No
 * production visibility is widened for testing.
 */

type SortAccess = {
    sortExamples(
        examples: MJAIAgentExampleEntity[],
        strategy: 'Semantic' | 'Recent' | 'Rated'
    ): MJAIAgentExampleEntity[];
    sortNotes(
        notes: MJAIAgentNoteEntity[],
        strategy: 'Relevant' | 'Recent' | 'All',
        noteTypes: MJAIAgentNoteTypeEntity[]
    ): MJAIAgentNoteEntity[];
};

const injector = new AgentContextInjector() as unknown as SortAccess;

const OLDER = '2026-08-01T00:00:00.000Z';
const NEWER = '2026-08-02T00:00:00.000Z';

/** A note as a poisoned cache holds it: plain object, `__mj_CreatedAt` a string. */
function makeNote(overrides: Record<string, unknown>): MJAIAgentNoteEntity {
    return {
        ID: 'note',
        AgentID: 'agent-1',
        Status: 'Active',
        Note: 'a note',
        AgentNoteTypeID: 'type-human',
        ...overrides,
    } as unknown as MJAIAgentNoteEntity;
}

function makeExample(overrides: Record<string, unknown>): MJAIAgentExampleEntity {
    return {
        ID: 'example',
        AgentID: 'agent-1',
        Status: 'Active',
        SuccessScore: 1,
        ...overrides,
    } as unknown as MJAIAgentExampleEntity;
}

/**
 * Mirrors production, where BOTH seeded AIAgentNoteType rows ('Human' and 'AI') carry
 * Priority 0 — so the priority comparison always ties and the date tie-break is the hot path,
 * not an edge case.
 */
const TIED_PRIORITY_NOTE_TYPES = [
    { ID: 'type-human', Priority: 0 },
    { ID: 'type-ai', Priority: 0 },
] as unknown as MJAIAgentNoteTypeEntity[];

function ids(rows: Array<{ ID?: string }>): Array<string | undefined> {
    return rows.map((r) => r.ID);
}

describe('AgentContextInjector.sortExamples with string dates (poisoned cache)', () => {
    it("sorts newest-first for 'Recent' instead of throwing", () => {
        const sorted = injector.sortExamples(
            [
                makeExample({ ID: 'old', __mj_CreatedAt: OLDER }),
                makeExample({ ID: 'new', __mj_CreatedAt: NEWER }),
            ],
            'Recent'
        );
        expect(ids(sorted)).toEqual(['new', 'old']);
    });

    it("breaks a SuccessScore tie by date for 'Rated' instead of throwing", () => {
        const sorted = injector.sortExamples(
            [
                makeExample({ ID: 'old', SuccessScore: 5, __mj_CreatedAt: OLDER }),
                makeExample({ ID: 'new', SuccessScore: 5, __mj_CreatedAt: NEWER }),
            ],
            'Rated'
        );
        expect(ids(sorted)).toEqual(['new', 'old']);
    });

    it("still ranks by SuccessScore first for 'Rated' (date only breaks ties)", () => {
        const sorted = injector.sortExamples(
            [
                makeExample({ ID: 'low-but-new', SuccessScore: 1, __mj_CreatedAt: NEWER }),
                makeExample({ ID: 'high-but-old', SuccessScore: 9, __mj_CreatedAt: OLDER }),
            ],
            'Rated'
        );
        expect(ids(sorted)).toEqual(['high-but-old', 'low-but-new']);
    });
});

describe('AgentContextInjector.sortNotes with string dates (poisoned cache)', () => {
    it("sorts newest-first for 'Recent' instead of throwing", () => {
        const sorted = injector.sortNotes(
            [
                makeNote({ ID: 'old', __mj_CreatedAt: OLDER }),
                makeNote({ ID: 'new', __mj_CreatedAt: NEWER }),
            ],
            'Recent',
            TIED_PRIORITY_NOTE_TYPES
        );
        expect(ids(sorted)).toEqual(['new', 'old']);
    });

    it("breaks a tied priority by date for 'All' instead of throwing", () => {
        // Both note types are Priority 0 — the production configuration — so this is the
        // branch that actually ran when the agent crashed.
        const sorted = injector.sortNotes(
            [
                makeNote({ ID: 'old', AgentNoteTypeID: 'type-human', __mj_CreatedAt: OLDER }),
                makeNote({ ID: 'new', AgentNoteTypeID: 'type-ai', __mj_CreatedAt: NEWER }),
            ],
            'All',
            TIED_PRIORITY_NOTE_TYPES
        );
        expect(ids(sorted)).toEqual(['new', 'old']);
    });

    it("breaks a tied priority by date for 'Relevant' instead of throwing", () => {
        const sorted = injector.sortNotes(
            [
                makeNote({ ID: 'old', __mj_CreatedAt: OLDER }),
                makeNote({ ID: 'new', __mj_CreatedAt: NEWER }),
            ],
            'Relevant',
            TIED_PRIORITY_NOTE_TYPES
        );
        expect(ids(sorted)).toEqual(['new', 'old']);
    });

    it('still ranks by priority first (date only breaks ties)', () => {
        const sorted = injector.sortNotes(
            [
                makeNote({ ID: 'low-priority-new', AgentNoteTypeID: 'type-low', __mj_CreatedAt: NEWER }),
                makeNote({ ID: 'high-priority-old', AgentNoteTypeID: 'type-high', __mj_CreatedAt: OLDER }),
            ],
            'All',
            [
                { ID: 'type-high', Priority: 0 },
                { ID: 'type-low', Priority: 5 },
            ] as unknown as MJAIAgentNoteTypeEntity[]
        );
        expect(ids(sorted)).toEqual(['high-priority-old', 'low-priority-new']);
    });
});

describe('agent-context sorts tolerate partially-converted and unparseable dates', () => {
    it('sorts a MIXED array of real Date and string dates', () => {
        // A half-converted array — e.g. an immediate mutation pushing a real entity into an
        // array a cache event had already poisoned.
        const sorted = injector.sortNotes(
            [
                makeNote({ ID: 'string-old', __mj_CreatedAt: OLDER }),
                makeNote({ ID: 'date-new', __mj_CreatedAt: new Date(NEWER) }),
            ],
            'Recent',
            TIED_PRIORITY_NOTE_TYPES
        );
        expect(ids(sorted)).toEqual(['date-new', 'string-old']);
    });

    it('treats unparseable and missing dates as epoch 0 rather than producing NaN', () => {
        // NaN comparators are the subtle failure the old `?? 0` allowed through: an Invalid
        // Date's getTime() is NaN, and `NaN ?? 0` is NaN, which makes a comparator incoherent.
        const sorted = injector.sortNotes(
            [
                makeNote({ ID: 'garbage', __mj_CreatedAt: 'not-a-date' }),
                makeNote({ ID: 'dated', __mj_CreatedAt: OLDER }),
                makeNote({ ID: 'missing', __mj_CreatedAt: null }),
            ],
            'Recent',
            TIED_PRIORITY_NOTE_TYPES
        );
        // The real date sorts first; the two zero-valued rows follow in stable order.
        expect(ids(sorted)).toEqual(['dated', 'garbage', 'missing']);
    });

    it('does not mutate the caller\'s array', () => {
        const input = [
            makeNote({ ID: 'old', __mj_CreatedAt: OLDER }),
            makeNote({ ID: 'new', __mj_CreatedAt: NEWER }),
        ];
        injector.sortNotes(input, 'Recent', TIED_PRIORITY_NOTE_TYPES);
        expect(ids(input)).toEqual(['old', 'new']);
    });
});
