/**
 * SkillImportExportService — importing from an upstream source records the source columns and the
 * skill's files in one transaction, an update keeps what the SKILL.md does not mention, and the
 * scheduled update check sets a changed skill to Pending without touching its content (or a newer
 * import that landed while it was fetching). Engines are module-mocked, `RunView.prototype.RunView` is
 * spied, and a fake provider hands back plain objects that record what the service sets on them.
 * `SafeFetch` is module-mocked to serve the upstream. No network, no database.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseProviderBase, Metadata, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJAISkillEntity } from '@memberjunction/core-entities';

const { safeFetch, RUN_QUERY } = vi.hoisted(() => ({ safeFetch: vi.fn(), RUN_QUERY: 'AAAAAAAA-0000-0000-0000-00000000000A' }));
vi.mock('@memberjunction/network-utils', () => ({ SafeFetch: (...args: unknown[]) => safeFetch(...args) }));
vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: { Agents: [], Config: vi.fn() } } }));
vi.mock('@memberjunction/actions', () => ({ ActionEngineServer: { Instance: { Actions: [{ ID: RUN_QUERY, Name: 'Run Query' }], Config: vi.fn() } } }));

import { SkillImportExportService } from '../SkillImportExportService';
import { ComputeSkillContentHash } from '../SkillSources';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const SKILL_MD = '---\nname: pdf\ndescription: PDFs\nlicense: MIT\nmetadata:\n  version: 2.1.0\n---\nRead references/forms.md first.';
const COMMIT_URL = 'https://api.github.com/repos/acme/skills/commits/v2';
const TREE_URL = `https://api.github.com/repos/acme/skills/git/trees/${SHA}?recursive=1`;
const RAW = `https://raw.githubusercontent.com/acme/skills/${SHA}/skills/pdf`;

function treeOf(...paths: string[]): string {
    return JSON.stringify({ truncated: false, tree: ['skills/pdf/SKILL.md', ...paths].map(path => ({ path, type: 'blob', size: 80 })) });
}

const UPSTREAM: Record<string, string> = {
    [COMMIT_URL]: SHA,
    [TREE_URL]: treeOf('skills/pdf/references/forms.md'),
    [`${RAW}/SKILL.md`]: SKILL_MD,
    [`${RAW}/references/forms.md`]: 'Forms',
};

function serve(routes: Record<string, string>): void {
    safeFetch.mockImplementation(async (url: string) => {
        const body = routes[url];
        return body === undefined ? new Response('', { status: 404 }) : new Response(body, { status: 200 });
    });
}

type Recorded = Record<string, unknown> & { EntityName: string; Save: ReturnType<typeof vi.fn> };

/** A provider whose entity objects record what is set on them. `existingSkill` is what Load() fills in. */
function fakeProvider(existingSkill?: Record<string, unknown>, transactional = false) {
    const created: Recorded[] = [];
    const scope = { Commit: vi.fn(async () => undefined), Rollback: vi.fn(async () => undefined) };
    const log: string[] = [];
    const provider = {
        SupportsEntityTransactions: transactional,
        BeginEntityTransaction: vi.fn(async () => { log.push('begin'); return scope; }),
        GetEntityObject: vi.fn(async (entityName: string) => {
            const row: Recorded = {
                EntityName: entityName,
                ID: `row-${created.length}`,
                NewRecord: vi.fn(),
                Load: vi.fn(async () => { Object.assign(row, existingSkill); return true; }),
                Save: vi.fn(async () => { log.push(`save ${entityName}`); return true; }),
            };
            created.push(row);
            return row;
        }),
    };
    return { provider: provider as unknown as IMetadataProvider, created, scope, log, raw: provider };
}

const user = { ID: 'user-1' } as unknown as UserInfo;

describe('SkillImportExportService.ImportSkillFromSource', () => {
    let runViewSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        safeFetch.mockReset();
        serve(UPSTREAM);
        runViewSpy = vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async () => ({ Success: true, Results: [] }) as never);
    });
    afterEach(() => runViewSpy.mockRestore());

    it('imports a GitHub folder at one commit: source columns, frontmatter extras, one file row per file', async () => {
        const { provider, created } = fakeProvider();
        const result = await SkillImportExportService.ImportSkillFromSource('https://github.com/acme/skills/tree/v2/skills/pdf', user, undefined, provider);

        const skill = result.skill as unknown as Recorded;
        expect(skill).toMatchObject({
            Name: 'pdf',
            Status: 'Active',
            SourceType: 'GitHub',
            // The folder at the imported commit, so pinning is a matter of copying the SHA into SourceRef.
            SourceURL: `https://github.com/acme/skills/tree/${SHA}/skills/pdf`,
            SourceRef: 'v2',
            SourceVersion: '2.1.0',
            SourceContentHash: ComputeSkillContentHash({ Markdown: SKILL_MD, Files: [{ Path: 'references/forms.md', Content: 'Forms' }] }),
        });
        expect(skill.LastSyncedAt).toBeInstanceOf(Date);
        expect(JSON.parse(skill.Frontmatter as string)).toEqual({ license: 'MIT', metadata: { version: '2.1.0' } });

        const files = created.filter(r => r.EntityName === 'MJ: AI Skill Files');
        expect(files).toEqual([expect.objectContaining({ SkillID: skill.ID, Path: 'references/forms.md', Content: 'Forms' })]);
        expect(result.warnings).toEqual([]);
    });

    it('writes the skill and its files inside one transaction, and commits it', async () => {
        const { provider, scope, log } = fakeProvider(undefined, true);
        await SkillImportExportService.ImportSkillFromSource('https://github.com/acme/skills/tree/v2/skills/pdf', user, undefined, provider);
        expect(log).toEqual(['begin', 'save MJ: AI Skills', 'save MJ: AI Skill Files']);
        expect(scope.Commit).toHaveBeenCalledTimes(1);
        expect(scope.Rollback).not.toHaveBeenCalled();
    });

    it('rolls the whole import back when a file row fails to save', async () => {
        const { provider, scope, raw } = fakeProvider(undefined, true);
        raw.GetEntityObject.mockImplementation(async (entityName: string) => ({
            EntityName: entityName, ID: 'row', NewRecord: vi.fn(),
            Save: vi.fn(async () => entityName !== 'MJ: AI Skill Files'),
            LatestResult: { CompleteMessage: 'Violation of UNIQUE KEY constraint' },
        }));
        await expect(SkillImportExportService.ImportSkillFromSource('https://github.com/acme/skills/tree/v2/skills/pdf', user, undefined, provider))
            .rejects.toThrow(/UNIQUE KEY/);
        expect(scope.Rollback).toHaveBeenCalledTimes(1);
        expect(scope.Commit).not.toHaveBeenCalled();
    });

    it('rejects paths that differ only by case before writing anything', async () => {
        serve({ ...UPSTREAM, [TREE_URL]: treeOf('skills/pdf/Notes.md', 'skills/pdf/notes.md'), [`${RAW}/Notes.md`]: 'A', [`${RAW}/notes.md`]: 'B' });
        const { provider, raw } = fakeProvider(undefined, true);
        await expect(SkillImportExportService.ImportSkillFromSource('https://github.com/acme/skills/tree/v2/skills/pdf', user, undefined, provider))
            .rejects.toThrow(/differ only by case/);
        expect(raw.BeginEntityTransaction).not.toHaveBeenCalled();
        expect(raw.GetEntityObject).not.toHaveBeenCalled();
    });

    it('accepting an upstream change keeps the local Name, Category and bundled Actions/sub-agents', async () => {
        const { provider } = fakeProvider({ ID: 'skill-1', Name: 'PDF Toolkit', Category: 'Documents', Status: 'Pending' });
        const result = await SkillImportExportService.ImportSkillFromSource(
            'https://github.com/acme/skills/tree/v2/skills/pdf', user, { updateSkillId: 'skill-1' }, provider);

        expect(result.skill).toMatchObject({ Name: 'PDF Toolkit', Category: 'Documents', Status: 'Active', Instructions: 'Read references/forms.md first.' });
        // An Anthropic-style SKILL.md has no actions/subAgents keys: the junctions are not touched at all.
        const read = runViewSpy.mock.calls.map(call => (call[0] as { EntityName: string }).EntityName);
        expect(read).toEqual(['MJ: AI Skill Files']);
    });

    it('a sourced import without a provider runs on an independent instance, never on the shared one (#5059)', async () => {
        const { provider: independent, scope } = fakeProvider(undefined, true);
        const release = vi.fn(async () => undefined);
        Object.assign(independent, { ReleaseIndependentInstance: release });
        const shared = Object.create(DatabaseProviderBase.prototype) as DatabaseProviderBase;
        const begin = vi.fn();
        Object.defineProperty(shared, 'BeginEntityTransaction', { value: begin });
        Object.defineProperty(shared, 'CreateIndependentInstance', { value: vi.fn(async () => independent) });
        const before = Metadata.Provider;
        Metadata.Provider = shared;
        try {
            await SkillImportExportService.ImportSkillFromSource('https://github.com/acme/skills/tree/v2/skills/pdf', user);
        } finally {
            Metadata.Provider = before;
        }
        expect(begin).not.toHaveBeenCalled();
        expect(scope.Commit).toHaveBeenCalledTimes(1);
        expect(release).toHaveBeenCalledTimes(1);
    });
});

describe('SkillImportExportService.ImportSkill on an update', () => {
    let runViewSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        runViewSpy = vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async () => ({ Success: true, Results: [] }) as never);
    });
    afterEach(() => runViewSpy.mockRestore());

    it('takes the file Name, keeps what an absent key leaves out, and replaces what a present key states', async () => {
        const { provider, created } = fakeProvider({ ID: 'skill-1', Name: 'Old', Category: 'Ops' });
        const md = ['---', 'name: New Name', 'actions:', '  - Run Query', '---', '', 'Body.'].join('\n');
        const result = await SkillImportExportService.ImportSkill(md, user, { updateSkillId: 'skill-1' }, provider);

        expect(result.skill).toMatchObject({ Name: 'New Name', Category: 'Ops' });
        const read = runViewSpy.mock.calls.map(call => (call[0] as { EntityName: string }).EntityName);
        expect(read).toEqual(['MJ: AI Skill Actions']); // actions present -> resynced; subAgents absent -> kept
        expect(created.filter(r => r.EntityName === 'MJ: AI Skill Actions')).toEqual([expect.objectContaining({ ActionID: RUN_QUERY })]);
    });
});

describe('SkillImportExportService.CheckSkillForUpdate', () => {
    beforeEach(() => {
        safeFetch.mockReset();
        serve({ 'https://example.com/SKILL.md': SKILL_MD });
    });

    /** A sourced skill whose Load() applies `onReload` (what a concurrent writer left in the row). */
    function sourcedSkill(hash: string, status: MJAISkillEntity['Status'] = 'Active', onReload: Record<string, unknown> = {}) {
        const skill: Record<string, unknown> = {
            ID: 'skill-1', Name: 'pdf', Status: status, SourceType: 'URL', SourceURL: 'https://example.com/SKILL.md', SourceRef: null,
            SourceContentHash: hash, Instructions: 'old instructions', Save: vi.fn(async () => true),
        };
        skill.Load = vi.fn(async () => { Object.assign(skill, onReload); return true; });
        return skill as Record<string, unknown> & { Save: ReturnType<typeof vi.fn>; Load: ReturnType<typeof vi.fn> };
    }
    const check = (skill: Record<string, unknown>) => SkillImportExportService.CheckSkillForUpdate(skill as unknown as MJAISkillEntity);
    const upstreamHash = ComputeSkillContentHash({ Markdown: SKILL_MD, Files: [] });

    it('upstream changed -> re-reads the row, then Pending, content untouched', async () => {
        const skill = sourcedSkill('0'.repeat(64));
        expect(await check(skill)).toBe(true);
        expect(skill.Load).toHaveBeenCalledWith('skill-1');
        expect(skill.Status).toBe('Pending');
        expect(skill.Instructions).toBe('old instructions');
        expect(skill.SourceContentHash).toBe('0'.repeat(64));
        expect(skill.Save).toHaveBeenCalledTimes(1);
    });

    it('upstream unchanged -> nothing re-read or saved', async () => {
        const skill = sourcedSkill(upstreamHash);
        expect(await check(skill)).toBe(false);
        expect(skill.Load).not.toHaveBeenCalled();
        expect(skill.Save).not.toHaveBeenCalled();
    });

    it('a re-import that landed during the fetch is neither overwritten nor flagged', async () => {
        const skill = sourcedSkill('0'.repeat(64), 'Active', { SourceContentHash: upstreamHash, Instructions: 'new instructions' });
        expect(await check(skill)).toBe(false);
        expect(skill.Save).not.toHaveBeenCalled();
        expect(skill.Instructions).toBe('new instructions');
    });

    it('a skill re-pinned or set Pending during the fetch is left alone', async () => {
        const repinned = sourcedSkill('0'.repeat(64), 'Active', { SourceURL: 'https://example.com/v2/SKILL.md' });
        expect(await check(repinned)).toBe(false);
        const flagged = sourcedSkill('0'.repeat(64), 'Active', { Status: 'Pending' });
        expect(await check(flagged)).toBe(false);
        expect(repinned.Save).not.toHaveBeenCalled();
        expect(flagged.Save).not.toHaveBeenCalled();
    });

    it('a skill with no source, or not Active, is not fetched at all', async () => {
        expect(await check(sourcedSkill('0'.repeat(64), 'Pending'))).toBe(false);
        expect(await check({ ...sourcedSkill('x'), SourceType: null, SourceURL: null })).toBe(false);
        expect(safeFetch).not.toHaveBeenCalled();
    });

    it('a stored source that is not https is refused before any request', async () => {
        await expect(check({ ...sourcedSkill('x'), SourceURL: 'http://169.254.169.254/latest/meta-data' })).rejects.toThrow(/https/);
        expect(safeFetch).not.toHaveBeenCalled();
    });
});
