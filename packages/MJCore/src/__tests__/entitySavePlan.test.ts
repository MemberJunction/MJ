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
 *   4. **`SelfOnly` routes the root to its own option set** — carrying `IsGraphNodeSave`, without
 *      which the root re-enters graph planning (infinite recursion) and deadlocks on its own
 *      in-flight save debounce.
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

    it('routes the SelfOnly root node to RootSaveOptions and children to SaveOptions', async () => {
        const calls: Call[] = [];
        const root = makeEntity('Root', calls);
        const rootOptions = { IsGraphNodeSave: true } as unknown as EntitySaveOptions;
        const childOptions = { IsGraphNodeSave: false } as unknown as EntitySaveOptions;

        const plan = new EntitySavePlan(root)
            .AddSave(root, 'root', undefined, true)
            .AddSave(makeEntity('ChildA', calls), 'Lines[0]');

        await ExecuteEntitySavePlan(plan, { SaveOptions: childOptions, RootSaveOptions: rootOptions });

        expect(calls[0].options).toBe(rootOptions);
        expect(calls[1].options).toBe(childOptions);
    });

    it('routes the SelfOnly root delete node to RootDeleteOptions', async () => {
        const calls: Call[] = [];
        const root = makeEntity('Root', calls);
        const rootOptions = { IsGraphNodeDelete: true } as unknown as EntityDeleteOptions;
        const childOptions = {} as unknown as EntityDeleteOptions;

        const plan = new EntitySavePlan(root);
        plan.AddDelete(makeEntity('ChildA', calls), 'Lines[0]');
        plan.Add({ Entity: root, Operation: 'Delete', Label: 'root', SelfOnly: true });

        await ExecuteEntitySavePlan(plan, { DeleteOptions: childOptions, RootDeleteOptions: rootOptions });

        // Children first on the delete path — they hold the FK to the row about to disappear.
        expect(calls.map(c => c.label)).toEqual(['ChildA', 'Root']);
        expect(calls[0].options).toBe(childOptions);
        expect(calls[1].options).toBe(rootOptions);
    });
});
