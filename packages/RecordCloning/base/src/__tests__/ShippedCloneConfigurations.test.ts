import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IEntityCloneConfiguration } from '@memberjunction/core';
import { ResolveEdgePolicy } from '../ClonePolicyResolver';
import { ApplyJsonRemap, type JsonRemapRule } from '../JsonRemapEngine';
import { CloneConfigValidator, type CloneConfigEntityMeta } from '../CloneConfigValidator';

/**
 * Guards the clone configurations MJ ships in metadata/entities/.clone-configurations.json.
 * These run against the real file, so a config change that would widen what a clone copies fails here.
 */

interface ShippedRecord {
    fields: { Name: string; Configuration?: { Clone?: IEntityCloneConfiguration } };
}

const shipped: ShippedRecord[] = JSON.parse(
    readFileSync(resolve(__dirname, '../../../../../metadata/entities/.clone-configurations.json'), 'utf8')
);
const byName = new Map(shipped.map((r) => [r.fields.Name, r.fields.Configuration?.Clone ?? {}]));
const enabledRoots = shipped.filter((r) => r.fields.Configuration?.Clone?.Enabled === true && !r.fields.Configuration.Clone.NotCloneable);

describe('shipped clone configurations', () => {
    it('ships at least the core cloneable roots', () => {
        expect(enabledRoots.map((r) => r.fields.Name)).toEqual(expect.arrayContaining(['MJ: Users', 'MJ: AI Agents', 'MJ: AI Prompts', 'MJ: Actions']));
    });

    it('classifies every writable column of a Strict entity, so a new CodeGen column fails the build (drift guard)', () => {
        // The generated class has a setter for each writable base-table column; views and
        // read-only fields have getters only.
        const generated = readFileSync(resolve(__dirname, '../../../../MJCoreEntities/src/generated/entities/__mj.ts'), 'utf8');
        const writableColumns = (entityName: string): string[] => {
            const start = generated.indexOf(`@RegisterClass(BaseEntity, '${entityName}')`);
            expect(start, `${entityName} has no generated class`).toBeGreaterThan(-1);
            const body = generated.slice(start, generated.indexOf('\n}\n', start));
            return [...body.matchAll(/^    set (\w+)\(/gm)].map((m) => m[1]);
        };
        const strict = shipped.filter((r) => r.fields.Configuration?.Clone?.Fields?.Strict === true);
        expect(strict.length).toBeGreaterThan(0);
        for (const r of strict) {
            const fields = writableColumns(r.fields.Name).map((Name) => ({
                Name,
                IsPrimaryKey: Name === 'ID',
                IsCreatedAtField: Name === '__mj_CreatedAt',
                IsUpdatedAtField: Name === '__mj_UpdatedAt',
            }));
            const drift = CloneConfigValidator.Validate({
                Name: r.fields.Name,
                Fields: fields,
                CloneConfiguration: r.fields.Configuration!.Clone as CloneConfigEntityMeta['CloneConfiguration'],
            }).filter((e) => e.Message.startsWith('Strict mode'));
            expect(drift.map((e) => e.Message)).toEqual([]);
        }
    });

    it('uses no key this release does not honor', () => {
        const unhonored = shipped.flatMap((r) =>
            CloneConfigValidator.Validate({ Name: r.fields.Name, Fields: [], CloneConfiguration: r.fields.Configuration?.Clone as CloneConfigEntityMeta['CloneConfiguration'] })
                .filter((e) => e.Message.includes('not honored'))
                .map((e) => `${r.fields.Name}: ${e.PropertyPath}`)
        );
        expect(unhonored).toEqual([]);
    });

    it('gives every JsonRemap entry a Field and Rules or a Preset', () => {
        const empty = shipped.flatMap((r) =>
            (r.fields.Configuration?.Clone?.Fields?.JsonRemap ?? [])
                .filter((j) => !j.Field || (!j.Preset && !j.Rules?.length))
                .map((j) => `${r.fields.Name}.${j.Field ?? '?'}`)
        );
        expect(empty).toEqual([]);
    });

    it('remaps a cloned agent\'s rerank prompt and keeps its reranker model', () => {
        const remap = byName.get('MJ: AI Agents')!.Fields!.JsonRemap!.find((j) => j.Field === 'RerankerConfiguration')!;
        const res = ApplyJsonRemap(
            { enabled: true, rerankPromptID: 'prompt-old', rerankerModelId: 'model-1' },
            // The planner keys each cloned row both bare and as `Entity::key`; a bare match from
            // another entity must not count.
            { Rules: remap.Rules as JsonRemapRule[], KeyMap: { 'MJ: AI Prompts::prompt-old': 'prompt-new', 'model-1': 'model-other' } }
        );
        expect(res.Output).toEqual({ enabled: true, rerankPromptID: 'prompt-new', rerankerModelId: 'model-1' });
    });

    it('offers Clone only on the catalog roots (child entities are cloned under their root, not on their own)', () => {
        expect(enabledRoots.map((r) => r.fields.Name).sort()).toEqual([
            'MJ: AI Agents', 'MJ: AI Prompts', 'MJ: Actions', 'MJ: Applications', 'MJ: Components', 'MJ: Dashboards',
            'MJ: Data Contexts', 'MJ: Lists', 'MJ: Queries', 'MJ: Record Processes', 'MJ: Roles', 'MJ: Scheduled Jobs',
            'MJ: Templates', 'MJ: Themes', 'MJ: User Views', 'MJ: Users',
        ]);
    });

    it.each(enabledRoots.map((r) => [r.fields.Name, r.fields.Configuration!.Clone!] as const))(
        '%s does not follow a relationship it does not list',
        (name, config) => {
            const res = ResolveEdgePolicy({
                FromKey: `${name}::1`,
                ToKey: 'Unlisted::2',
                Kind: 'Relationship',
                ParentEntityName: name,
                ChildEntityName: 'MJ: Some Unlisted Child',
                JoinField: 'SomeID',
                CurrentDepth: 1,
                MaxDepth: 5,
                RootEntityConfig: config,
            });
            expect(res.Policy).toBe('Skip');
        }
    );

    it.each(['MJ: AI Agent Credentials', 'MJ: Company Integrations', 'MJ: Record Clone Logs', 'MJ: AI Agent Runs'])(
        '%s is NotCloneable at the entity level',
        (name) => {
            expect(byName.get(name)?.NotCloneable).toBe(true);
        }
    );

    it('keeps credentials out of an agent clone even when a request asks for them', () => {
        const res = ResolveEdgePolicy({
            FromKey: 'MJ: AI Agents::1',
            ToKey: 'MJ: AI Agent Credentials::2',
            Kind: 'Relationship',
            ParentEntityName: 'MJ: AI Agents',
            ChildEntityName: 'MJ: AI Agent Credentials',
            JoinField: 'AgentID',
            CurrentDepth: 1,
            MaxDepth: 5,
            RootEntityConfig: byName.get('MJ: AI Agents'),
            ChildEntityConfig: { NotCloneable: byName.get('MJ: AI Agent Credentials')?.NotCloneable },
            RequestOverrides: [{ ToKey: 'MJ: AI Agent Credentials::2', Policy: 'Deep' }],
            AllowUserOverrides: true,
        });
        expect(res.Policy).toBe('Skip');
        expect(res.Locked).toBe(true);
    });

    it("copies an agent's own rows but not another agent's rows that point at a copied prompt or template", () => {
        const agents = byName.get('MJ: AI Agents');
        const edge = (ParentEntityName: string, ChildEntityName: string, JoinField: string) =>
            ResolveEdgePolicy({
                FromKey: `${ParentEntityName}::1`,
                ToKey: `${ChildEntityName}::2`,
                Kind: 'Relationship',
                ParentEntityName,
                ChildEntityName,
                JoinField,
                RootEntityName: 'MJ: AI Agents',
                CurrentDepth: 2,
                MaxDepth: 5,
                RootEntityConfig: agents,
                ParentEntityConfig: byName.get(ParentEntityName),
            }).Policy;
        // The root's rows, and a sub-agent's (also an agent), are copied.
        expect(edge('MJ: AI Agents', 'MJ: AI Agent Actions', 'AgentID')).toBe('Deep');
        expect(edge('MJ: AI Agents', 'MJ: AI Agent Prompts', 'AgentID')).toBe('Deep');
        // Rows that hang from a copied prompt or template belong to whichever agent owns them.
        expect(edge('MJ: AI Prompts', 'MJ: AI Agent Actions', 'CompactPromptID')).toBe('Skip');
        expect(edge('MJ: AI Prompts', 'MJ: AI Agent Prompts', 'PromptID')).toBe('Skip');
        expect(edge('MJ: Templates', 'MJ: AI Agent Search Scopes', 'QueryTemplateID')).toBe('Skip');
    });

    it('uses only valid policies where one is set', () => {
        const valid = new Set(['Deep', 'Reference', 'Skip']);
        for (const [name, config] of byName) {
            for (const [key, rel] of Object.entries({ ...(config.Relationships ?? {}), ...(config.Descendants ?? {}) })) {
                const policy = (rel as { Policy?: string }).Policy;
                // Descendant entries may carry only field rules.
                if (policy !== undefined) expect(valid.has(policy), `${name} -> ${key}`).toBe(true);
            }
        }
    });

    it('is the only metadata file that sets Configuration on these entities', () => {
        // mj sync push writes the whole Configuration field, so two files setting it on one
        // entity would overwrite each other depending on push order.
        const dir = resolve(__dirname, '../../../../../metadata/entities');
        const owners = new Map<string, string[]>();
        for (const file of readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('.mj-sync'))) {
            const parsed: unknown = JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
            for (const record of Array.isArray(parsed) ? (parsed as ShippedRecord[]) : []) {
                if (record?.fields?.Configuration === undefined) continue;
                owners.set(record.fields.Name, [...(owners.get(record.fields.Name) ?? []), file]);
            }
        }
        expect(owners.size).toBeGreaterThan(20);
        const clash = [...owners].filter(([, files]) => files.length > 1);
        expect(clash).toEqual([]);
    });

    it('never lists a NotCloneable entity as a Deep child (NotCloneable wins, so that edge could never copy)', () => {
        const notCloneable = new Set([...byName].filter(([, c]) => c.NotCloneable).map(([n]) => n));
        const contradictions: string[] = [];
        for (const [name, config] of byName) {
            const edges = [
                ...Object.entries(config.Relationships ?? {}),
                ...(config.Presets ?? []).flatMap((p) => Object.entries(p.Relationships ?? {})),
            ];
            for (const [key, rel] of edges) {
                if (rel?.Policy === 'Deep' && notCloneable.has(key.split('.')[0])) contradictions.push(`${name} -> ${key}`);
            }
        }
        expect(contradictions).toEqual([]);
    });

    it('names the join field for a Deep child that has more than one foreign key to the same parent', () => {
        // A bare child name matches every FK: "MJ: AI Agent Steps" would follow SubAgentID too and
        // re-stamp a parent agent's step onto the copy. Such children must be keyed "<Child>.<JoinField>".
        const multi: { Children: Record<string, unknown> } = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/multi-fk-children.json'), 'utf8'));
        const ambiguous: string[] = [];
        for (const r of enabledRoots) {
            const config = r.fields.Configuration!.Clone!;
            const edges = [
                ...Object.entries(config.Relationships ?? {}),
                ...(config.Presets ?? []).flatMap((p) => Object.entries(p.Relationships ?? {})),
            ];
            for (const [key, rel] of edges) {
                if (rel?.Policy === 'Deep' && !key.includes('.') && key in multi.Children) ambiguous.push(`${r.fields.Name} -> ${key}`);
            }
        }
        expect(ambiguous).toEqual([]);
    });

    describe('MJ: Users keeps personal data out of a clone', () => {
        const users = byName.get('MJ: Users')!;
        const settings = users.Relationships?.['MJ: User Settings'];

        it('skips User Settings unless a preset opts in, and only with-settings does', () => {
            expect(settings?.Policy).toBe('Skip');
            const res = ResolveEdgePolicy({
                FromKey: 'MJ: Users::1', ToKey: 'MJ: User Settings::2', Kind: 'Relationship',
                ParentEntityName: 'MJ: Users', ChildEntityName: 'MJ: User Settings', JoinField: 'UserID',
                CurrentDepth: 1, MaxDepth: 5, RootEntityConfig: users,
            });
            expect(res.Policy).toBe('Skip');
            const deepPresets = (users.Presets ?? []).filter((p) => p.Relationships?.['MJ: User Settings']?.Policy === 'Deep').map((p) => p.Key);
            expect(deepPresets).toEqual(['with-settings']);
        });

        it('never copies device tokens, chat drafts or recording consent, even with with-settings', () => {
            const prefixes = (settings?.ExcludeRows ?? []).filter((r) => r.Field === 'Setting').flatMap((r) => r.StartsWith ?? []);
            expect(prefixes).toEqual(expect.arrayContaining(['mobile.', 'mj.chat.drafts', 'mj.realtimeVoice.recordingConsent']));
        });
    });
});
