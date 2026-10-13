/**
 * SkillImportExportService.resolveExposeToModel — the SKILL.md `codeOnlyActions` list becomes the
 * per-action ExposeToModel map that resyncJunction applies.
 *
 * Two things pinned here, both from the #4365 review:
 *  - "present but empty" is an opinion. A skill with exactly one code-only action, whose author deletes
 *    that name and re-imports, must get the action back in the model's run. Before the parser fix the
 *    empty block form parsed as `undefined`, resolve returned "no opinion", and the carry silently kept
 *    the old `false`.
 *  - warnings quote the name the author typed, not the GUID it resolved to.
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
const svc = SkillImportExportService as unknown as {
    resolveExposeToModel: (fm: Frontmatter, resolvedActionIDs: string[], warnings: string[]) => Map<string, boolean> | undefined;
    resyncJunction: (...a: unknown[]) => Promise<void>;
};

describe('resolveExposeToModel', () => {
    it('returns no opinion when the key is absent, and an all-exposed map when it is present but empty', () => {
        const absent = SkillMarkdownConverter.Parse(['---', 'name: X', 'actions:', '  - Generate PDF', '---', 'Body'].join('\n')).frontmatter;
        expect(svc.resolveExposeToModel(absent, [GENERATE_PDF], [])).toBeUndefined();

        for (const file of [
            ['---', 'name: X', 'actions:', '  - Generate PDF', 'codeOnlyActions:', '---', 'Body'],      // block form, items deleted
            ['---', 'name: X', 'actions:', '  - Generate PDF', 'codeOnlyActions: []', '---', 'Body'],   // inline form
        ]) {
            const fm = SkillMarkdownConverter.Parse(file.join('\n')).frontmatter;
            const warnings: string[] = [];
            const map = svc.resolveExposeToModel(fm, [GENERATE_PDF], warnings);
            expect(map).toEqual(new Map([[GENERATE_PDF, true]]));
            expect(warnings).toEqual([]);
        }
    });

    it('marks listed, bundled actions code-only and leaves the rest exposed, case-insensitively', () => {
        const fm = SkillMarkdownConverter.Parse(['---', 'name: X', 'actions:', '  - Run Query', '  - Generate PDF', 'codeOnlyActions:', '  - generate pdf', '---', 'Body'].join('\n')).frontmatter;
        const warnings: string[] = [];
        const map = svc.resolveExposeToModel(fm, [RUN_QUERY.toLowerCase(), GENERATE_PDF], warnings);
        expect(map).toEqual(new Map([[RUN_QUERY, true], [GENERATE_PDF, false]]));
        expect(warnings).toEqual([]);
    });

    it('quotes the name the author typed in both warnings, and never lets a warned name mark anything code-only', () => {
        const fm = SkillMarkdownConverter.Parse(['---', 'name: X', 'actions:', '  - Run Query', 'codeOnlyActions:', '  - Send Email', '  - No Such Action', '---', 'Body'].join('\n')).frontmatter;
        const warnings: string[] = [];
        const map = svc.resolveExposeToModel(fm, [RUN_QUERY], warnings);
        expect(map).toEqual(new Map([[RUN_QUERY, true]]));
        // Known action, but not bundled under `actions` → says so by name.
        expect(warnings).toContainEqual(expect.stringContaining("'Send Email'"));
        expect(warnings.some(w => w.includes(SEND_EMAIL))).toBe(false);
        // Unknown name → resolveNames' own warning, by name.
        expect(warnings).toContainEqual(expect.stringContaining("'No Such Action'"));
        expect(warnings).toHaveLength(2);
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
        const exposeToModel = svc.resolveExposeToModel(fm, [GENERATE_PDF], warnings);
        await svc.resyncJunction('S', 'MJ: AI Skill Actions', [GENERATE_PDF], 'ActionID', user, provider, exposeToModel);

        expect(created).toHaveLength(1);
        expect(created[0]['ActionID']).toBe(GENERATE_PDF);
        expect(created[0]['ExposeToModel']).toBe(true);
        expect(warnings).toEqual([]);
    });

    it('still carries the old flag when the key is removed altogether (no opinion)', async () => {
        const fm = SkillMarkdownConverter.Parse(['---', 'name: X', 'actions:', '  - Generate PDF', '---', 'Body'].join('\n')).frontmatter;
        const exposeToModel = svc.resolveExposeToModel(fm, [GENERATE_PDF], []);
        await svc.resyncJunction('S', 'MJ: AI Skill Actions', [GENERATE_PDF], 'ActionID', user, provider, exposeToModel);
        expect(created[0]['ExposeToModel']).toBe(false);
    });
});
