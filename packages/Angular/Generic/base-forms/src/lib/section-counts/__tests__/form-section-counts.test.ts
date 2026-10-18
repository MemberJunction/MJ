import { describe, it, expect } from 'vitest';
import { BaseEntity, EntityInfo, RunViewResult } from '@memberjunction/core';
import {
    ApplyFormCountResults,
    BuildFormCountPlan,
    FormCountPlanParams,
    ResolveEmptySectionBehavior,
    type BuildFormCountPlanInput,
    type FormSectionCountTarget,
} from '../form-section-counts';

const PERSON_ID = 'AAAAAAAA-0000-0000-0000-000000000001';
const ENTITY_ID = 'EEEEEEEE-0000-0000-0000-000000000001';
const ORDERS_ID = 'BBBBBBBB-0000-0000-0000-000000000001';
const TASKS_ID = 'BBBBBBBB-0000-0000-0000-000000000002';
const NOTES_ID = 'BBBBBBBB-0000-0000-0000-000000000003';

function person(config: object | null = null, relatedOverrides: Record<string, unknown>[] = []): EntityInfo {
    return new EntityInfo({
        ID: ENTITY_ID,
        Name: 'MJ_BizApps_Common: People',
        SchemaName: 'MJ_BizApps_Common',
        TrackRecordChanges: true,
        Configuration: config ? JSON.stringify(config) : null,
        RelatedEntities: [
            { ID: 'R1', RelatedEntity: 'MJ_BizApps_Orders: Order Headers', RelatedEntityID: ORDERS_ID, RelatedEntityJoinField: 'BillToPersonID', Type: 'One To Many', DisplayInForm: true, Sequence: 1, Configuration: JSON.stringify({ UI: { whenEmpty: 'more', join: { mode: 'any', fields: ['BillToPersonID', 'ShipToPersonID'] } } }) },
            { ID: 'R2', RelatedEntity: 'MJ_BizApps_Orders: Order Headers', RelatedEntityID: ORDERS_ID, RelatedEntityJoinField: 'ShipToPersonID', Type: 'One To Many', DisplayInForm: true, Sequence: 2 },
            { ID: 'R3', RelatedEntity: 'MJ_BizApps_Tasks: Tasks', RelatedEntityID: TASKS_ID, RelatedEntityJoinField: 'PersonID', Type: 'One To Many', DisplayInForm: true, Sequence: 3, Configuration: JSON.stringify({ UI: { whenEmpty: 'hide' } }) },
            { ID: 'R4', RelatedEntity: 'MJ_BizApps_Common: Notes', RelatedEntityID: NOTES_ID, RelatedEntityJoinField: 'PersonID', Type: 'One To Many', DisplayInForm: true, Sequence: 4, Configuration: JSON.stringify({ UI: { showCount: false } }) },
            ...relatedOverrides,
        ],
    });
}

function savedRecord(entity: EntityInfo, isSaved = true, keyCount = 1): BaseEntity {
    // Minimal BaseEntity surface the planner and EntityInfo.BuildRelationshipViewParams read.
    const fake = {
        IsSaved: isSaved,
        EntityInfo: entity,
        PrimaryKeys: Array.from({ length: keyCount }, () => ({ Name: 'ID', Value: PERSON_ID })),
        FirstPrimaryKey: { Name: 'ID', Value: PERSON_ID, NeedsQuotes: true },
        PrimaryKey: { Values: () => PERSON_ID, ToConcatenatedString: () => `ID|${PERSON_ID}` },
        Get: () => PERSON_ID,
    };
    return fake as unknown as BaseEntity;
}

function input(entity: EntityInfo, overrides: Partial<BuildFormCountPlanInput> = {}): BuildFormCountPlanInput {
    return {
        Record: savedRecord(entity),
        Entity: entity,
        IsaChildEntityIDs: [],
        HiddenSectionKeys: new Set(),
        Contributions: [],
        IncludeAttachments: true,
        ...overrides,
    };
}

describe('BuildFormCountPlan', () => {
    it('returns an empty plan for an unsaved record', () => {
        const entity = person();
        const plan = BuildFormCountPlan(input(entity, { Record: savedRecord(entity, false) }));
        expect(plan.Sections).toHaveLength(0);
        expect(plan.System).toHaveLength(0);
    });

    it('counts every visible related section by default, as count_only with the grid filter', () => {
        const plan = BuildFormCountPlan(input(person()));
        const keys = plan.Sections.map((s) => s.SectionKey);
        // R2 (Ship-To) is folded into R1's join.any OR, so it is not its own section.
        expect(keys).toEqual(['mJBizAppsOrdersOrderHeadersBillToPersonID', 'mJBizAppsTasksTasks']);
        const orders = plan.Sections[0];
        expect(orders.WhenEmpty).toBe('more');
        expect(orders.Params?.ResultType).toBe('count_only');
        expect(orders.Params?.ExtraFilter).toContain('BillToPersonID');
        expect(orders.Params?.ExtraFilter).toContain('ShipToPersonID');
    });

    it('skips a section that is showCount:false AND whenEmpty:show, but still suppresses its badge', () => {
        const plan = BuildFormCountPlan(input(person()));
        expect(plan.Sections.find((s) => s.SectionKey === 'mJBizAppsCommonNotes')).toBeUndefined();
        expect(plan.SuppressedBadgeKeys).toContain('mJBizAppsCommonNotes');
    });

    it('does not count sections a contribution claimed or chrome hid', () => {
        const plan = BuildFormCountPlan(input(person(), { HiddenSectionKeys: new Set(['mJBizAppsTasksTasks']) }));
        expect(plan.Sections.map((s) => s.SectionKey)).not.toContain('mJBizAppsTasksTasks');
    });

    it('does not count inclusion:None relationships', () => {
        const entity = person(null, [{ ID: 'R5', RelatedEntity: 'MJ: Audit Logs', RelatedEntityID: 'CCCCCCCC-0000-0000-0000-000000000001', RelatedEntityJoinField: 'RecordID', Type: 'One To Many', DisplayInForm: true, Configuration: JSON.stringify({ UI: { inclusion: 'None' } }) }]);
        expect(BuildFormCountPlan(input(entity)).Sections.map((s) => s.SectionKey)).not.toContain('mJAuditLogs');
    });

    it('applies the parent entity default (L2) when a relationship is silent', () => {
        const entity = person({ UI: { Form: { RelatedWhenEmpty: 'hide' } } }, [{ ID: 'R6', RelatedEntity: 'MJ_BizApps_Common: Addresses', RelatedEntityID: 'CCCCCCCC-0000-0000-0000-000000000002', RelatedEntityJoinField: 'PersonID', Type: 'One To Many', DisplayInForm: true }]);
        const plan = BuildFormCountPlan(input(entity));
        expect(plan.Sections.find((s) => s.SectionKey === 'mJBizAppsCommonAddresses')?.WhenEmpty).toBe('hide');
    });

    it('builds contribution targets from relatedEntity, an explicit count spec, or reports none', () => {
        const plan = BuildFormCountPlan(input(person(), {
            Contributions: [
                { SectionKey: 'tasksWidget', Metadata: { entity: 'MJ_BizApps_Common: People', slot: 'after-related', relatedEntity: 'MJ_BizApps_Tasks: Tasks', whenEmpty: 'hide' } },
                { SectionKey: 'orders', Metadata: { entity: 'MJ_BizApps_Common: People', slot: 'after-related', count: { entity: 'MJ_BizApps_Orders: Order Headers', joinFields: ['BillToPersonID', 'ShipToPersonID'] } } },
                { SectionKey: 'overview', Metadata: { entity: 'MJ_BizApps_Common: People', slot: 'before-fields', whenEmpty: 'more' } },
            ],
        }));
        const byKey = new Map(plan.Sections.map((s) => [s.SectionKey, s]));
        expect(byKey.get('tasksWidget')?.Params?.ExtraFilter).toContain('PersonID');
        expect(byKey.get('orders')?.Params?.ExtraFilter).toContain('ShipToPersonID');
        expect(byKey.get('overview')?.Params).toBeNull();
    });

    it('skips related sections for composite-key parents but keeps system badges', () => {
        const entity = person();
        const plan = BuildFormCountPlan(input(entity, { Record: savedRecord(entity, true, 2) }));
        expect(plan.Sections).toHaveLength(0);
        expect(plan.System.map((s) => s.Key)).toEqual(['tags', 'attachments', 'versions']);
    });

    it('adds tags, attachments (when allowed) and versions (when tracked) with escaped filters', () => {
        const plan = BuildFormCountPlan(input(person(), { IncludeAttachments: false }));
        expect(plan.System.map((s) => s.Key)).toEqual(['tags', 'versions']);
        expect(plan.System[0].Params).toMatchObject({ EntityName: 'MJ: Tagged Items', ResultType: 'count_only' });
        expect(plan.System[1].Params.ExtraFilter).toContain(`RecordID='ID|${PERSON_ID}'`);
    });
});

describe('FormCountPlanParams / ApplyFormCountResults', () => {
    it('round-trips counts by key and omits failed items', () => {
        const plan = BuildFormCountPlan(input(person(), {
            Contributions: [{ SectionKey: 'overview', Metadata: { entity: 'MJ_BizApps_Common: People', slot: 'before-fields', whenEmpty: 'more' } }],
        }));
        const params = FormCountPlanParams(plan);
        // 2 related sections (overview has no query) + 3 system badges
        expect(params).toHaveLength(5);
        const ok = (n: number) => ({ Success: true, TotalRowCount: n, RowCount: n, Results: [] }) as unknown as RunViewResult;
        const failed = { Success: false, ErrorMessage: 'no CanRead', Results: [] } as unknown as RunViewResult;
        const counts = ApplyFormCountResults(plan, [ok(3), failed, ok(2), ok(0), ok(7)]);
        expect([...counts.Sections]).toEqual([['mJBizAppsOrdersOrderHeadersBillToPersonID', 3]]);
        expect([...counts.System]).toEqual([['tags', 2], ['attachments', 0], ['versions', 7]]);
    });
});

describe('ResolveEmptySectionBehavior', () => {
    const targets: FormSectionCountTarget[] = [
        { SectionKey: 'orders', WhenEmpty: 'more', ShowCount: true, Params: { EntityName: 'X' } },
        { SectionKey: 'tasks', WhenEmpty: 'hide', ShowCount: true, Params: { EntityName: 'Y' } },
        { SectionKey: 'notes', WhenEmpty: 'show', ShowCount: true, Params: { EntityName: 'Z' } },
        { SectionKey: 'widget', WhenEmpty: 'hide', ShowCount: true, Params: null },
    ];
    const run = (counts: Record<string, number>, overrides: Partial<Parameters<typeof ResolveEmptySectionBehavior>[0]> = {}) =>
        ResolveEmptySectionBehavior({
            Targets: targets,
            CountOf: (k) => counts[k],
            Phase: 'loaded',
            ShowEmptyFields: false,
            StickyKeys: new Set(),
            ...overrides,
        });

    it('hides / moves only sections known to be empty', () => {
        expect([...run({ orders: 0, tasks: 0, notes: 0, widget: 0 })]).toEqual([['orders', 'more'], ['tasks', 'hide'], ['widget', 'hide']]);
        expect(run({ orders: 4, tasks: 1 }).size).toBe(0);
    });

    it('holds back prefetched hide sections while loading, but not more or self-reporting ones', () => {
        expect([...run({}, { Phase: 'loading' })]).toEqual([['tasks', 'hide']]);
    });

    it('fails open when counts failed, are absent, or show-empty-fields is on', () => {
        expect(run({ tasks: 0 }, { Phase: 'failed' }).size).toBe(0);
        expect(run({ tasks: 0 }, { Phase: 'none' }).size).toBe(0);
        expect(run({ tasks: 0 }, { ShowEmptyFields: true }).size).toBe(0);
        expect(run({}).size).toBe(0);
    });

    it('never hides or moves a sticky section', () => {
        expect(run({ orders: 0, tasks: 0 }, { StickyKeys: new Set(['tasks']) }).has('tasks')).toBe(false);
    });
});
