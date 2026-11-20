import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core', () => {
    class BaseEntityResult {
        Success = false;
        Type = '';
        Message = '';
        StartedAt: Date | null = null;
        EndedAt: Date | null = null;
        OriginalValues: unknown[] = [];
    }
    return { BaseEntity: class {}, BaseEntityResult, CompositeKey: class {}, EntityInfo: class {}, LogError: () => {} };
});

const runView = vi.fn();
const baseSave = vi.fn(async () => true);

vi.mock('../generated/entity_subclasses', () => ({
    MJListDetailEntity: class {
        ListID = '';
        RecordID = '';
        IsSaved = false;
        ContextCurrentUser = { ID: 'u1' };
        ResultHistory: Array<{ Message: string }> = [];
        Fields: unknown[] = [];
        get RunViewProviderToUse() {
            return { RunView: runView };
        }
        RegisterResultHistoryEntry(result: { Message: string }) {
            this.ResultHistory.push(result);
        }
        Save() {
            return baseSave();
        }
    },
}));

import { EntityInfo } from '@memberjunction/core';
import { MJListDetailEntityExtended } from '../custom/MJListDetailEntityExtended';

const LIST_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function detail(listId: string, recordId: string): MJListDetailEntityExtended {
    const d = new MJListDetailEntityExtended(new EntityInfo());
    d.ListID = listId;
    d.RecordID = recordId;
    return d;
}

describe('MJListDetailEntityExtended.Save duplicate check', () => {
    beforeEach(() => {
        runView.mockReset();
        runView.mockResolvedValue({ Success: true, Results: [] });
        baseSave.mockClear();
    });

    it('refuses a ListID that is not a well-formed UUID before any query runs', async () => {
        const saved = await detail(`${LIST_ID}' OR '1'='1`, 'r1').Save();
        expect(saved).toBe(false);
        expect(runView).not.toHaveBeenCalled();
    });

    it('escapes quotes in the RecordID of the duplicate check', async () => {
        await detail(LIST_ID, "r'1").Save();
        expect(runView).toHaveBeenCalledWith(
            expect.objectContaining({ ExtraFilter: `ListID = '${LIST_ID}' AND RecordID = 'r''1'` }),
            expect.anything(),
        );
    });

    it('does not put the database error text in the save result', async () => {
        runView.mockResolvedValue({ Success: false, ErrorMessage: 'DB-ERROR-MARKER', Results: [] });
        const d = detail(LIST_ID, 'r1');
        expect(await d.Save()).toBe(false);
        expect(d.ResultHistory.map(r => r.Message).join(' ')).not.toContain('DB-ERROR-MARKER');
    });
});
