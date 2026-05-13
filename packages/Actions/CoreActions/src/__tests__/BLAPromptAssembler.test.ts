import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock() is hoisted to the top of the file before any top-level `const`,
// so refs the factory needs (like our ExecuteSQL spy) must live inside
// vi.hoisted() to be defined when the factory runs.
const { mockExecuteSQL } = vi.hoisted(() => ({
    mockExecuteSQL: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        BaseEntity: {
            Provider: { ExecuteSQL: mockExecuteSQL },
        },
    };
});

// Import AFTER the mock above so the assembler sees the stubbed provider
import { BLAPromptAssembler } from '../custom/bla/services/BLAPromptAssembler';
import type { BLAChatMessage, BLAPromptComponentRow } from '../custom/bla/services/types';

const PROMPT_ID = '11111111-1111-1111-1111-111111111111';
const ORG_ID    = '22222222-2222-2222-2222-222222222222';
const INST_ID   = '33333333-3333-3333-3333-333333333333';

function makeRow(over: Partial<BLAPromptComponentRow> & { Name: string; Text: string; Sort: number; Role: BLAPromptComponentRow['Role'] }): BLAPromptComponentRow {
    return {
        ID: over.ID ?? `00000000-0000-0000-0000-${Math.floor(Math.random() * 1e12).toString().padStart(12, '0')}`,
        PromptID: PROMPT_ID,
        Name: over.Name,
        Description: over.Description ?? null,
        Text: over.Text,
        Sort: over.Sort,
        Role: over.Role,
        OrganizationID: over.OrganizationID ?? null,
        InstanceID: over.InstanceID ?? null,
    };
}

describe('BLAPromptAssembler', () => {
    let assembler: BLAPromptAssembler;

    beforeEach(() => {
        vi.clearAllMocks();
        assembler = new BLAPromptAssembler();
    });

    describe('assembly order', () => {
        it('renders conversation history first, then components by Sort ASC', async () => {
            mockExecuteSQL.mockResolvedValueOnce([
                makeRow({ Name: 'persona', Text: 'You are a helpful assistant.', Sort: 10, Role: 'System' }),
                makeRow({ Name: 'task', Text: 'Answer concisely.', Sort: 20, Role: 'System' }),
                makeRow({ Name: 'example-user', Text: 'Q: hi', Sort: 30, Role: 'User' }),
                makeRow({ Name: 'example-asst', Text: 'A: hello!', Sort: 40, Role: 'Assistant' }),
            ]);

            const history: BLAChatMessage[] = [
                { role: 'user', content: 'first turn' },
                { role: 'assistant', content: 'first reply' },
                { role: 'user', content: 'second turn' },
            ];

            const result = await assembler.Assemble({
                PromptID: PROMPT_ID,
                OrganizationID: ORG_ID,
                InstanceID: INST_ID,
                ConversationHistory: history,
            });

            expect(result.AssembledMessages.map(m => m.content)).toEqual([
                'first turn',
                'first reply',
                'second turn',
                'You are a helpful assistant.',
                'Answer concisely.',
                'Q: hi',
                'A: hello!',
            ]);
            expect(result.AssembledMessages.map(m => m.role)).toEqual([
                'user', 'assistant', 'user',           // history (preserved roles)
                'system', 'system', 'user', 'assistant', // components (DB role → lowercase)
            ]);
        });
    });

    describe('AssembledSystemText composition', () => {
        it("concatenates only System-role components with '\\n\\n' between them, in Sort order", async () => {
            mockExecuteSQL.mockResolvedValueOnce([
                makeRow({ Name: 'sys-a', Text: 'A', Sort: 10, Role: 'System' }),
                makeRow({ Name: 'user-mid', Text: 'IGNORE_ME', Sort: 20, Role: 'User' }),
                makeRow({ Name: 'sys-b', Text: 'B', Sort: 30, Role: 'System' }),
            ]);

            const result = await assembler.Assemble({ PromptID: PROMPT_ID, ConversationHistory: [] });

            expect(result.AssembledSystemText).toBe('A\n\nB');
        });

        it('returns empty string when no System-role components exist', async () => {
            mockExecuteSQL.mockResolvedValueOnce([
                makeRow({ Name: 'only-user', Text: 'just a user block', Sort: 10, Role: 'User' }),
            ]);

            const result = await assembler.Assemble({ PromptID: PROMPT_ID, ConversationHistory: [] });

            expect(result.AssembledSystemText).toBe('');
        });
    });

    describe('SelectedComponentCount', () => {
        it('reflects the number of rows returned by the cascade', async () => {
            mockExecuteSQL.mockResolvedValueOnce([
                makeRow({ Name: 'a', Text: 'a', Sort: 10, Role: 'System' }),
                makeRow({ Name: 'b', Text: 'b', Sort: 20, Role: 'User' }),
                makeRow({ Name: 'c', Text: 'c', Sort: 30, Role: 'System' }),
            ]);
            const result = await assembler.Assemble({ PromptID: PROMPT_ID, ConversationHistory: [] });
            expect(result.SelectedComponentCount).toBe(3);
        });

        it('is 0 when the cascade returns nothing', async () => {
            mockExecuteSQL.mockResolvedValueOnce([]);
            const result = await assembler.Assemble({ PromptID: PROMPT_ID, ConversationHistory: [] });
            expect(result.SelectedComponentCount).toBe(0);
            expect(result.AssembledMessages).toEqual([]);
            expect(result.AssembledSystemText).toBe('');
        });
    });

    describe('SQL parameter wiring', () => {
        it('passes PromptID, OrgID, and InstanceID as named SQL params; defaults missing scopes to null', async () => {
            mockExecuteSQL.mockResolvedValueOnce([]);

            await assembler.Assemble({
                PromptID: PROMPT_ID,
                OrganizationID: null,
                InstanceID: null,
                ConversationHistory: [],
            });

            const callArgs = mockExecuteSQL.mock.calls[0];
            expect(callArgs[0]).toContain('FROM betty.PromptComponent');
            expect(callArgs[1]).toEqual({
                PromptID: PROMPT_ID,
                OrgID: null,
                InstanceID: null,
            });
        });

        it('passes OrganizationID + InstanceID through unchanged when supplied', async () => {
            mockExecuteSQL.mockResolvedValueOnce([]);

            await assembler.Assemble({
                PromptID: PROMPT_ID,
                OrganizationID: ORG_ID,
                InstanceID: INST_ID,
                ConversationHistory: [],
            });

            expect(mockExecuteSQL.mock.calls[0][1]).toEqual({
                PromptID: PROMPT_ID,
                OrgID: ORG_ID,
                InstanceID: INST_ID,
            });
        });
    });

    describe('history sanitization', () => {
        it('drops history entries with malformed shape but keeps valid ones', async () => {
            mockExecuteSQL.mockResolvedValueOnce([]);

            const history = [
                { role: 'user', content: 'ok' },
                null,                                  // dropped
                { role: 'BOGUS', content: 'drop me' }, // dropped (unknown role)
                { role: 'assistant', content: 'also ok' },
                { role: 'system', content: 123 },      // coerced content → ''
            ] as unknown as BLAChatMessage[];

            const result = await assembler.Assemble({
                PromptID: PROMPT_ID,
                ConversationHistory: history,
            });

            expect(result.AssembledMessages).toEqual([
                { role: 'user', content: 'ok' },
                { role: 'assistant', content: 'also ok' },
                { role: 'system', content: '' },
            ]);
        });

        it('treats non-array history as empty', async () => {
            mockExecuteSQL.mockResolvedValueOnce([]);
            const result = await assembler.Assemble({
                PromptID: PROMPT_ID,
                ConversationHistory: 'not-an-array' as unknown as BLAChatMessage[],
            });
            expect(result.AssembledMessages).toEqual([]);
        });
    });

    describe('error surfacing', () => {
        it('rethrows when ExecuteSQL throws', async () => {
            mockExecuteSQL.mockRejectedValueOnce(new Error('SQL Server is down'));
            await expect(
                assembler.Assemble({ PromptID: PROMPT_ID, ConversationHistory: [] }),
            ).rejects.toThrow('SQL Server is down');
        });
    });
});
