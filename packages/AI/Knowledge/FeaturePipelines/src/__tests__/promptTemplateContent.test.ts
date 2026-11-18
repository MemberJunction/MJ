import { describe, it, expect, vi, afterEach } from 'vitest';
import { RunView, type IMetadataProvider, type RunViewResult, type UserInfo } from '@memberjunction/core';
import { PromptTemplateContent, type PromptTemplateContentRow } from '../templates/PromptTemplateContent';

const user = {} as UserInfo;
const provider = {} as IMetadataProvider;

/** Answers every view read with `rows` (or fails it with `error`), and returns the spy to inspect the params. */
function mockRunView(rows: PromptTemplateContentRow[], error?: string) {
    const result: RunViewResult<PromptTemplateContentRow> = {
        Success: !error, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: error || '',
    };
    return vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue(result);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('PromptTemplateContent.SelectHighestPriority', () => {
    it('picks the lowest Priority, then the oldest row, then the lowest ID — the rule next renders by', () => {
        const rows = [
            { ID: 'B', Priority: 1, __mj_CreatedAt: new Date('2026-01-02') },
            { ID: 'A', Priority: 1, __mj_CreatedAt: new Date('2026-01-02') },
            { ID: 'C', Priority: 0, __mj_CreatedAt: new Date('2026-01-03') },
        ];
        expect(PromptTemplateContent.SelectHighestPriority(rows)?.ID).toBe('C');
        expect(PromptTemplateContent.SelectHighestPriority(rows.slice(0, 2))?.ID).toBe('A');
        expect(PromptTemplateContent.SelectHighestPriority([])).toBeUndefined();
    });

    it('breaks a Priority tie by the oldest row before the ID', () => {
        const rows = [
            { ID: 'A', Priority: 1, __mj_CreatedAt: '2026-01-05' },
            { ID: 'B', Priority: 1, __mj_CreatedAt: '2026-01-01' },
        ];
        expect(PromptTemplateContent.SelectHighestPriority(rows)?.ID).toBe('B');
    });
});

describe('PromptTemplateContent.ReadCurrent', () => {
    it('returns the rendered row read through the given provider, bypassing caches', async () => {
        const read = mockRunView([
            { ID: 'X', Priority: 2, __mj_CreatedAt: '2026-01-01', TemplateText: 'two' },
            { ID: 'Y', Priority: 1, __mj_CreatedAt: '2026-01-01', TemplateText: 'one' },
        ]);
        expect((await PromptTemplateContent.ReadCurrent(provider, 'T', user))?.TemplateText).toBe('one');
        expect(read.mock.calls[0][0]).toMatchObject({ EntityName: 'MJ: Template Contents', ExtraFilter: "TemplateID='T'", BypassCache: true });
        expect(read.mock.calls[0][1]).toBe(user);
    });

    it('returns undefined when the template has no content row', async () => {
        mockRunView([]);
        expect(await PromptTemplateContent.ReadCurrent(provider, 'T', user)).toBeUndefined();
    });

    it('throws the read error instead of treating a failed read as no content', async () => {
        mockRunView([], 'timeout');
        await expect(PromptTemplateContent.ReadCurrent(provider, 'T', user)).rejects.toThrow(/timeout/);
    });
});
