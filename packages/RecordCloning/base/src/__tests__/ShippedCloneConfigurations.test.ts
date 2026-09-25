import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IEntityCloneConfiguration } from '@memberjunction/core';
import { ResolveEdgePolicy } from '../ClonePolicyResolver';

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
});
