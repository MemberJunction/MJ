/**
 * Tests for `EntitySavePlan` and its executor.
 *
 * The plan is the ordered unit of work a composite save produces. These tests pin the four
 * properties the rest of the feature depends on:
 *
 *   1. **Order is execution order** — the root runs first on save (children need its primary key),
 *      children run first on delete (they hold the FK pointing at the row about to vanish).
 *   2. **`Prepare` runs immediately before its node** — this is how a child's foreign key gets the
 *      parent's freshly-assigned primary key. Running it at plan-build time would stamp `undefined`
 *      for every create, which is the single most likely way to break composite creates.
 *   3. **Stop at first failure** — the transaction is about to roll back, so continuing would pile
 *      up doomed work and let a later, more confusing error mask the real one.
 *   4. **`SelfOnly` routes the root through `SaveSelfOnly`** — the private graph-node
 *      entry on `BaseEntity`. Without that hop the root re-enters graph planning
 *      (infinite recursion) and deadlocks on its own in-flight save debounce.
 */

import { describe, it, expect } from 'vitest';
import { EntitySavePlan, ExecuteEntitySavePlan } from '../generic/entitySavePlan';
import type { BaseEntity } from '../generic/baseEntity';
import type { EntitySaveOptions, EntityDeleteOptions } from '../generic/interfaces';

/** Records which options each call received, so option routing can be asserted. */
type Call = { label: string; op: 'Save' | 'Delete'; options: unknown };

/**
 * A stand-in for BaseEntity that records calls. Only the members the executor touches are
 * implemented — `Save`, `Delete`, `LatestResult`, `EntityInfo`.
 */
function makeEntity(name: string, calls: Call[], outcome: { save?: boolean; del?: boolean } = {}): BaseEntity {
    const entity = {
        EntityInfo: { Name: name },
        LatestResult: { CompleteMessage: `${name} failed` },
        async Save(options?: EntitySaveOptions): Promise<boolean> {
            calls.push({ label: name, op: 'Save', options });
            return outcome.save !== false;
        },
        async Delete(options?: EntityDeleteOptions): Promise<boolean> {
            calls.push({ label: name, op: 'Delete', options });
            return outcome.del !== false;
        },
    };
    return entity as unknown as BaseEntity;
}

describe('EntitySavePlan', () => {
    it('reports NodeCount so a single-node plan can take the ordinary path', () => {
        const calls: Call[] = [];
        const root = makeEntity('Root', calls);
        const plan = new EntitySavePlan(root);

        expect(plan.NodeCount).toBe(0);
        plan.AddSave(root, 'root', undefined, true);
        expect(plan.NodeCount).toBe(1);
    });

    it('InsertBeforeRoot places the peer ahead of the owner so the FK can be stamped after the peer has a PK', async () => {
        const calls: Call[] = [];
        const root = makeEntity('Deal', calls);
        const order = makeEntity('Order', calls);
        const stamped: string[] = [];
        const plan = new EntitySavePlan(root);
        plan.AddSave(root, 'Deal', undefined, true);
        plan.AddSaveBeforeRoot(order, 'OrderID_Object');
        plan.AddRootPrepare(() => stamped.push('stamp'));

        const result = await ExecuteEntitySavePlan(plan);

        expect(result.Success).toBe(true);
        expect(calls.map(c => c.label)).toEqual(['Order', 'Deal']);
        expect(stamped).toEqual(['stamp']);
    });

    it('executes nodes in the order they were added', async () => {
        const calls: Call[] = [];
        const root = makeEntity('Root', calls);
        const plan = new EntitySavePlan(root)
            .AddSave(root, 'root', undefined, true)
            .AddSave(makeEntity('ChildA', calls), 'Lines[0]')
            .AddSave(makeEntity('ChildB', calls), 'Lines[1]');

        const result = await ExecuteEntitySavePlan(plan);

        expect(result.Success).toBe(true);
        expect(calls.map(c => c.label)).toEqual(['Root', 'ChildA', 'ChildB']);
    });

    it('runs each Prepare callback immediately before its own node, not at build time', async () => {
        // The FK-stamping guarantee: at the moment ChildA's Prepare runs, Root must already have
        // been saved.
        const calls: Call[] = [];
        const order: string[] = [];
        const root = {
            EntityInfo: { Name: 'Root' },
            LatestResult: null,
            async Save(): Promise<boolean> {
                order.push('save:Root');
                return true;
            },
            async Delete(): Promise<boolean> {
                return true;
            },
        } as unknown as BaseEntity;

        const plan = new EntitySavePlan(root)
            .AddSave(root, 'root', undefined, true)
            .AddSave(makeEntity('ChildA', calls), 'Lines[0]', () => order.push('prepare:ChildA'));

        await ExecuteEntitySavePlan(plan);

        expect(order).toEqual(['save:Root', 'prepare:ChildA']);
    });

    it('stops at the first failing node and reports which one failed', async () => {
        const calls: Call[] = [];
        const plan = new EntitySavePlan(makeEntity('Root', calls))
            .AddSave(makeEntity('ChildA', calls), 'Lines[0]')
            .AddSave(makeEntity('ChildB', calls, { save: false }), 'Lines[1]')
            .AddSave(makeEntity('ChildC', calls), 'Lines[2]');

        const result = await ExecuteEntitySavePlan(plan);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('Lines[1]');
        // ChildC never ran.
        expect(calls.map(c => c.label)).toEqual(['ChildA', 'ChildB']);
        expect(result.NodeResults).toHaveLength(2);
    });

    it('treats a thrown error as a node failure rather than propagating it', async () => {
        // BaseEntity.Save() signals logical failure by returning false, but infrastructure errors
        // still throw. Both must surface as a plan failure so the caller can roll back cleanly.
        const throwing = {
            EntityInfo: { Name: 'Throwing' },
            LatestResult: null,
            async Save(): Promise<boolean> {
                throw new Error('connection reset');
            },
            async Delete(): Promise<boolean> {
                return true;
            },
        } as unknown as BaseEntity;

        const plan = new EntitySavePlan(throwing).AddSave(throwing, 'Lines[0]');
        const result = await ExecuteEntitySavePlan(plan);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('connection reset');
    });

    it('routes the SelfOnly root through SaveSelfOnly, children through Save', async () => {
        const calls: Call[] = [];
        const selfOnly: Call[] = [];
        const root = makeEntity('Root', calls);
        const childOptions = { IgnoreDirtyState: true } as EntitySaveOptions;

        const plan = new EntitySavePlan(root)
            .AddSave(root, 'root', undefined, true)
            .AddSave(makeEntity('ChildA', calls), 'Lines[0]');

        await ExecuteEntitySavePlan(plan, {
            SaveOptions: childOptions,
            SaveSelfOnly: async (entity, options) => {
                selfOnly.push({ label: entity.EntityInfo.Name, op: 'Save', options });
                return true;
            },
        });

        expect(selfOnly).toHaveLength(1);
        expect(selfOnly[0].label).toBe('Root');
        expect(selfOnly[0].options).toBe(childOptions);
        expect(calls.map(c => c.label)).toEqual(['ChildA']);
        expect(calls[0].options).toBe(childOptions);
    });

    it('routes the SelfOnly root delete through DeleteSelfOnly', async () => {
        const calls: Call[] = [];
        const selfOnly: Call[] = [];
        const root = makeEntity('Root', calls);
        const childOptions = {} as EntityDeleteOptions;

        const plan = new EntitySavePlan(root);
        plan.AddDelete(makeEntity('ChildA', calls), 'Lines[0]');
        plan.Add({ Entity: root, Operation: 'Delete', Label: 'root', SelfOnly: true });

        await ExecuteEntitySavePlan(plan, {
            DeleteOptions: childOptions,
            DeleteSelfOnly: async (entity, options) => {
                selfOnly.push({ label: entity.EntityInfo.Name, op: 'Delete', options });
                return true;
            },
        });

        expect(calls.map(c => c.label)).toEqual(['ChildA']);
        expect(selfOnly).toHaveLength(1);
        expect(selfOnly[0].label).toBe('Root');
        expect(selfOnly[0].options).toBe(childOptions);
    });
});

/**
 * A keyed stand-in — identical to {@link makeEntity} but carrying a primary key, which is what the
 * cycle guard keys on. Object identity is deliberately NOT the key: after a round trip the same row
 * is a different instance, and that is exactly the shape a cycle takes.
 */
function makeKeyedEntity(name: string, pk: string, calls: Call[]): BaseEntity {
    const entity = {
        EntityInfo: { Name: name },
        PrimaryKey: { ToString: () => pk },
        LatestResult: { CompleteMessage: `${name} failed` },
        async Save(options?: EntitySaveOptions): Promise<boolean> {
            calls.push({ label: `${name}:${pk}`, op: 'Save', options });
            return true;
        },
        async Delete(options?: EntityDeleteOptions): Promise<boolean> {
            calls.push({ label: `${name}:${pk}`, op: 'Delete', options });
            return true;
        },
    };
    return entity as unknown as BaseEntity;
}

describe('EntitySavePlan — cycle guard', () => {
    it('refuses a child that is the same record as its own ancestor', async () => {
        const calls: Call[] = [];
        const agent = makeKeyedEntity('MJ: AI Agents', 'A1', calls);
        // The self-referential shape: a SubAgents collection containing the agent itself.
        const plan = new EntitySavePlan(agent);
        plan.AddSave(agent, 'MJ: AI Agents', undefined, true);
        plan.AddSave(makeKeyedEntity('MJ: AI Agents', 'A1', calls), 'SubAgents[0]');

        const result = await ExecuteEntitySavePlan(plan, {});

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('Cycle detected');
        expect(result.ErrorMessage).toContain('SubAgents[0]');
        // The root ran; the cycling child never did.
        expect(calls.map(c => c.label)).toEqual(['MJ: AI Agents:A1']);
    });

    it('allows a DIFFERENT record of the same entity as a child', async () => {
        const calls: Call[] = [];
        const parent = makeKeyedEntity('MJ: AI Agents', 'A1', calls);
        const plan = new EntitySavePlan(parent);
        plan.AddSave(parent, 'MJ: AI Agents', undefined, true);
        plan.AddSave(makeKeyedEntity('MJ: AI Agents', 'A2', calls), 'SubAgents[0]');

        const result = await ExecuteEntitySavePlan(plan, {});

        expect(result.Success).toBe(true);
        expect(calls.map(c => c.label)).toEqual(['MJ: AI Agents:A1', 'MJ: AI Agents:A2']);
    });

    it('exempts records with no primary key — a brand-new record cannot be its own ancestor', async () => {
        const calls: Call[] = [];
        const root = makeEntity('MJ: AI Agents', calls);
        const plan = new EntitySavePlan(root);
        plan.AddSave(root, 'MJ: AI Agents', undefined, true);
        plan.AddSave(makeEntity('MJ: AI Agents', calls), 'SubAgents[0]');

        const result = await ExecuteEntitySavePlan(plan, {});

        expect(result.Success).toBe(true);
        expect(calls).toHaveLength(2);
    });

    it('threads the visited set to child options so a nested graph sees its ancestors', async () => {
        const calls: Call[] = [];
        const root = makeKeyedEntity('MJ: AI Agents', 'A1', calls);
        const visited = new Set<string>();
        const plan = new EntitySavePlan(root);
        plan.AddSave(root, 'MJ: AI Agents', undefined, true);
        plan.AddSave(makeKeyedEntity('MJ: AI Agent Prompts', 'P1', calls), 'Prompts[0]');

        await ExecuteEntitySavePlan(plan, { Visited: visited });

        // Restored on the way out, so a sibling branch is not poisoned by this one's ancestors.
        expect(visited.size).toBe(0);
    });

    it('leaves an inherited visited set exactly as it found it', async () => {
        const calls: Call[] = [];
        const root = makeKeyedEntity('MJ: AI Agents', 'A1', calls);
        // Simulates being nested: an ancestor already registered this record.
        const visited = new Set<string>(['MJ: AI Agents|A1']);
        const plan = new EntitySavePlan(root);
        plan.AddSave(root, 'MJ: AI Agents', undefined, true);

        await ExecuteEntitySavePlan(plan, { Visited: visited });

        expect([...visited]).toEqual(['MJ: AI Agents|A1']);
    });
});
