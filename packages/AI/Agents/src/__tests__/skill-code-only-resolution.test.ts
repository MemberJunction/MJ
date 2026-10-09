/**
 * SkillImportExportService.resolveExposeToModel — the SKILL.md `codeOnlyActions` list becomes the
 * per-action ExposeToModel map that resyncJunction applies.
 *
 * Pinned here, from the #4365 review and the external-skills review:
 *  - "present but empty" is an opinion. A skill with exactly one code-only action, whose author deletes
 *    that name and re-imports, must get the action back in the model's run. Before the parser fix the
 *    empty block form parsed as `undefined`, resolve returned "no opinion", and the carry silently kept
 *    the old `false`.
 *  - warnings quote the name the author typed, not the GUID it resolved to.
 *  - a list naming something that is not under `actions` (a typo, or `A, B` read as one name) is not
 *    applied, and fails closed: it never makes an action model-callable.
 *
 * `ActionEngineServer` is module-mocked with a two-action catalog; the resync half reuses the fake
 * provider pattern from skill-import-resync.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView, type UserInfo } from '@memberjunction/core';

// vi.mock factories are hoisted above every import and const, so the catalog they share must be too.
const { RUN_QUERY, GENERATE_PDF, SEND_EMAIL } = vi.hoisted(() => ({
    RUN_QUERY: 'AAAAAAAA-0000-0000-0000-00000000000A',
    GENERATE_PDF: 'AAAAAAAA-0000-0000-0000-00000000000B',
    SEND_EMAIL: 'AAAAAAAA-0000-0000-0000-00000000000C',
}));

vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: { Agents: [], Config: vi.fn() } } }));
vi.mock('@memberjunction/actions', () => ({
    ActionEngineServer: {
        Instance: {
            Actions: [
                { ID: RUN_QUERY, Name: 'Run Query' },
                { ID: GENERATE_PDF, Name: 'Generate PDF' },
                { ID: SEND_EMAIL, Name: 'Send Email' },
            ],
            Config: vi.fn(),
        },
    },
}));

import { SkillImportExportService } from '../SkillImportExportService';
import { SkillMarkdownConverter } from '../SkillMarkdownConverter';

type Frontmatter = ReturnType<typeof SkillMarkdownConverter.Parse>['frontmatter'];
type Plan = { Stated: Map<string, boolean>; NewRowFlag?: boolean };
type Resolved = { Name: string; ID: string };
const svc = SkillImportExportService as unknown as {
    resolveExposeToModel: (fm: Frontmatter, bundled: Resolved[], warnings: string[]) => Plan | undefined;
    resyncJunction: (...a: unknown[]) => Promise<void>;
};
const fmOf = (lines: string[]) => SkillMarkdownConverter.Parse(['---', ...lines, '---', 'Body'].join('\n')).frontmatter;
const RQ: Resolved = { Name: 'Run Query', ID: RUN_QUERY };
const PDF: Resolved = { Name: 'Generate PDF', ID: GENERATE_PDF };
const MAIL: Resolved = { Name: 'Send Email', ID: SEND_EMAIL };

describe('resolveExposeToModel', () => {
    it('returns no opinion when the key is absent, and an all-exposed plan when it is present but empty', () => {
        expect(svc.resolveExposeToModel(fmOf(['name: X', 'actions:', '  - Generate PDF']), [PDF], [])).toBeUndefined();

        for (const lines of [
            ['name: X', 'actions:', '  - Generate PDF', 'codeOnlyActions:'],      // block form, items deleted
            ['name: X', 'actions:', '  - Generate PDF', 'codeOnlyActions: []'],   // inline form
        ]) {
            const warnings: string[] = [];
            expect(svc.resolveExposeToModel(fmOf(lines), [PDF], warnings)).toEqual({ Stated: new Map([[GENERATE_PDF, true]]) });
            expect(warnings).toEqual([]);
        }
    });

    it('marks listed, bundled actions code-only and leaves the rest exposed, case-insensitively', () => {
        const fm = fmOf(['name: X', 'actions:', '  - Run Query', '  - Generate PDF', 'codeOnlyActions:', '  - generate pdf']);
        const warnings: string[] = [];
        const plan = svc.resolveExposeToModel(fm, [{ ...RQ, ID: RUN_QUERY.toLowerCase() }, PDF], warnings);
        expect(plan).toEqual({ Stated: new Map([[RUN_QUERY, true], [GENERATE_PDF, false]]) });
        expect(warnings).toEqual([]);
    });

    it('reads a one-line codeOnlyActions as two names, not one unresolvable one', () => {
        const fm = fmOf(['name: X', 'actions: Run Query, Generate PDF, Send Email', 'codeOnlyActions: Generate PDF, Send Email']);
        const warnings: string[] = [];
        expect(svc.resolveExposeToModel(fm, [RQ, PDF, MAIL], warnings))
            .toEqual({ Stated: new Map([[RUN_QUERY, true], [GENERATE_PDF, false], [SEND_EMAIL, false]]) });
        expect(warnings).toEqual([]);
    });

    it('does not apply a list naming anything that is not under actions: nothing exposed, new rows code-only', () => {
        const fm = fmOf(['name: X', 'actions:', '  - Run Query', '  - Generate PDF', 'codeOnlyActions:', '  - Generate PDF', '  - Send Email', '  - Genrate PDF']);
        const warnings: string[] = [];
        const plan = svc.resolveExposeToModel(fm, [RQ, PDF], warnings);
        // Generate PDF still becomes code-only; Run Query gets no stated flag (it keeps its own); a new row is code-only.
        expect(plan).toEqual({ Stated: new Map([[GENERATE_PDF, false]]), NewRowFlag: false });
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("'Send Email', 'Genrate PDF'");
        expect(warnings[0]).not.toContain(SEND_EMAIL);
    });

    it('treats a name listed under actions but missing from this instance as no stray (it is simply not bundled)', () => {
        const fm = fmOf(['name: X', 'actions:', '  - Run Query', '  - Elsewhere Only', 'codeOnlyActions:', '  - Elsewhere Only']);
        const warnings: string[] = [];
        expect(svc.resolveExposeToModel(fm, [RQ], warnings)).toEqual({ Stated: new Map([[RUN_QUERY, true]]) });
        expect(warnings).toEqual([]);
    });
});

describe('a codeOnlyActions list that does not resolve never makes an action model-callable', () => {
    const created: Array<Record<string, unknown>> = [];
    let runViewSpy: ReturnType<typeof vi.spyOn>;
    const provider = {
        GetEntityObject: vi.fn(async () => {
            const row: Record<string, unknown> = { NewRecord: vi.fn(), Save: vi.fn(async () => true) };
            created.push(row);
            return row;
        }),
    };
    const user = { ID: 'user' } as unknown as UserInfo;

    beforeEach(() => {
        created.length = 0;
        // Run Query is bundled today and hidden from the model.
        const existing = [{ SkillID: 'S', ActionID: RUN_QUERY, ExposeToModel: false, Delete: vi.fn(async () => true), LatestResult: undefined }];
        runViewSpy = vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async () => ({ Success: true, Results: existing }) as never);
    });
    afterEach(() => runViewSpy.mockRestore());

    it('keeps an existing hidden action hidden and bundles a new action code-only', async () => {
        const fm = fmOf(['name: X', 'actions:', '  - Run Query', '  - Generate PDF', 'codeOnlyActions:', '  - Genrate PDF']);
        const plan = svc.resolveExposeToModel(fm, [RQ, PDF], []);
        await svc.resyncJunction('S', 'MJ: AI Skill Actions', [RUN_QUERY, GENERATE_PDF], 'ActionID', user, provider, plan);
        expect(created.map(r => [r['ActionID'], r['ExposeToModel']])).toEqual([[RUN_QUERY, false], [GENERATE_PDF, false]]);
    });
});

describe('re-importing a SKILL.md whose last code-only name was deleted', () => {
    const created: Array<Record<string, unknown>> = [];
    let runViewSpy: ReturnType<typeof vi.spyOn>;
    const existing = [{ SkillID: 'S', ActionID: GENERATE_PDF, ExposeToModel: false, Delete: vi.fn(async () => true), LatestResult: undefined }];
    const provider = {
        GetEntityObject: vi.fn(async () => {
            const row: Record<string, unknown> = { NewRecord: vi.fn(), Save: vi.fn(async () => true) };
            created.push(row);
            return row;
        }),
    };
    const user = { ID: 'user' } as unknown as UserInfo;

    beforeEach(() => {
        created.length = 0;
        runViewSpy = vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async () => ({ Success: true, Results: existing }) as never);
    });
    afterEach(() => runViewSpy.mockRestore());

    it('puts the action back in the run (ExposeToModel = true on the recreated row)', async () => {
        const exported = SkillMarkdownConverter.Serialize({ name: 'X', actionNames: ['Generate PDF'], codeOnlyActionNames: ['Generate PDF'], instructions: 'Body' });
        const edited = exported.replace('codeOnlyActions:\n  - Generate PDF', 'codeOnlyActions:'); // the hand edit: delete the one name, keep the key
        expect(edited).toMatch(/codeOnlyActions:\n(?!  - )/);
        const fm = SkillMarkdownConverter.Parse(edited).frontmatter;
        expect(fm.actions).toEqual(['Generate PDF']);

        const warnings: string[] = [];
        const exposeToModel = svc.resolveExposeToModel(fm, [PDF], warnings);
        await svc.resyncJunction('S', 'MJ: AI Skill Actions', [GENERATE_PDF], 'ActionID', user, provider, exposeToModel);

        expect(created).toHaveLength(1);
        expect(created[0]['ActionID']).toBe(GENERATE_PDF);
        expect(created[0]['ExposeToModel']).toBe(true);
        expect(warnings).toEqual([]);
    });

    it('still carries the old flag when the key is removed altogether (no opinion)', async () => {
        const fm = SkillMarkdownConverter.Parse(['---', 'name: X', 'actions:', '  - Generate PDF', '---', 'Body'].join('\n')).frontmatter;
        const exposeToModel = svc.resolveExposeToModel(fm, [PDF], []);
        await svc.resyncJunction('S', 'MJ: AI Skill Actions', [GENERATE_PDF], 'ActionID', user, provider, exposeToModel);
        expect(created[0]['ExposeToModel']).toBe(false);
    });
});
