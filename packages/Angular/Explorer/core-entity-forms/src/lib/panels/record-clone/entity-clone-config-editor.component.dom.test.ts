import { describe, it, expect, vi } from 'vitest';
import { FormsModule } from '@angular/forms';
import type { EntityInfo, IEntityCloneConfiguration } from '@memberjunction/core';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import { MJButtonDirective, MJDropdownComponent, MJNumericInputComponent, MJSwitchComponent } from '@memberjunction/ng-ui-components';
import { ClonePlanTreeComponent, RecordCloneService } from '@memberjunction/ng-record-clone';
import { EntityCloneConfigEditorComponent } from './entity-clone-config-editor.component';

/**
 * DOM coverage for <mj-entity-clone-config-editor> — the Record cloning panel in the Entities
 * form's Settings section. It edits Configuration.Clone and emits the whole bag on each change.
 */

const ENTITY = {
    Name: 'MJ: Users',
    Fields: [
        { Name: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier' },
        { Name: 'Email', IsPrimaryKey: false, Type: 'nvarchar', IsUnique: true },
        { Name: 'FirstName', IsPrimaryKey: false, Type: 'nvarchar' },
        { Name: '__mj_CreatedAt', IsPrimaryKey: false, Type: 'datetimeoffset' },
    ],
    RelatedEntities: [
        { ID: 'rel-roles', RelatedEntity: 'MJ: User Roles', RelatedEntityJoinField: 'UserID', Type: 'One To Many' },
        { ID: 'rel-lookup', RelatedEntity: 'MJ: Companies', RelatedEntityJoinField: 'CompanyID', Type: 'Many To One' },
    ],
} as unknown as EntityInfo;

const render = (inputs: Record<string, unknown> = {}, planClone = vi.fn()) =>
    renderComponentFixture(EntityCloneConfigEditorComponent, {
        imports: [FormsModule, MJButtonDirective, MJDropdownComponent, MJNumericInputComponent, MJSwitchComponent, ClonePlanTreeComponent],
        declarations: [EntityCloneConfigEditorComponent],
        providers: [{ provide: RecordCloneService, useValue: { PlanClone: planClone, DescribeRecord: vi.fn(), ExecuteClone: vi.fn(), GetLineage: vi.fn() } }],
        inputs: { Entity: ENTITY, EditMode: true, ...inputs },
    });

describe('EntityCloneConfigEditorComponent (DOM)', () => {
    it('offers every non-key, non-system field for the field rules', () => {
        const f = render();
        expect(f.componentInstance.FieldNames).toEqual(['Email', 'FirstName']);
    });

    it('lists only one-to-many relationships, with their configured policy', () => {
        const f = render({ CloneConfig: { Relationships: { 'MJ: User Roles': { Policy: 'Deep', Locked: true } } } });
        expect(f.componentInstance.RelationshipRows).toEqual([
            { RelatedEntity: 'MJ: User Roles', JoinField: 'UserID', ConfigKey: 'MJ: User Roles', Policy: 'Deep', Locked: true, MaxRecords: null },
        ]);
        expect(queryAll(f, '.mj-clone-config-table tbody tr')).toHaveLength(1);
    });

    it('shows only configured relationships until the user asks for all of them', () => {
        const f = render({ CloneConfig: { Enabled: true } });
        expect(f.componentInstance.VisibleRelationshipRows).toHaveLength(0);
        f.componentInstance.ShowAllRelationships = true;
        expect(f.componentInstance.VisibleRelationshipRows).toHaveLength(1);
    });

    it('emits the updated bag when a setting changes, and null when it empties', () => {
        const f = render({ CloneConfig: { Enabled: true } });
        const out = capture(f.componentInstance.CloneConfigChange);
        f.componentInstance.Patch({ MaxDepth: 2 });
        expect(out.at(-1)).toEqual({ Enabled: true, MaxDepth: 2 });

        // The editor is input-driven: the host feeds the emitted bag back in.
        f.componentInstance.CloneConfig = out.at(-1) as IEntityCloneConfiguration;
        f.componentInstance.Patch({ Enabled: undefined });
        expect(out.at(-1)).toEqual({ MaxDepth: 2 });

        f.componentInstance.CloneConfig = out.at(-1) as IEntityCloneConfiguration;
        f.componentInstance.Patch({ MaxDepth: undefined });
        expect(out.at(-1)).toBeNull();
    });

    it('adds and removes a prompted field', () => {
        const cfg: IEntityCloneConfiguration = { Enabled: true };
        const f = render({ CloneConfig: cfg });
        const out = capture(f.componentInstance.CloneConfigChange);
        f.componentInstance.AddField('PromptFor', 'Email');
        expect(out.at(-1)).toEqual({ Enabled: true, Fields: { PromptFor: ['Email'] } });

        f.componentInstance.CloneConfig = out.at(-1) as IEntityCloneConfiguration;
        f.componentInstance.RemoveField('PromptFor', 'Email');
        expect(out.at(-1)).toEqual({ Enabled: true });
    });

    it('writes and clears a relationship policy', () => {
        const f = render({ CloneConfig: { Enabled: true } });
        const out = capture(f.componentInstance.CloneConfigChange);
        const row = f.componentInstance.RelationshipRows[0];
        f.componentInstance.OnRelationshipChange(row, { Policy: 'Skip', Locked: true });
        expect(out.at(-1)).toEqual({ Enabled: true, Relationships: { 'MJ: User Roles': { Policy: 'Skip', Locked: true } } });

        f.componentInstance.CloneConfig = out.at(-1) as IEntityCloneConfiguration;
        f.componentInstance.OnRelationshipChange(f.componentInstance.RelationshipRows[0], { Policy: '', Locked: false });
        expect(out.at(-1)).toEqual({ Enabled: true });
    });

    it('keys two relationships to the same target by join field so they can differ', () => {
        const selfRef = {
            ...ENTITY,
            RelatedEntities: [
                { ID: 'r1', RelatedEntity: 'MJ: AI Agents', RelatedEntityJoinField: 'ParentID', Type: 'One To Many' },
                { ID: 'r2', RelatedEntity: 'MJ: AI Agents', RelatedEntityJoinField: 'DefaultCoAgentID', Type: 'One To Many' },
            ],
        } as unknown as EntityInfo;
        const f = render({ Entity: selfRef, CloneConfig: { Enabled: true } });
        const out = capture(f.componentInstance.CloneConfigChange);
        const [parent] = f.componentInstance.RelationshipRows;
        expect(f.componentInstance.RelationshipRows.map((r) => r.ConfigKey)).toEqual(['MJ: AI Agents.ParentID', 'MJ: AI Agents.DefaultCoAgentID']);
        f.componentInstance.OnRelationshipChange(parent, { Policy: 'Deep' });
        expect(out.at(-1)).toEqual({ Enabled: true, Relationships: { 'MJ: AI Agents.ParentID': { Policy: 'Deep' } } });
    });

    it('reads and edits an existing qualified key instead of adding a second entry', () => {
        const f = render({ CloneConfig: { Enabled: true, Relationships: { 'MJ: User Roles.UserID': { Policy: 'Skip' } } } });
        const out = capture(f.componentInstance.CloneConfigChange);
        const row = f.componentInstance.RelationshipRows[0];
        expect(row.Policy).toBe('Skip');
        f.componentInstance.OnRelationshipChange(row, { Policy: 'Deep' });
        expect(out.at(-1)).toEqual({ Enabled: true, Relationships: { 'MJ: User Roles.UserID': { Policy: 'Deep' } } });
    });

    it('applies valid Advanced JSON and reports invalid JSON without emitting', () => {
        const f = render({ CloneConfig: { Enabled: true } });
        const out = capture(f.componentInstance.CloneConfigChange);
        f.componentInstance.OnApplyJson('{ "Enabled": true, "Presets": [{ "Key": "full", "Label": "Full" }] }');
        expect(out.at(-1)).toEqual({ Enabled: true, Presets: [{ Key: 'full', Label: 'Full' }] });

        const before = out.length;
        f.componentInstance.OnApplyJson('{ not json');
        expect(out.length).toBe(before);
        expect(f.componentInstance.JsonError).toContain('Not valid JSON');
    });

    it('runs the validator and lists its findings', () => {
        const f = render({ CloneConfig: { Enabled: true, MaxDepth: -1 } });
        f.componentInstance.Validate();
        f.detectChanges();
        expect(f.componentInstance.ValidationResults?.some((r) => r.PropertyPath === 'MaxDepth')).toBe(true);
        expect(query(f, '.mj-clone-config-findings')).not.toBeNull();
    });

    it('previews a plan for one record through RecordClone.Plan', async () => {
        const planClone = vi.fn().mockResolvedValue({ Plan: { PlanVersion: 1, Hash: 'h', Roots: [], Nodes: [], Edges: [], Counts: { ByEntity: {}, Create: 0, Total: 0 }, Warnings: [], Blocked: false, EffectiveOptions: {} } });
        const f = render({ CloneConfig: { Enabled: true } }, planClone);
        await f.componentInstance.PreviewPlanFor('u-1');
        expect(planClone.mock.calls[0][0]).toEqual({
            EntityName: 'MJ: Users',
            SourceRecordKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'u-1' }] },
        });
        expect(f.componentInstance.PreviewPlan?.Hash).toBe('h');
    });

    it('keeps the latest preview when an earlier request answers late', async () => {
        let resolveFirst: (v: unknown) => void = () => undefined;
        const planClone = vi.fn()
            .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
            .mockResolvedValueOnce({ Plan: { Hash: 'second' } });
        const f = render({ CloneConfig: { Enabled: true } }, planClone);
        const first = f.componentInstance.PreviewPlanFor('a');
        await f.componentInstance.PreviewPlanFor('b');
        resolveFirst({ Plan: { Hash: 'first' } });
        await first;
        expect(f.componentInstance.PreviewPlan?.Hash).toBe('second');
        expect(f.componentInstance.IsPreviewing).toBe(false);
    });

    it('disables the controls outside edit mode', () => {
        const f = render({ EditMode: false, CloneConfig: { Enabled: true, NotCloneable: true } });
        const reason = query(f, '.mj-clone-config-input') as HTMLInputElement;
        expect(reason.disabled).toBe(true);
    });
});
