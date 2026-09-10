/**
 * SkillImportExportService.resyncJunction — a SKILL.md re-import must not reset AISkillAction.ExposeToModel.
 *
 * The frontmatter carries action NAMES only, and the resync deletes and recreates every junction row,
 * so without carrying the flag across, every re-import would silently make a code-only action
 * model-callable again (#4226). `RunView.prototype.RunView` is spied to return the existing rows and a
 * fake provider hands back plain objects that record what the resync sets on them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView, type UserInfo } from '@memberjunction/core';

vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: { Agents: [], Config: vi.fn() } } }));
vi.mock('@memberjunction/actions', () => ({ ActionEngineServer: { Instance: { Actions: [], Config: vi.fn() } } }));

import { SkillImportExportService } from '../SkillImportExportService';

const SKILL = 'AAAAAAAA-0000-0000-0000-000000000001';
const ACTION_A = 'BBBBBBBB-0000-0000-0000-00000000000A'; // existing, hidden from the model
const ACTION_B = 'BBBBBBBB-0000-0000-0000-00000000000B'; // existing, exposed — dropped by the new SKILL.md
const ACTION_C = 'BBBBBBBB-0000-0000-0000-00000000000C'; // new in the SKILL.md

type FakeRow = { SkillID?: string; ActionID?: string; ExposeToModel?: boolean; NewRecord: () => void; Save: () => Promise<boolean> };

function existingRow(actionId: string, exposeToModel: boolean) {
    return {
        SkillID: SKILL, ActionID: actionId, ExposeToModel: exposeToModel,
        Delete: vi.fn(async () => true), LatestResult: undefined,
    };
}

describe('SkillImportExportService.resyncJunction carries ExposeToModel across a re-import', () => {
    const created: FakeRow[] = [];
    let runViewSpy: ReturnType<typeof vi.spyOn>;
    const existing = [existingRow(ACTION_A, false), existingRow(ACTION_B, true)];

    beforeEach(() => {
        created.length = 0;
        runViewSpy = vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async () => ({ Success: true, Results: existing }) as never);
    });
    afterEach(() => runViewSpy.mockRestore());

    const provider = {
        GetEntityObject: vi.fn(async () => {
            const row: FakeRow = { NewRecord: vi.fn(), Save: vi.fn(async () => true) };
            created.push(row);
            return row;
        }),
    };
    const user = { ID: 'user' } as unknown as UserInfo;

    it('keeps a surviving action hidden, gives a new action the default, and does not recreate a dropped one', async () => {
        const resync = (SkillImportExportService as unknown as { resyncJunction: (...a: unknown[]) => Promise<void> }).resyncJunction;
        await resync(SKILL, 'MJ: AI Skill Actions', [ACTION_A.toLowerCase(), ACTION_C], 'ActionID', user, provider);

        expect(existing[0].Delete).toHaveBeenCalledTimes(1);
        expect(existing[1].Delete).toHaveBeenCalledTimes(1);
        expect(created).toHaveLength(2);

        const [a, c] = created;
        expect(a.ActionID).toBe(ACTION_A.toLowerCase());
        expect(a.ExposeToModel).toBe(false);       // carried across, case-insensitively
        expect(c.ActionID).toBe(ACTION_C);
        expect(c.ExposeToModel).toBeUndefined();   // new row: the column default (1) applies
        expect(created.some((r) => r.ActionID === ACTION_B)).toBe(false);
        for (const r of created) expect(r.SkillID).toBe(SKILL);
    });

    it('leaves sub-agent rows alone (no flag to carry)', async () => {
        const subExisting = [{ SkillID: SKILL, SubAgentID: 'S1', Delete: vi.fn(async () => true), LatestResult: undefined }];
        runViewSpy.mockImplementation(async () => ({ Success: true, Results: subExisting }) as never);
        const resync = (SkillImportExportService as unknown as { resyncJunction: (...a: unknown[]) => Promise<void> }).resyncJunction;
        await resync(SKILL, 'MJ: AI Skill Sub Agents', ['S1'], 'SubAgentID', user, provider);
        expect(created).toHaveLength(1);
        expect((created[0] as unknown as Record<string, unknown>)['SubAgentID']).toBe('S1');
        expect(created[0].ExposeToModel).toBeUndefined();
    });
});
