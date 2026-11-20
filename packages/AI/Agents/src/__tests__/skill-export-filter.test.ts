/**
 * SkillImportExportService.ExportSkill reads a skill's bundled actions and sub-agents with a filter on
 * the skill's ID. These tests pin that the filter holds the ID of the loaded skill, not the caller's
 * text.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RunView, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';

vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: { Agents: [], Config: vi.fn() } } }));
vi.mock('@memberjunction/actions', () => ({ ActionEngineServer: { Instance: { Actions: [], Config: vi.fn() } } }));

import { SkillImportExportService } from '../SkillImportExportService';

const SKILL_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const USER = { ID: 'u1' } as UserInfo;

/** A provider whose skill Load matches any ID that starts with the skill's ID. */
function providerWithSkill(): IMetadataProvider {
    const skill = {
        ID: SKILL_ID,
        Name: 'Skill',
        Description: null,
        Category: null,
        Instructions: 'Body',
        Load: async (id: string) => id.toLowerCase().startsWith(SKILL_ID),
    };
    return { GetEntityObject: async () => skill } as unknown as IMetadataProvider;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ExportSkill', () => {
    it('filters bundled actions and sub-agents by the loaded skill ID, not by the caller text', async () => {
        const filters: string[] = [];
        vi.spyOn(RunView.prototype, 'RunViews').mockImplementation(async (params: RunViewParams[]) => {
            filters.push(...params.map(p => p.ExtraFilter ?? ''));
            return params.map(() => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' }));
        });

        await SkillImportExportService.ExportSkill(`${SKILL_ID}' AND '1'='1`, USER, providerWithSkill());

        expect(filters).toEqual([`SkillID='${SKILL_ID}'`, `SkillID='${SKILL_ID}'`]);
    });
});
