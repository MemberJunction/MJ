/**
 * Read Skill File — the on-demand step of multi-file skills. Pins that a file is read by skill name +
 * path, that inside an agent run only files of skills ACTIVE in the run are readable
 * (`Context.ActiveSkillIDs`), and that a miss lists the skill's paths (never their content).
 * `RunView` is mocked: each call records its filter and returns the rows the filter would match.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunActionParams, ActionResultSimple } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

const views = vi.hoisted(() => ({ calls: [] as Array<{ ExtraFilter: string; Fields: string[] }>, results: [] as unknown[][] }));
vi.mock('@memberjunction/core', () => ({
    RunView: class {
        async RunView(p: { ExtraFilter: string; Fields: string[] }) {
            views.calls.push(p);
            return { Success: true, Results: views.results.shift() ?? [] };
        }
    },
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class {
        protected async InternalRunAction(_p: unknown): Promise<unknown> { return null; }
    }
}));

import { ReadSkillFileAction } from '../custom/ai/read-skill-file.action';

const ACTIVE = 'aaaaaaaa-0000-4000-8000-000000000001';

async function run(inputs: Record<string, string>, context?: Record<string, unknown>): Promise<{ result: ActionResultSimple; params: RunActionParams }> {
    const params = {
        Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Value, Type: 'Input' })),
        Context: context,
        ContextUser: { ID: 'user' },
    } as unknown as RunActionParams;
    const action = new ReadSkillFileAction() as unknown as { InternalRunAction: (p: RunActionParams) => Promise<ActionResultSimple> };
    return { result: await action.InternalRunAction(params), params };
}

describe('ReadSkillFileAction', () => {
    beforeEach(() => {
        views.calls = [];
        views.results = [];
    });

    it('returns the file content once, as the Content output; the Message only says what was read', async () => {
        views.results = [[{ Path: 'references/forms.md', Content: '# Forms' }]];
        const { result, params } = await run({ Skill: "O'Brien Skill", Path: './references/forms.md' }, { ActiveSkillIDs: [ACTIVE] });

        expect(result).toMatchObject({ Success: true, ResultCode: 'SUCCESS' });
        expect(result.Message).not.toContain('# Forms');
        expect(result.Message).toContain('references/forms.md');
        expect(params.Params).toContainEqual({ Name: 'Content', Type: 'Output', Value: '# Forms' });
        expect(views.calls[0].ExtraFilter).toBe(`Skill=N'O''Brien Skill' AND SkillID IN ('${ACTIVE}') AND Path=N'references/forms.md'`);
        expect(views.calls[0].Fields).toEqual(['Path', 'Content']);
    });

    it('inside a run with no active skill, matches nothing', async () => {
        const { result } = await run({ Skill: 'Diagrams', Path: 'a.md' }, { ActiveSkillIDs: [] });
        expect(result.ResultCode).toBe('FILE_NOT_FOUND');
        expect(views.calls[0].ExtraFilter).toContain(' AND 1=0');
    });

    it('outside a run (no ActiveSkillIDs) reads by name and path alone', async () => {
        views.results = [[{ Path: 'a.md', Content: 'A' }]];
        await run({ Skill: 'Diagrams', Path: 'a.md' });
        expect(views.calls[0].ExtraFilter).toBe(`Skill=N'Diagrams' AND Path=N'a.md'`);
    });

    it('matches a non-Latin skill name and path as Unicode (N literals)', async () => {
        views.results = [[{ Path: 'références/日本語.md', Content: 'x' }]];
        await run({ Skill: 'Отчёты', Path: 'références/日本語.md' });
        expect(views.calls[0].ExtraFilter).toBe(`Skill=N'Отчёты' AND Path=N'références/日本語.md'`);
    });

    it('drops a malformed ActiveSkillIDs entry rather than binding it into the filter', async () => {
        await run({ Skill: 'Diagrams', Path: 'a.md' }, { ActiveSkillIDs: [ACTIVE, "x') OR 1=1 --"] });
        expect(views.calls[0].ExtraFilter).toContain(`SkillID IN ('${ACTIVE}')`);
        expect(views.calls[0].ExtraFilter).not.toContain('OR 1=1');
    });

    it('on a miss, lists the skill\'s paths without loading content', async () => {
        views.results = [[], [{ Path: 'references/a.md' }, { Path: 'references/b.md' }]];
        const { result } = await run({ Skill: 'Diagrams', Path: 'nope.md' }, { ActiveSkillIDs: [ACTIVE] });

        expect(result.ResultCode).toBe('FILE_NOT_FOUND');
        expect(result.Message).toContain('references/a.md, references/b.md');
        expect(views.calls[1].Fields).toEqual(['Path']);
    });

    it('requires both Skill and Path', async () => {
        const { result } = await run({ Skill: 'Diagrams' });
        expect(result.ResultCode).toBe('MISSING_PARAMETERS');
        expect(views.calls).toHaveLength(0);
    });
});
