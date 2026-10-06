/**
 * SkillImportExportService — importing from an upstream source records the source columns and the
 * skill's files, and the scheduled update check sets a changed skill to Pending without touching its
 * content. Engines are module-mocked, `RunView.prototype.RunView` is spied (no existing rows), and a
 * fake provider hands back plain objects that record what the service sets on them. No network: a
 * fake `fetch` serves the upstream.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJAISkillEntity } from '@memberjunction/core-entities';

vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: { Agents: [], Config: vi.fn() } } }));
vi.mock('@memberjunction/actions', () => ({ ActionEngineServer: { Instance: { Actions: [], Config: vi.fn() } } }));

import { SkillImportExportService } from '../SkillImportExportService';
import { ComputeSkillContentHash } from '../SkillSources';

const SKILL_MD = '---\nname: pdf\ndescription: PDFs\nlicense: MIT\nmetadata:\n  version: 2.1.0\n---\nRead references/forms.md first.';
const TREE_URL = 'https://api.github.com/repos/acme/skills/git/trees/v2?recursive=1';
const RAW = 'https://raw.githubusercontent.com/acme/skills/v2/skills/pdf';
const TREE = JSON.stringify({
    truncated: false,
    tree: [
        { path: 'skills/pdf/SKILL.md', type: 'blob', size: 80 },
        { path: 'skills/pdf/references/forms.md', type: 'blob', size: 5 },
    ],
});

function fakeFetch(routes: Record<string, string>): typeof fetch {
    return (async (input: string | URL | Request) => {
        const body = routes[String(input)];
        return body === undefined ? new Response('', { status: 404 }) : new Response(body, { status: 200 });
    }) as typeof fetch;
}

type Recorded = Record<string, unknown> & { Save: () => Promise<boolean> };

describe('SkillImportExportService.ImportSkillFromSource', () => {
    const created: Recorded[] = [];
    let runViewSpy: ReturnType<typeof vi.spyOn>;
    const provider = {
        GetEntityObject: vi.fn(async () => {
            const row: Recorded = { ID: `row-${created.length}`, NewRecord: vi.fn(), Save: vi.fn(async () => true) };
            created.push(row);
            return row;
        }),
    } as unknown as IMetadataProvider;
    const user = { ID: 'user-1' } as unknown as UserInfo;

    beforeEach(() => {
        created.length = 0;
        runViewSpy = vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async () => ({ Success: true, Results: [] }) as never);
    });
    afterEach(() => runViewSpy.mockRestore());

    it('imports a GitHub skill folder: source columns, frontmatter extras, and one file row per file', async () => {
        const routes = { [TREE_URL]: TREE, [`${RAW}/SKILL.md`]: SKILL_MD, [`${RAW}/references/forms.md`]: 'Forms' };
        const result = await SkillImportExportService.ImportSkillFromSource(
            'https://github.com/acme/skills/tree/v2/skills/pdf', user, { fetchFn: fakeFetch(routes) }, provider);

        const skill = result.skill as unknown as Recorded;
        expect(skill).toMatchObject({
            Name: 'pdf',
            Status: 'Active',
            SourceType: 'GitHub',
            SourceURL: 'https://github.com/acme/skills/tree/v2/skills/pdf',
            SourceRef: 'v2',
            SourceVersion: '2.1.0',
            SourceContentHash: ComputeSkillContentHash({ Markdown: SKILL_MD, Files: [{ Path: 'references/forms.md', Content: 'Forms' }] }),
        });
        expect(skill.LastSyncedAt).toBeInstanceOf(Date);
        expect(JSON.parse(skill.Frontmatter as string)).toEqual({ license: 'MIT', metadata: { version: '2.1.0' } });

        const files = created.filter(r => 'Path' in r);
        expect(files).toEqual([expect.objectContaining({ SkillID: skill.ID, Path: 'references/forms.md', Content: 'Forms' })]);
        expect(result.warnings).toEqual([]);
    });
});

describe('SkillImportExportService.CheckSkillForUpdate', () => {
    const upstream = fakeFetch({ 'https://example.com/SKILL.md': SKILL_MD });

    function sourcedSkill(hash: string, status: MJAISkillEntity['Status'] = 'Active') {
        return {
            Name: 'pdf', Status: status, SourceType: 'URL', SourceURL: 'https://example.com/SKILL.md', SourceRef: null,
            SourceContentHash: hash, Instructions: 'old instructions', Save: vi.fn(async () => true),
        };
    }

    it('upstream changed -> Pending, content untouched', async () => {
        const skill = sourcedSkill('0'.repeat(64));
        expect(await SkillImportExportService.CheckSkillForUpdate(skill as unknown as MJAISkillEntity, upstream)).toBe(true);
        expect(skill.Status).toBe('Pending');
        expect(skill.Instructions).toBe('old instructions');
        expect(skill.SourceContentHash).toBe('0'.repeat(64));
        expect(skill.Save).toHaveBeenCalledTimes(1);
    });

    it('upstream unchanged -> nothing saved', async () => {
        const skill = sourcedSkill(ComputeSkillContentHash({ Markdown: SKILL_MD, Files: [] }));
        expect(await SkillImportExportService.CheckSkillForUpdate(skill as unknown as MJAISkillEntity, upstream)).toBe(false);
        expect(skill.Status).toBe('Active');
        expect(skill.Save).not.toHaveBeenCalled();
    });

    it('a skill with no source, or not Active, is not fetched at all', async () => {
        const fetchFn = vi.fn() as unknown as typeof fetch;
        const pending = sourcedSkill('0'.repeat(64), 'Pending');
        expect(await SkillImportExportService.CheckSkillForUpdate(pending as unknown as MJAISkillEntity, fetchFn)).toBe(false);
        const manual = { ...sourcedSkill('x'), SourceType: null, SourceURL: null };
        expect(await SkillImportExportService.CheckSkillForUpdate(manual as unknown as MJAISkillEntity, fetchFn)).toBe(false);
        expect(fetchFn).not.toHaveBeenCalled();
    });
});
