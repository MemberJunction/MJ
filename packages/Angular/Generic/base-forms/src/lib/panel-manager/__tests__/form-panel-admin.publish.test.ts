import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApplyContributionSpecToRow, ParseClaimedFieldNames } from '@memberjunction/core-entities';

/**
 * Publishing changes who a form or panel is for. Two things must hold, and neither is visible
 * from the drawer: the item live for that audience is retired IN THE SAME TRANSACTION, and it is
 * enqueued FIRST — the transaction applies writes in order, and the unique index on active
 * contributions would otherwise see two live rows mid-statement and refuse the write.
 */

type Scope = 'User' | 'Role' | 'Global';
interface StoredRow {
    ID: string; EntityID: string; Status: string; Scope: Scope;
    RoleID: string | null; UserID: string | null; ContributionKey?: string | null;
    Component?: string; RelatedEntityID?: string | null; RelatedJoinField?: string | null;
    ReplacesSectionKey?: string | null; ReplacesFieldNames?: string | null; InSectionKey?: string | null;
    SectionPosition?: 'start' | 'end' | null; Inclusion?: 'Primary' | 'More' | 'None' | null;
    ChromeGroup?: 'details' | 'more' | null; Configuration?: string | null;
}

const ME = 'user-me';
let contributions: StoredRow[] = [];
let overrides: StoredRow[] = [];
/** Every save, in the order it was enqueued, with the columns it carried. */
let saves: Array<{ ID: string; Status: string; Scope: Scope; RoleID: string | null; UserID: string | null }> = [];
let submit = vi.fn(async () => true);
/** The row the service loaded last, to read what it wrote. */
let lastRow: FakeRow | null = null;

/** Stands in for a loaded entity row: holds its columns and records its save. */
class FakeRow {
    public ID = ''; public Status = ''; public Scope: Scope = 'User';
    public RoleID: string | null = null; public UserID: string | null = null;
    public Component = 'Cohort';
    public Slot = 'after-fields'; public SortKey = 5; public Presentation = 'panel';
    public Title: string | null = null; public Icon: string | null = null;
    public ContributionKey: string | null = null;
    public RelatedEntityID: string | null = null; public RelatedJoinField: string | null = null;
    public ReplacesSectionKey: string | null = null; public ReplacesSectionKeys: string | null = null;
    public ReplacesFieldNames: string | null = null; public InSectionKey: string | null = null;
    public SectionPosition: string | null = null;
    public Inclusion: string | null = null; public ChromeGroup: string | null = null;
    public Configuration: string | null = null;
    public TransactionGroup: unknown = null;
    public LatestResult = { CompleteMessage: '' };
    public constructor(private readonly source: () => StoredRow[]) {}
    public async Load(id: string): Promise<boolean> {
        const found = this.source().find((r) => r.ID === id);
        if (!found) return false;
        Object.assign(this, found);
        return true;
    }
    public async Save(): Promise<boolean> {
        saves.push({ ID: this.ID, Status: this.Status, Scope: this.Scope, RoleID: this.RoleID, UserID: this.UserID });
        return true;
    }
}

const ENROLLMENTS = { ID: 'ENT-ENROLL', Name: 'MoreCheese: Course Enrollments' };

const provider = {
    CurrentUser: { ID: ME },
    EntityByName: (name: string) => (name.trim().toLowerCase() === ENROLLMENTS.Name.toLowerCase() ? ENROLLMENTS : undefined),
    CreateTransactionGroup: async () => ({ Submit: submit }),
    GetEntityObject: async (name: string) => {
        lastRow = new FakeRow(() => (name === 'MJ: Entity Form Overrides' ? overrides : contributions));
        return lastRow;
    },
};

vi.mock('@memberjunction/core-entities', async () => {
    // The row mapper is pure, so the real one writes the columns under test.
    const mapper = await vi.importActual<{
        ApplyContributionSpecToRow: typeof ApplyContributionSpecToRow;
        ParseClaimedFieldNames: typeof ParseClaimedFieldNames;
    }>('@memberjunction/core-entities/dist/custom/FormScope/FormContributionRow.js');
    return {
        InteractiveFormsEngine: { get Instance() { return { Contributions: contributions, Overrides: overrides }; } },
        UserCanManageFormDefaults: vi.fn(() => true),
        ApplyContributionSpecToRow: mapper.ApplyContributionSpecToRow,
        ParseClaimedFieldNames: mapper.ParseClaimedFieldNames,
    };
});
vi.mock('@memberjunction/core', () => ({
    LogError: () => undefined,
    Metadata: class { public static get Provider() { return provider; } },
}));
vi.mock('@memberjunction/global', () => ({
    UUIDsEqual: (a: string, b: string) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase(),
    SafeJSONParse: (s: string) => { try { return JSON.parse(s); } catch { return null; } },
}));
vi.mock('../../panel-slot/collect-form-contribution-registrations', () => ({
    InvalidateFormContributionRegistrationCache: () => undefined,
}));
const setHidden = vi.fn();
vi.mock('../../panel-slot/panel-hides', () => ({ SetPanelHidden: (...args: unknown[]) => setHidden(...args) }));

import { FormPanelAdminService } from '../form-panel-admin.service';

function panel(over: Partial<StoredRow> & { ID: string }): StoredRow {
    return { EntityID: 'E1', Status: 'Active', Scope: 'Global', RoleID: null, UserID: null, ContributionKey: 'panel:Cohort', ...over };
}

beforeEach(() => {
    contributions = [];
    overrides = [];
    saves = [];
    submit = vi.fn(async () => true);
    setHidden.mockClear();
});

describe('FormPanelAdminService.PublishContribution', () => {
    it('re-aims the panel at the audience', async () => {
        contributions = [panel({ ID: 'mine', Scope: 'User', UserID: ME })];
        const result = await new FormPanelAdminService().PublishContribution('mine', { Scope: 'Global', RoleID: null });
        expect(result.Success).toBe(true);
        expect(saves).toEqual([{ ID: 'mine', Status: 'Active', Scope: 'Global', RoleID: null, UserID: null }]);
    });

    it('retires the panel live for that audience first, then publishes, in one transaction', async () => {
        contributions = [panel({ ID: 'mine', Scope: 'User', UserID: ME }), panel({ ID: 'old-global' })];
        await new FormPanelAdminService().PublishContribution('mine', { Scope: 'Global', RoleID: null });
        expect(saves.map((s) => `${s.ID}:${s.Status}`)).toEqual(['old-global:Inactive', 'mine:Active']);
        expect(submit).toHaveBeenCalledTimes(1);
    });

    it('aims a role audience at the role, owned by no one', async () => {
        contributions = [panel({ ID: 'mine', Scope: 'User', UserID: ME })];
        await new FormPanelAdminService().PublishContribution('mine', { Scope: 'Role', RoleID: 'role-sales' });
        expect(saves[0]).toMatchObject({ Scope: 'Role', RoleID: 'role-sales', UserID: null });
    });

    it('unpublishes back to whoever unpublished it', async () => {
        contributions = [panel({ ID: 'shared' })];
        await new FormPanelAdminService().PublishContribution('shared', { Scope: 'User', RoleID: null });
        expect(saves[0]).toMatchObject({ Scope: 'User', RoleID: null, UserID: ME });
    });

    it('reports failure when the transaction does not commit', async () => {
        contributions = [panel({ ID: 'mine', Scope: 'User', UserID: ME })];
        submit = vi.fn(async () => false);
        const result = await new FormPanelAdminService().PublishContribution('mine', { Scope: 'Global', RoleID: null });
        expect(result.Success).toBe(false);
    });

    it('reports a panel that has gone', async () => {
        const result = await new FormPanelAdminService().PublishContribution('gone', { Scope: 'Global', RoleID: null });
        expect(result.Success).toBe(false);
        expect(saves).toEqual([]);
    });
});

describe('FormPanelAdminService.PublishOverride', () => {
    it('sets aside whichever form was live for that audience', async () => {
        overrides = [
            panel({ ID: 'finance', Scope: 'User', UserID: ME, ContributionKey: null }),
            panel({ ID: 'ops', ContributionKey: null }),
        ];
        await new FormPanelAdminService().PublishOverride('finance', { Scope: 'Global', RoleID: null });
        expect(saves.map((s) => `${s.ID}:${s.Status}:${s.Scope}`)).toEqual(['ops:Inactive:Global', 'finance:Active:Global']);
    });
});

describe('FormPanelAdminService hide and show', () => {
    it('hides a panel for this user', () => {
        new FormPanelAdminService().Hide('MoreCheese: Courses', 'panel:Cohort');
        expect(setHidden).toHaveBeenCalledWith('MoreCheese: Courses', 'panel:Cohort', true);
    });

    it('brings it back', () => {
        new FormPanelAdminService().Show('MoreCheese: Courses', 'panel:Cohort');
        expect(setHidden).toHaveBeenCalledWith('MoreCheese: Courses', 'panel:Cohort', false);
    });
});

describe('FormPanelAdminService.CanPublish', () => {
    it('asks the shared rule, the same one the server enforces', () => {
        expect(new FormPanelAdminService().CanPublish()).toBe(true);
    });
});

describe('FormPanelAdminService.SetPlacement — order in its position', () => {
    it('writes the order the dialog chose', async () => {
        contributions = [panel({ ID: 'mine', Scope: 'User', UserID: ME })];
        await new FormPanelAdminService().SetPlacement('mine', { slot: 'after-fields', presentation: 'panel', title: 'P', sortKey: 15 }, true);
        expect(lastRow?.SortKey).toBe(15);
    });

    it('keeps the order it had when the dialog left it alone', async () => {
        contributions = [panel({ ID: 'mine', Scope: 'User', UserID: ME })];
        await new FormPanelAdminService().SetPlacement('mine', { slot: 'after-fields', presentation: 'panel', title: 'P' }, true);
        expect(lastRow?.SortKey).toBe(5);
    });
});

describe('FormPanelAdminService.SetPlacement — section claims', () => {
    beforeEach(() => { contributions = [panel({ ID: 'mine', Scope: 'User', UserID: ME })]; });

    it('writes several replaced sections as a list, and one as the single key', async () => {
        await new FormPanelAdminService().SetPlacement('mine', { slot: 'after-fields', presentation: 'panel', title: 'P', replacesSectionKeys: ['a', 'b'] }, true);
        expect(lastRow).toMatchObject({ ReplacesSectionKey: null, ReplacesSectionKeys: '["a","b"]' });
        await new FormPanelAdminService().SetPlacement('mine', { slot: 'after-fields', presentation: 'panel', title: 'P', replacesSectionKeys: ['a'] }, true);
        expect(lastRow).toMatchObject({ ReplacesSectionKey: 'a', ReplacesSectionKeys: null });
    });

    it('writes a place inside a section with its position', async () => {
        await new FormPanelAdminService().SetPlacement('mine', { slot: 'after-fields', presentation: 'panel', title: 'P', inSectionKey: 'profile', sectionPosition: 'end' }, true);
        expect(lastRow).toMatchObject({ InSectionKey: 'profile', SectionPosition: 'end' });
    });

    it('drops a position that has no section to apply to', async () => {
        await new FormPanelAdminService().SetPlacement('mine', { slot: 'after-fields', presentation: 'panel', title: 'P', sectionPosition: 'end' }, true);
        expect(lastRow?.SectionPosition).toBeNull();
    });
});

/**
 * A placement change rewrites every claim column through the shared row mapper, so the row
 * keeps nothing of the claim it had and satisfies the table's CHECK constraints.
 */
describe('FormPanelAdminService.SetPlacement — claims', () => {
    const P = { slot: 'after-fields' as const, presentation: 'panel' as const, title: 'P' };
    const GRID_KEY = 'related:MoreCheese: Course Enrollments:CourseID';

    it('clears a grid claim when the panel stands in for fields instead', async () => {
        contributions = [panel({
            ID: 'mine', Scope: 'User', UserID: ME, ContributionKey: GRID_KEY,
            RelatedEntityID: 'ENT-ENROLL', RelatedJoinField: 'CourseID',
        })];
        const result = await new FormPanelAdminService().SetPlacement('mine', { ...P, replacesFieldNames: ['Name'], sectionPosition: 'end' }, true);
        expect(result.Success).toBe(true);
        expect(lastRow).toMatchObject({
            RelatedEntityID: null, RelatedJoinField: null,
            ReplacesFieldNames: '["Name"]', SectionPosition: 'end', ContributionKey: 'panel:Cohort',
        });
    });

    it('writes the grid and its key when the panel takes over a grid', async () => {
        contributions = [panel({ ID: 'mine', Scope: 'User', UserID: ME, ContributionKey: 'panel:Cohort', ReplacesFieldNames: '["Name"]' })];
        await new FormPanelAdminService().SetPlacement('mine', { ...P, relatedEntity: 'MoreCheese: Course Enrollments', relatedJoinField: '[CourseID]' }, true);
        expect(lastRow).toMatchObject({
            RelatedEntityID: 'ENT-ENROLL', RelatedJoinField: '[CourseID]',
            ReplacesFieldNames: null, ContributionKey: GRID_KEY,
        });
    });

    it('refuses a grid on an entity that is not registered, and saves nothing', async () => {
        contributions = [panel({ ID: 'mine', Scope: 'User', UserID: ME })];
        const result = await new FormPanelAdminService().SetPlacement('mine', { ...P, relatedEntity: 'Nope' }, true);
        expect(result.Success).toBe(false);
        expect(saves).toEqual([]);
    });

    it('writes the key of the panel it now replaces', async () => {
        contributions = [panel({ ID: 'mine', Scope: 'User', UserID: ME })];
        await new FormPanelAdminService().SetPlacement('mine', { ...P, contributionKey: 'skip:health' }, true);
        expect(lastRow?.ContributionKey).toBe('skip:health');
    });

    it('clears every claim when the panel replaces nothing', async () => {
        contributions = [panel({
            ID: 'mine', Scope: 'User', UserID: ME, ContributionKey: GRID_KEY,
            RelatedEntityID: 'ENT-ENROLL', RelatedJoinField: 'CourseID',
        })];
        await new FormPanelAdminService().SetPlacement('mine', P, true);
        expect(lastRow).toMatchObject({
            RelatedEntityID: null, RelatedJoinField: null, ReplacesSectionKey: null, ReplacesSectionKeys: null,
            ReplacesFieldNames: null, InSectionKey: null, SectionPosition: null, ContributionKey: 'panel:Cohort',
        });
    });

    it('gives a bare strip no rail metadata', async () => {
        contributions = [panel({ ID: 'mine', Scope: 'User', UserID: ME, Inclusion: 'Primary', ChromeGroup: 'details' })];
        await new FormPanelAdminService().SetPlacement('mine', { ...P, presentation: 'bare' }, true);
        expect(lastRow).toMatchObject({ Presentation: 'bare', Inclusion: null, ChromeGroup: null });
    });

    it('keeps what the dialog does not edit on a panel', async () => {
        contributions = [panel({ ID: 'mine', Scope: 'User', UserID: ME, Inclusion: 'Primary', Configuration: '{"window":30}' })];
        await new FormPanelAdminService().SetPlacement('mine', P, true);
        expect(lastRow).toMatchObject({ Inclusion: 'Primary', Configuration: '{"window":30}' });
    });

    it('stores a draft as Pending', async () => {
        contributions = [panel({ ID: 'mine', Scope: 'User', UserID: ME })];
        await new FormPanelAdminService().SetPlacement('mine', P, false);
        expect(lastRow?.Status).toBe('Pending');
    });
});
