import { describe, it, expect, vi, beforeEach } from 'vitest';

const engine = {
    Loaded: true,
    IsPermissionConstrained: false,
    Config: vi.fn(async () => {}),
    subscribers: [] as Array<() => void>,
    rows: [] as unknown[],
    get Contributions$() { return { subscribe: (fn: () => void) => { engine.subscribers.push(fn); return { unsubscribe() {} }; } }; },
    GetApplicableContributions: vi.fn(() => engine.rows),
};
let classRegs: unknown[] = [];

vi.mock('@memberjunction/core-entities', () => ({ InteractiveFormsEngine: { get Instance() { return engine; } } }));
const logError = vi.fn();
vi.mock('@memberjunction/core', () => ({ LogError: (...args: unknown[]) => logError(...args) }));
const byMetadataScan = vi.fn(() => classRegs);
vi.mock('@memberjunction/global', () => ({
    MJGlobal: { Instance: { ClassFactory: {
        GetAllRegistrationsByMetadata: () => byMetadataScan(),
        GetAllRegistrations: () => classRegs,
    } } },
    SafeJSONParse: (s: string) => { try { return JSON.parse(s); } catch { return null; } },
    UUIDsEqual: (a: string, b: string) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase(),
}));
vi.mock('../base-form-panel', () => ({ BaseFormPanel: class BaseFormPanel {} }));

import {
    CollectFormContributionRegistrations,
    InvalidateFormContributionRegistrationCache,
    MetadataContributionToRegistration,
} from '../collect-form-contribution-registrations';
import type { EntityInfo, IMetadataProvider } from '@memberjunction/core';

const entity = { ID: 'ent-1', Name: 'MJ_BizApps_Common: People' } as unknown as EntityInfo;
function makeProvider(opts: { userID: string }): IMetadataProvider {
    // A distinct object identity per call — the memo keys on the provider instance.
    return { CurrentUser: { ID: opts.userID, UserRoles: [{ RoleID: 'role-1' }] } } as unknown as IMetadataProvider;
}
const provider = makeProvider({ userID: 'user-1' });

function row(over: Record<string, unknown>) {
    return {
        ID: 'row-1', Entity: 'MJ_BizApps_Common: People', ComponentID: 'comp-1', Name: 'LTV strip', Title: null, Icon: null,
        Slot: 'before-fields', SortKey: 90, ContributionKey: 'skip:person-ltv', RelatedEntity: null, RelatedJoinField: null,
        ReplacesSectionKey: null, Inclusion: null, ChromeGroup: null, Presentation: 'bare', Precedence: 0,
        Configuration: '{"metric":"ltv"}', ...over,
    };
}

beforeEach(() => {
    InvalidateFormContributionRegistrationCache();
    engine.rows = [];
    // NOT cleared: the collector subscribes to Contributions$ once per module load, so a
    // reset here would leave later tests with an emission nobody listens to.
    engine.Loaded = true;
    engine.IsPermissionConstrained = false;
    logError.mockClear();
    byMetadataScan.mockClear();
    engine.Config.mockClear();
    engine.GetApplicableContributions.mockClear();
    classRegs = [{ Priority: 0, Metadata: { entity: 'MJ_BizApps_Common: People', slot: 'after-fields' }, SubClass: class {} }];
});

describe('MetadataContributionToRegistration', () => {
    it('maps a row onto the compiled metadata shape with Source metadata', () => {
        const reg = MetadataContributionToRegistration(row({}) as never);
        expect(reg).toMatchObject({
            Priority: 0, Source: 'metadata', ComponentID: 'comp-1', RowID: 'row-1', Title: 'LTV strip',
            Presentation: 'bare', Configuration: { metric: 'ltv' },
            Metadata: { entity: 'MJ_BizApps_Common: People', slot: 'before-fields', sortKey: 90, contributionKey: 'skip:person-ltv', presentation: 'bare' },
        });
        expect(reg.Metadata.relatedEntity).toBeUndefined();
    });

    it('carries related claims, replace keys, inclusion and chrome group', () => {
        const reg = MetadataContributionToRegistration(row({
            RelatedEntity: 'MJ_BizApps_Orders: Event Order Lines', RelatedJoinField: 'PersonID',
            ReplacesSectionKey: 'details', Inclusion: 'More', ChromeGroup: 'more', Configuration: null,
        }) as never);
        expect(reg.Metadata).toMatchObject({
            relatedEntity: 'MJ_BizApps_Orders: Event Order Lines', relatedJoinField: 'PersonID',
            replacesSectionKey: 'details', inclusion: 'More', chromeGroup: 'more',
        });
        expect(reg.Configuration).toEqual({});
    });
});

describe('CollectFormContributionRegistrations', () => {
    it('returns class registrations first, then applicable rows', () => {
        engine.rows = [row({})];
        const merged = CollectFormContributionRegistrations(entity, provider);
        expect(merged.map(r => r.Source ?? 'class')).toEqual(['class', 'metadata']);
        expect(engine.GetApplicableContributions).toHaveBeenCalledWith('ent-1', 'user-1', ['role-1']);
    });

    it('memoizes per entity + user until the engine emits', () => {
        engine.rows = [row({})];
        CollectFormContributionRegistrations(entity, provider);
        CollectFormContributionRegistrations(entity, provider);
        expect(engine.GetApplicableContributions).toHaveBeenCalledTimes(1);
        engine.subscribers.forEach(fn => fn());
        CollectFormContributionRegistrations(entity, provider);
        expect(engine.GetApplicableContributions).toHaveBeenCalledTimes(2);
    });

    it('picks up a registration from a lazily-loaded module once the probe interval elapses', () => {
        // The registration count is the memo's invalidation signal, but probing it means
        // filtering every registration in the process — unaffordable on a path that runs per
        // change-detection pass. So the probe is throttled, and a late module's panels appear
        // within one interval instead of instantly.
        vi.useFakeTimers();
        try {
            CollectFormContributionRegistrations(entity, provider);
            classRegs = [...classRegs, { Priority: 0, Metadata: { entity: '*', slot: 'after-fields' }, SubClass: class {} }];
            expect(CollectFormContributionRegistrations(entity, provider)).toHaveLength(1);
            vi.advanceTimersByTime(1001);
            expect(CollectFormContributionRegistrations(entity, provider)).toHaveLength(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('kicks Config and returns class registrations when the engine is not loaded', () => {
        engine.Loaded = false;
        engine.rows = [row({})];
        const merged = CollectFormContributionRegistrations(entity, provider);
        expect(merged.every(r => (r.Source ?? 'class') === 'class')).toBe(true);
        expect(engine.Config).toHaveBeenCalledTimes(1);
    });

    it('returns class registrations only when entity or provider is missing', () => {
        expect(CollectFormContributionRegistrations(null, provider)).toHaveLength(1);
        expect(CollectFormContributionRegistrations(entity, null)).toHaveLength(1);
    });

    it('does not serve one provider the memoized list of another', () => {
        engine.rows = [row({})];
        CollectFormContributionRegistrations(entity, provider);
        const otherProvider = makeProvider({ userID: 'user-1' });   // same entity name, same user
        CollectFormContributionRegistrations(entity, otherProvider);
        expect(engine.GetApplicableContributions).toHaveBeenCalledTimes(2);
    });

    it('reports no rows, and does not log an error, when the engine is permission-constrained', () => {
        engine.IsPermissionConstrained = true;
        engine.rows = [row({})];
        const merged = CollectFormContributionRegistrations(entity, provider);
        expect(merged.every(r => (r.Source ?? 'class') === 'class')).toBe(true);
        expect(logError).not.toHaveBeenCalled();
    });
});

describe('CollectFormContributionRegistrations — hot path cost', () => {
    /**
     * `BaseFormComponent.formContext` calls this on every change-detection pass, so a cache
     * hit has to be cheap. The ClassFactory scan filters every registration in the process
     * and runs a predicate on each — paying it per pass is the cost the memo exists to remove.
     */
    it('does not rescan the ClassFactory when the memo hits', () => {
        engine.rows = [row({})];
        CollectFormContributionRegistrations(entity, provider);
        expect(byMetadataScan).toHaveBeenCalledTimes(1);
        CollectFormContributionRegistrations(entity, provider);
        CollectFormContributionRegistrations(entity, provider);
        expect(byMetadataScan).toHaveBeenCalledTimes(1);
    });

    it('still rescans once the memo is invalidated', () => {
        engine.rows = [row({})];
        CollectFormContributionRegistrations(entity, provider);
        engine.subscribers.forEach(fn => fn());
        CollectFormContributionRegistrations(entity, provider);
        expect(byMetadataScan).toHaveBeenCalledTimes(2);
    });
});
