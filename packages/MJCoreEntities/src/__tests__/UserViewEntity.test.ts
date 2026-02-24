import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks must be defined before importing the module under test
// ============================================================================

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => () => {},
    MJGlobal: { Instance: { GetGlobalObjectStore: () => ({}) } }
}));

vi.mock('@memberjunction/core', () => {
    class MockBaseInfo {
        copyInitData(data: Record<string, unknown>) {
            if (data) Object.assign(this, data);
        }
    }
    return {
        BaseEntity: class {},
        BaseInfo: MockBaseInfo,
        BaseEngine: class {
            static get Instance() { return new this(); }
            Config() { return Promise.resolve(); }
        },
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
        IStartupSink: class {},
        RegisterForStartup: () => () => {},
        CompositeKey: class {},
        Metadata: class {
            CurrentUser = { ID: 'user-1', Type: 'User' };
            Entities: unknown[] = [];
        },
        EntityInfo: class {},
        EntityFieldInfo: class {},
        EntityFieldTSType: {
            Date: 'Date',
            Boolean: 'Boolean',
            String: 'String',
            Number: 'Number',
        },
        EntityPermissionType: {
            Create: 'Create',
            Update: 'Update',
            Delete: 'Delete',
        },
        RunView: class {},
        UserInfo: class {},
        EntitySaveOptions: class {},
        LogError: vi.fn(),
        BaseEntityResult: class {
            Success = false;
            Message = '';
            StartedAt: Date | undefined;
            EndedAt: Date | undefined;
        },
        ValidationResult: class {
            Success = true;
            Errors: unknown[] = [];
        },
    };
});

vi.mock('../generated/entity_subclasses', () => ({
    MJUserViewEntity: class MockUserViewEntity {
        FilterState: string | null = null;
        GridState: string | null = null;
        SortState: string | null = null;
        DisplayState: string | null = null;
        EntityID: string | null = null;
        UserID: string | null = null;
        ID: string | null = null;
        Name: string = '';
        WhereClause: string = '';
        IsShared = false;
        IsDefault = false;
        Description = '';
        CustomFilterState = false;
        CustomWhereClause = false;
        SmartFilterEnabled = false;
        SmartFilterPrompt: string | null = null;
        SmartFilterWhereClause: string | null = null;
        SmartFilterExplanation: string | null = null;
        IsSaved = false;
        ContextCurrentUser: { ID: string; Type: string } | null = null;
        ResultHistory: unknown[] = [];
        Fields: unknown[] = [];
        Set(_name: string, _value: unknown) { /* no-op */ }
        CheckPermissions() { return true; }
    },
}));

vi.mock('../custom/ResourcePermissions/ResourcePermissionEngine', () => ({
    ResourcePermissionEngine: {
        Instance: {
            ResourceTypes: [],
            GetUserResourcePermissionLevel: vi.fn(),
        },
    },
}));

// ============================================================================
// Imports - must come after vi.mock() calls
// ============================================================================

import {
    MJUserViewEntityExtended,
    ViewFilterInfo,
    ViewFilterLogicInfo,
    ViewSortInfo,
    ViewSortDirectionInfo,
    ViewColumnInfo,
    ViewGridState,
    DEFAULT_AGGREGATE_DISPLAY,
} from '../custom/MJUserViewEntityExtended';

import type {
    ViewDisplayState,
    ViewDisplayMode,
    ViewTimelineState,
} from '../custom/UserViewEntity';

// ============================================================================
// Helper: create a MJUserViewEntityExtended with optional initial property values
// ============================================================================

function createView(overrides: Record<string, unknown> = {}): MJUserViewEntityExtended {
    const view = new MJUserViewEntityExtended();
    // Apply overrides directly to the instance
    for (const [key, value] of Object.entries(overrides)) {
        (view as Record<string, unknown>)[key] = value;
    }
    return view;
}

// Helper to build a mock EntityInfo with typed fields
interface MockField {
    Name: string;
    NeedsQuotes: boolean;
    TSType: string;
    DefaultInView?: boolean;
    Sequence?: number;
    DisplayName?: string;
    ID?: string;
    DefaultColumnWidth?: number;
}

function makeMockEntityInfo(fields: MockField[]): Record<string, unknown> {
    return {
        Name: 'MJTestEntity',
        ID: 'entity-1',
        Fields: fields,
    };
}

// ============================================================================
// Tests
// ============================================================================

describe('ViewFilterInfo', () => {
    it('should construct with null initData', () => {
        const info = new ViewFilterInfo(null);
        expect(info.logicOperator).toBeNull();
        expect(info.field).toBeNull();
        expect(info.operator).toBeNull();
        expect(info.value).toBeNull();
        expect(info.filters).toEqual([]);
    });

    it('should construct with empty object', () => {
        const info = new ViewFilterInfo({});
        expect(info.logicOperator).toBeNull();
        expect(info.filters).toEqual([]);
    });

    it('should map logic "and" to ViewFilterLogicInfo.And', () => {
        const info = new ViewFilterInfo({ logic: 'and', filters: [] });
        expect(info.logicOperator).toBe(ViewFilterLogicInfo.And);
        expect(info.logicOperator).toBe('And');
    });

    it('should map logic "or" to ViewFilterLogicInfo.Or', () => {
        const info = new ViewFilterInfo({ logic: 'or', filters: [] });
        expect(info.logicOperator).toBe(ViewFilterLogicInfo.Or);
        expect(info.logicOperator).toBe('Or');
    });

    it('should handle case-insensitive logic with whitespace', () => {
        const info = new ViewFilterInfo({ logic: '  AND  ', filters: [] });
        expect(info.logicOperator).toBe('And');
    });

    it('should treat non-"and" logic as "Or"', () => {
        const info = new ViewFilterInfo({ logic: 'or', filters: [] });
        expect(info.logicOperator).toBe('Or');
    });

    it('should copy field, operator, value from initData', () => {
        const info = new ViewFilterInfo({
            field: 'Name',
            operator: 'eq',
            value: 'Test',
        });
        expect(info.field).toBe('Name');
        expect(info.operator).toBe('eq');
        expect(info.value).toBe('Test');
    });

    it('should recursively construct nested filters', () => {
        const initData = {
            logic: 'and',
            filters: [
                { field: 'Name', operator: 'eq', value: 'A' },
                {
                    logic: 'or',
                    filters: [
                        { field: 'Age', operator: 'gt', value: 20 },
                        { field: 'Age', operator: 'lt', value: 60 },
                    ],
                },
            ],
        };
        const info = new ViewFilterInfo(initData);
        expect(info.logicOperator).toBe('And');
        expect(info.filters).toHaveLength(2);

        // First filter is a simple field filter
        const first = info.filters[0];
        expect(first.field).toBe('Name');
        expect(first.operator).toBe('eq');
        expect(first.value).toBe('A');

        // Second filter is a nested group
        const second = info.filters[1];
        expect(second.logicOperator).toBe('Or');
        expect(second.filters).toHaveLength(2);
        expect(second.filters[0].field).toBe('Age');
        expect(second.filters[0].operator).toBe('gt');
        expect(second.filters[1].field).toBe('Age');
        expect(second.filters[1].operator).toBe('lt');
    });

    it('should handle deeply nested filter groups', () => {
        const initData = {
            logic: 'and',
            filters: [
                {
                    logic: 'or',
                    filters: [
                        {
                            logic: 'and',
                            filters: [
                                { field: 'X', operator: 'eq', value: '1' },
                            ],
                        },
                    ],
                },
            ],
        };
        const info = new ViewFilterInfo(initData);
        expect(info.filters[0].filters[0].filters[0].field).toBe('X');
    });
});

describe('ViewSortInfo', () => {
    it('should construct with null initData', () => {
        const info = new ViewSortInfo(null);
        expect(info.field).toBeNull();
        expect(info.direction).toBeNull();
    });

    it('should copy field from initData via copyInitData', () => {
        const info = new ViewSortInfo({ field: 'CreatedAt' });
        expect(info.field).toBe('CreatedAt');
    });

    it('should map dir "asc" to ViewSortDirectionInfo.Asc', () => {
        const info = new ViewSortInfo({ field: 'Name', dir: 'asc' });
        expect(info.direction).toBe(ViewSortDirectionInfo.Asc);
        expect(info.direction).toBe('Asc');
    });

    it('should map dir "desc" to ViewSortDirectionInfo.Desc', () => {
        const info = new ViewSortInfo({ field: 'Name', dir: 'desc' });
        expect(info.direction).toBe(ViewSortDirectionInfo.Desc);
        expect(info.direction).toBe('Desc');
    });

    it('should handle case-insensitive dir with whitespace', () => {
        const info = new ViewSortInfo({ field: 'Name', dir: '  ASC  ' });
        expect(info.direction).toBe('Asc');
    });

    it('should not set direction if dir is not a string', () => {
        // If dir is a number (legacy), the constructor condition (typeof initData.dir == 'string') is false
        const info = new ViewSortInfo({ field: 'Name', dir: 1 });
        // direction remains whatever copyInitData copied, which would be null since 'direction' is not in initData
        // but dir is not mapped to direction, so direction remains null
        expect(info.direction).toBeNull();
    });

    it('should not set direction if dir is absent', () => {
        const info = new ViewSortInfo({ field: 'Name' });
        expect(info.direction).toBeNull();
    });
});

describe('ViewColumnInfo', () => {
    it('should construct with null initData', () => {
        const col = new ViewColumnInfo(null);
        expect(col.ID).toBeNull();
        expect(col.Name).toBeNull();
        expect(col.hidden).toBeNull();
        expect(col.EntityField).toBeNull();
    });

    it('should copy init data properties', () => {
        const col = new ViewColumnInfo({
            ID: 'field-1',
            Name: 'CompanyName',
            DisplayName: 'Company Name',
            hidden: false,
            width: 200,
            orderIndex: 3,
        });
        expect(col.ID).toBe('field-1');
        expect(col.Name).toBe('CompanyName');
        expect(col.DisplayName).toBe('Company Name');
        expect(col.hidden).toBe(false);
        expect(col.width).toBe(200);
        expect(col.orderIndex).toBe(3);
    });

    it('should copy AG Grid-specific properties', () => {
        const col = new ViewColumnInfo({
            Name: 'Col1',
            pinned: 'left',
            flex: 2,
            minWidth: 100,
            maxWidth: 500,
        });
        expect(col.pinned).toBe('left');
        expect(col.flex).toBe(2);
        expect(col.minWidth).toBe(100);
        expect(col.maxWidth).toBe(500);
    });

    it('should copy EntityField reference', () => {
        const mockField = { Name: 'TestField', ID: 'f-1' };
        const col = new ViewColumnInfo({ Name: 'TestField', EntityField: mockField });
        expect(col.EntityField).toBe(mockField);
    });
});

describe('ViewFilterLogicInfo', () => {
    it('should have And and Or constants', () => {
        expect(ViewFilterLogicInfo.And).toBe('And');
        expect(ViewFilterLogicInfo.Or).toBe('Or');
    });
});

describe('ViewSortDirectionInfo', () => {
    it('should have Asc and Desc constants', () => {
        expect(ViewSortDirectionInfo.Asc).toBe('Asc');
        expect(ViewSortDirectionInfo.Desc).toBe('Desc');
    });
});

describe('ViewGridState', () => {
    it('should be constructable with default undefined properties', () => {
        const gs = new ViewGridState();
        expect(gs.sortSettings).toBeUndefined();
        expect(gs.columnSettings).toBeUndefined();
        expect(gs.filter).toBeUndefined();
        expect(gs.aggregates).toBeUndefined();
    });
});

describe('DEFAULT_AGGREGATE_DISPLAY', () => {
    it('should have expected default values', () => {
        expect(DEFAULT_AGGREGATE_DISPLAY.showColumnAggregates).toBe(true);
        expect(DEFAULT_AGGREGATE_DISPLAY.columnPosition).toBe('bottom');
        expect(DEFAULT_AGGREGATE_DISPLAY.showCardAggregates).toBe(true);
        expect(DEFAULT_AGGREGATE_DISPLAY.cardPosition).toBe('right');
        expect(DEFAULT_AGGREGATE_DISPLAY.cardPanelWidth).toBe(280);
        expect(DEFAULT_AGGREGATE_DISPLAY.cardLayout).toBe('vertical');
        expect(DEFAULT_AGGREGATE_DISPLAY.cardGridColumns).toBe(2);
        expect(DEFAULT_AGGREGATE_DISPLAY.cardPanelTitle).toBe('Summary');
        expect(DEFAULT_AGGREGATE_DISPLAY.cardPanelCollapsible).toBe(true);
        expect(DEFAULT_AGGREGATE_DISPLAY.cardPanelStartCollapsed).toBe(false);
    });
});

// ============================================================================
// MJUserViewEntityExtended
// ============================================================================

describe('MJUserViewEntityExtended', () => {
    let view: MJUserViewEntityExtended;

    beforeEach(() => {
        view = createView();
    });

    // ----------------------------------------------------------------
    // Filter getter
    // ----------------------------------------------------------------
    describe('Filter', () => {
        it('should return empty array when FilterState is null', () => {
            view.FilterState = null;
            expect(view.Filter).toEqual([]);
        });

        it('should return empty array when FilterState is empty string', () => {
            // empty string is falsy
            view.FilterState = '';
            expect(view.Filter).toEqual([]);
        });

        it('should return a single ViewFilterInfo wrapping the parsed JSON', () => {
            view.FilterState = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'Name', operator: 'eq', value: 'Test' }],
            });
            const result = view.Filter;
            expect(result).toHaveLength(1);
            expect(result[0]).toBeInstanceOf(ViewFilterInfo);
            expect(result[0].logicOperator).toBe('And');
            expect(result[0].filters).toHaveLength(1);
            expect(result[0].filters[0].field).toBe('Name');
        });

        it('should return a filter with "or" logic', () => {
            view.FilterState = JSON.stringify({
                logic: 'or',
                filters: [
                    { field: 'A', operator: 'eq', value: '1' },
                    { field: 'B', operator: 'eq', value: '2' },
                ],
            });
            const result = view.Filter;
            expect(result[0].logicOperator).toBe('Or');
            expect(result[0].filters).toHaveLength(2);
        });
    });

    // ----------------------------------------------------------------
    // ViewSortInfo getter
    // ----------------------------------------------------------------
    describe('ViewSortInfo', () => {
        it('should return empty array when SortState is null', () => {
            view.SortState = null;
            expect(view.ViewSortInfo).toEqual([]);
        });

        it('should return empty array when SortState is empty string', () => {
            view.SortState = '';
            expect(view.ViewSortInfo).toEqual([]);
        });

        it('should return empty array when SortState is an empty JSON array', () => {
            view.SortState = JSON.stringify([]);
            expect(view.ViewSortInfo).toEqual([]);
        });

        it('should parse sort state into ViewSortInfo objects', () => {
            view.SortState = JSON.stringify([
                { field: 'Name', dir: 'asc' },
                { field: 'CreatedAt', dir: 'desc' },
            ]);
            const result = view.ViewSortInfo;
            expect(result).toHaveLength(2);
            expect(result[0]).toBeInstanceOf(ViewSortInfo);
            expect(result[0].field).toBe('Name');
            expect(result[0].direction).toBe('Asc');
            expect(result[1].field).toBe('CreatedAt');
            expect(result[1].direction).toBe('Desc');
        });
    });

    // ----------------------------------------------------------------
    // OrderByClause getter
    // ----------------------------------------------------------------
    describe('OrderByClause', () => {
        it('should return empty string when no sort state', () => {
            view.SortState = null;
            expect(view.OrderByClause).toBe('');
        });

        it('should return field name only for asc direction', () => {
            view.SortState = JSON.stringify([{ field: 'Name', dir: 'asc' }]);
            expect(view.OrderByClause).toBe('Name');
        });

        it('should append DESC for desc direction', () => {
            view.SortState = JSON.stringify([{ field: 'CreatedAt', dir: 'desc' }]);
            expect(view.OrderByClause).toBe('CreatedAt DESC');
        });

        it('should join multiple sort fields with commas', () => {
            view.SortState = JSON.stringify([
                { field: 'Name', dir: 'asc' },
                { field: 'CreatedAt', dir: 'desc' },
                { field: 'ID', dir: 'asc' },
            ]);
            expect(view.OrderByClause).toBe('Name, CreatedAt DESC, ID');
        });

        it('should handle legacy numeric direction 1 (asc)', () => {
            // When direction is a number (from legacy data), it goes through
            // the ViewSortInfo constructor but dir is a number, so direction stays null.
            // Then OrderByClause checks typeof s.direction === 'string' -- it's null, not a string.
            // Then checks s.direction === 1 -- null !== 1
            // So dir becomes '' and desc is false, so no DESC appended
            // But wait -- let's trace: ViewSortInfo constructor has dir: 1 (number, not string)
            // so the `if (initData.dir && typeof initData.dir == 'string')` is false.
            // direction remains null from the class default.
            // Then in OrderByClause, s.direction is null:
            //   typeof null === 'object', not 'string', so first branch skipped
            //   null === 1 is false
            //   null === 2 is false
            //   dir = ''
            //   desc = false
            //   result = field with no DESC
            //
            // BUT the SortState directly contains direction, not dir. Let me re-read the code.
            // Actually, copyInitData copies ALL properties from initData to the object.
            // So if initData is { field: 'Name', direction: 1 }, direction gets set to 1.
            // But if initData is { field: 'Name', dir: 1 }, then dir gets copied as a property
            // and the constructor condition typeof initData.dir == 'string' is false.
            // direction stays null because 'direction' was not in initData.
            //
            // The legacy data might have { field: 'Name', direction: 1 } - direction is copied directly.
            // Let's test that path:
            view.SortState = JSON.stringify([{ field: 'Name', direction: 1 }]);
            const result = view.OrderByClause;
            // direction = 1 (copied via copyInitData), typeof 1 !== 'string', 1 === 1 -> dir = 'asc'
            expect(result).toBe('Name');
        });

        it('should handle legacy numeric direction 2 (desc)', () => {
            view.SortState = JSON.stringify([{ field: 'Name', direction: 2 }]);
            const result = view.OrderByClause;
            // direction = 2, typeof 2 !== 'string', 2 !== 1, 2 === 2 -> dir = 'desc'
            expect(result).toBe('Name DESC');
        });

        it('should handle direction as string "Asc" from ViewSortInfo', () => {
            view.SortState = JSON.stringify([{ field: 'Name', dir: 'asc' }]);
            // ViewSortInfo maps dir 'asc' -> direction = 'Asc'
            // OrderByClause: typeof 'Asc' === 'string' -> dir = 'asc'
            // desc = 'asc' === 'desc' -> false
            expect(view.OrderByClause).toBe('Name');
        });

        it('should handle direction as string "Desc" from ViewSortInfo', () => {
            view.SortState = JSON.stringify([{ field: 'Name', dir: 'desc' }]);
            // ViewSortInfo maps dir 'desc' -> direction = 'Desc'
            // OrderByClause: typeof 'Desc' === 'string' -> dir = 'desc'
            // desc = 'desc' === 'desc' -> true -> append ' DESC'
            expect(view.OrderByClause).toBe('Name DESC');
        });

        it('should handle unknown numeric direction as asc (no DESC)', () => {
            // direction = 99 - not 1 or 2, so dir = '', desc = false
            view.SortState = JSON.stringify([{ field: 'Name', direction: 99 }]);
            expect(view.OrderByClause).toBe('Name');
        });

        // GridState.sortSettings fallback tests
        it('should fall back to GridState.sortSettings when SortState is empty', () => {
            view.SortState = null;
            view.GridState = JSON.stringify({
                sortSettings: [{ field: 'Name', dir: 'asc' }],
                columnSettings: []
            });
            expect(view.OrderByClause).toBe('Name');
        });

        it('should fall back to GridState.sortSettings desc when SortState is empty', () => {
            view.SortState = null;
            view.GridState = JSON.stringify({
                sortSettings: [{ field: 'CreatedAt', dir: 'desc' }],
                columnSettings: []
            });
            expect(view.OrderByClause).toBe('CreatedAt DESC');
        });

        it('should handle multiple sort fields from GridState.sortSettings', () => {
            view.SortState = null;
            view.GridState = JSON.stringify({
                sortSettings: [
                    { field: 'Name', dir: 'asc' },
                    { field: 'CreatedAt', dir: 'desc' }
                ],
                columnSettings: []
            });
            expect(view.OrderByClause).toBe('Name, CreatedAt DESC');
        });

        it('should prefer SortState over GridState.sortSettings', () => {
            view.SortState = JSON.stringify([{ field: 'Name', dir: 'asc' }]);
            view.GridState = JSON.stringify({
                sortSettings: [{ field: 'CreatedAt', dir: 'desc' }],
                columnSettings: []
            });
            // SortState takes priority
            expect(view.OrderByClause).toBe('Name');
        });

        it('should return empty string when GridState has no sortSettings', () => {
            view.SortState = null;
            view.GridState = JSON.stringify({ columnSettings: [] });
            expect(view.OrderByClause).toBe('');
        });

        it('should return empty string when GridState is invalid JSON', () => {
            view.SortState = null;
            view.GridState = 'not valid json';
            expect(view.OrderByClause).toBe('');
        });

        it('should return empty string when GridState is null and SortState is null', () => {
            view.SortState = null;
            view.GridState = null;
            expect(view.OrderByClause).toBe('');
        });
    });

    // ----------------------------------------------------------------
    // ParsedDisplayState getter
    // ----------------------------------------------------------------
    describe('ParsedDisplayState', () => {
        it('should return null when DisplayState is null', () => {
            view.DisplayState = null;
            expect(view.ParsedDisplayState).toBeNull();
        });

        it('should return null when DisplayState is empty string', () => {
            view.DisplayState = '';
            expect(view.ParsedDisplayState).toBeNull();
        });

        it('should return parsed object for valid JSON', () => {
            const state: ViewDisplayState = { defaultMode: 'timeline' };
            view.DisplayState = JSON.stringify(state);
            expect(view.ParsedDisplayState).toEqual(state);
        });

        it('should return null for invalid JSON', () => {
            view.DisplayState = '{not-valid-json';
            // The console.warn is expected here
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            expect(view.ParsedDisplayState).toBeNull();
            expect(warnSpy).toHaveBeenCalled();
            warnSpy.mockRestore();
        });

        it('should preserve all fields in the display state', () => {
            const state: ViewDisplayState = {
                defaultMode: 'cards',
                enabledModes: { grid: true, cards: true, timeline: false },
                timeline: { dateFieldName: 'CreatedAt', segmentGrouping: 'month' },
                cards: { cardSize: 'large' },
                grid: { rowHeight: 'compact' },
            };
            view.DisplayState = JSON.stringify(state);
            expect(view.ParsedDisplayState).toEqual(state);
        });
    });

    // ----------------------------------------------------------------
    // setDisplayState
    // ----------------------------------------------------------------
    describe('setDisplayState', () => {
        it('should serialize ViewDisplayState to JSON and set DisplayState', () => {
            const state: ViewDisplayState = { defaultMode: 'cards' };
            view.setDisplayState(state);
            expect(view.DisplayState).toBe(JSON.stringify(state));
        });

        it('should overwrite existing DisplayState', () => {
            view.DisplayState = JSON.stringify({ defaultMode: 'grid' });
            const newState: ViewDisplayState = { defaultMode: 'timeline' };
            view.setDisplayState(newState);
            expect(JSON.parse(view.DisplayState as string).defaultMode).toBe('timeline');
        });
    });

    // ----------------------------------------------------------------
    // DefaultViewMode getter
    // ----------------------------------------------------------------
    describe('DefaultViewMode', () => {
        it('should return "grid" when DisplayState is null', () => {
            view.DisplayState = null;
            expect(view.DefaultViewMode).toBe('grid');
        });

        it('should return "grid" when DisplayState has no defaultMode', () => {
            view.DisplayState = JSON.stringify({});
            expect(view.DefaultViewMode).toBe('grid');
        });

        it('should return the stored defaultMode', () => {
            view.DisplayState = JSON.stringify({ defaultMode: 'timeline' });
            expect(view.DefaultViewMode).toBe('timeline');
        });

        it('should return "cards" when that is the defaultMode', () => {
            view.DisplayState = JSON.stringify({ defaultMode: 'cards' });
            expect(view.DefaultViewMode).toBe('cards');
        });
    });

    // ----------------------------------------------------------------
    // TimelineConfig getter
    // ----------------------------------------------------------------
    describe('TimelineConfig', () => {
        it('should return null when DisplayState is null', () => {
            view.DisplayState = null;
            expect(view.TimelineConfig).toBeNull();
        });

        it('should return null when DisplayState has no timeline', () => {
            view.DisplayState = JSON.stringify({ defaultMode: 'grid' });
            expect(view.TimelineConfig).toBeNull();
        });

        it('should return timeline config when present', () => {
            const timeline: ViewTimelineState = {
                dateFieldName: 'CreatedAt',
                segmentGrouping: 'month',
                sortOrder: 'desc',
            };
            view.DisplayState = JSON.stringify({ defaultMode: 'timeline', timeline });
            expect(view.TimelineConfig).toEqual(timeline);
        });
    });

    // ----------------------------------------------------------------
    // setTimelineConfig
    // ----------------------------------------------------------------
    describe('setTimelineConfig', () => {
        it('should create DisplayState when it does not exist', () => {
            view.DisplayState = null;
            const config: ViewTimelineState = {
                dateFieldName: 'UpdatedAt',
                segmentGrouping: 'year',
            };
            view.setTimelineConfig(config);
            const parsed = JSON.parse(view.DisplayState as string);
            expect(parsed.defaultMode).toBe('grid');
            expect(parsed.timeline).toEqual(config);
        });

        it('should preserve existing DisplayState and add timeline', () => {
            view.DisplayState = JSON.stringify({
                defaultMode: 'cards',
                enabledModes: { grid: true },
            });
            const config: ViewTimelineState = { dateFieldName: 'StartDate' };
            view.setTimelineConfig(config);
            const parsed = JSON.parse(view.DisplayState as string);
            expect(parsed.defaultMode).toBe('cards');
            expect(parsed.enabledModes).toEqual({ grid: true });
            expect(parsed.timeline).toEqual(config);
        });

        it('should overwrite existing timeline config', () => {
            view.DisplayState = JSON.stringify({
                defaultMode: 'timeline',
                timeline: { dateFieldName: 'OldField' },
            });
            const config: ViewTimelineState = { dateFieldName: 'NewField', sortOrder: 'asc' };
            view.setTimelineConfig(config);
            const parsed = JSON.parse(view.DisplayState as string);
            expect(parsed.timeline.dateFieldName).toBe('NewField');
            expect(parsed.timeline.sortOrder).toBe('asc');
        });
    });

    // ----------------------------------------------------------------
    // isViewModeEnabled
    // ----------------------------------------------------------------
    describe('isViewModeEnabled', () => {
        it('should return true when DisplayState is null (all modes enabled by default)', () => {
            view.DisplayState = null;
            expect(view.isViewModeEnabled('grid')).toBe(true);
            expect(view.isViewModeEnabled('cards')).toBe(true);
            expect(view.isViewModeEnabled('timeline')).toBe(true);
        });

        it('should return true when enabledModes is not defined', () => {
            view.DisplayState = JSON.stringify({ defaultMode: 'grid' });
            expect(view.isViewModeEnabled('timeline')).toBe(true);
        });

        it('should return true when mode is explicitly enabled', () => {
            view.DisplayState = JSON.stringify({
                defaultMode: 'grid',
                enabledModes: { grid: true, cards: true },
            });
            expect(view.isViewModeEnabled('grid')).toBe(true);
            expect(view.isViewModeEnabled('cards')).toBe(true);
        });

        it('should return false only when mode is explicitly set to false', () => {
            view.DisplayState = JSON.stringify({
                defaultMode: 'grid',
                enabledModes: { grid: true, cards: false, timeline: false },
            });
            expect(view.isViewModeEnabled('grid')).toBe(true);
            expect(view.isViewModeEnabled('cards')).toBe(false);
            expect(view.isViewModeEnabled('timeline')).toBe(false);
        });

        it('should return true when mode is not mentioned in enabledModes', () => {
            view.DisplayState = JSON.stringify({
                defaultMode: 'grid',
                enabledModes: { grid: true },
            });
            // 'timeline' is not in enabledModes, so enabledModes['timeline'] is undefined, !== false
            expect(view.isViewModeEnabled('timeline')).toBe(true);
        });
    });

    // ----------------------------------------------------------------
    // getDefaultTimelineDateField
    // ----------------------------------------------------------------
    describe('getDefaultTimelineDateField', () => {
        it('should return null when _ViewEntityInfo is null', () => {
            // _ViewEntityInfo defaults to null
            expect(view.getDefaultTimelineDateField()).toBeNull();
        });

        it('should return null when there are no date fields', () => {
            (view as Record<string, unknown>)['_ViewEntityInfo'] = makeMockEntityInfo([
                { Name: 'ID', NeedsQuotes: true, TSType: 'String' },
                { Name: 'Count', NeedsQuotes: false, TSType: 'Number' },
            ]);
            expect(view.getDefaultTimelineDateField()).toBeNull();
        });

        it('should return DefaultInView date field with lowest Sequence (priority 1)', () => {
            (view as Record<string, unknown>)['_ViewEntityInfo'] = makeMockEntityInfo([
                { Name: 'UpdatedAt', NeedsQuotes: true, TSType: 'Date', DefaultInView: true, Sequence: 10 },
                { Name: 'CreatedAt', NeedsQuotes: true, TSType: 'Date', DefaultInView: true, Sequence: 5 },
                { Name: 'ArchivedAt', NeedsQuotes: true, TSType: 'Date', DefaultInView: false, Sequence: 1 },
            ]);
            // Priority 1: DefaultInView date fields sorted by Sequence -> CreatedAt (5) < UpdatedAt (10)
            expect(view.getDefaultTimelineDateField()).toBe('CreatedAt');
        });

        it('should fall back to any date field by Sequence when no DefaultInView date fields exist (priority 2)', () => {
            (view as Record<string, unknown>)['_ViewEntityInfo'] = makeMockEntityInfo([
                { Name: 'ID', NeedsQuotes: true, TSType: 'String', Sequence: 1 },
                { Name: 'EndDate', NeedsQuotes: true, TSType: 'Date', DefaultInView: false, Sequence: 20 },
                { Name: 'StartDate', NeedsQuotes: true, TSType: 'Date', DefaultInView: false, Sequence: 10 },
            ]);
            // No DefaultInView date fields, so priority 2: all date fields sorted by Sequence -> StartDate (10)
            expect(view.getDefaultTimelineDateField()).toBe('StartDate');
        });

        it('should prefer DefaultInView date field even with higher Sequence over non-DefaultInView', () => {
            (view as Record<string, unknown>)['_ViewEntityInfo'] = makeMockEntityInfo([
                { Name: 'EarlyDate', NeedsQuotes: true, TSType: 'Date', DefaultInView: false, Sequence: 1 },
                { Name: 'LateDate', NeedsQuotes: true, TSType: 'Date', DefaultInView: true, Sequence: 100 },
            ]);
            // Priority 1 finds LateDate as DefaultInView, even though EarlyDate has lower Sequence
            expect(view.getDefaultTimelineDateField()).toBe('LateDate');
        });
    });

    // ----------------------------------------------------------------
    // getAvailableDateFields
    // ----------------------------------------------------------------
    describe('getAvailableDateFields', () => {
        it('should return empty array when _ViewEntityInfo is null', () => {
            expect(view.getAvailableDateFields()).toEqual([]);
        });

        it('should return empty array when no date fields exist', () => {
            (view as Record<string, unknown>)['_ViewEntityInfo'] = makeMockEntityInfo([
                { Name: 'ID', NeedsQuotes: true, TSType: 'String', Sequence: 1 },
                { Name: 'Count', NeedsQuotes: false, TSType: 'Number', Sequence: 2 },
            ]);
            expect(view.getAvailableDateFields()).toEqual([]);
        });

        it('should return date fields sorted by Sequence', () => {
            (view as Record<string, unknown>)['_ViewEntityInfo'] = makeMockEntityInfo([
                { Name: 'ID', NeedsQuotes: true, TSType: 'String', Sequence: 1 },
                { Name: 'EndDate', NeedsQuotes: true, TSType: 'Date', Sequence: 30 },
                { Name: 'StartDate', NeedsQuotes: true, TSType: 'Date', Sequence: 10 },
                { Name: 'MiddleDate', NeedsQuotes: true, TSType: 'Date', Sequence: 20 },
            ]);
            const result = view.getAvailableDateFields();
            expect(result).toHaveLength(3);
            expect(result[0].Name).toBe('StartDate');
            expect(result[1].Name).toBe('MiddleDate');
            expect(result[2].Name).toBe('EndDate');
        });
    });

    // ----------------------------------------------------------------
    // GenerateWhereClause (protected) - accessed via test subclass
    // ----------------------------------------------------------------
    describe('GenerateWhereClause', () => {
        // Use a test subclass to access the protected method
        class TestableView extends MJUserViewEntityExtended {
            public TestGenerateWhereClause(filterState: string, entityInfo: Record<string, unknown>): string {
                return this.GenerateWhereClause(filterState, entityInfo as unknown as never);
            }
        }

        let testView: TestableView;

        const standardFields: MockField[] = [
            { Name: 'Name', NeedsQuotes: true, TSType: 'String' },
            { Name: 'TotalRevenue', NeedsQuotes: false, TSType: 'Number' },
            { Name: 'NumberEmployees', NeedsQuotes: false, TSType: 'Number' },
            { Name: 'City', NeedsQuotes: true, TSType: 'String' },
            { Name: 'IsActive', NeedsQuotes: false, TSType: 'Boolean' },
            { Name: 'CreatedAt', NeedsQuotes: true, TSType: 'Date' },
            { Name: 'ActivityCount', NeedsQuotes: false, TSType: 'Number' },
        ];

        let entityInfo: Record<string, unknown>;

        beforeEach(() => {
            testView = new TestableView();
            entityInfo = makeMockEntityInfo(standardFields);
        });

        // --- eq operator ---
        it('should generate = clause for eq operator with string field', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'Name', operator: 'eq', value: 'TestCo' }],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe("([Name] = 'TestCo')");
        });

        it('should generate = clause for eq operator with numeric field (no quotes)', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'TotalRevenue', operator: 'eq', value: '50000' }],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe('([TotalRevenue] = 50000)');
        });

        // --- neq operator ---
        it('should generate <> clause for neq operator', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'City', operator: 'neq', value: 'Chicago' }],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe("([City] <> 'Chicago')");
        });

        // --- gt operator ---
        it('should generate > clause for gt operator', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'TotalRevenue', operator: 'gt', value: '10000000' }],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe('([TotalRevenue] > 10000000)');
        });

        // --- gte operator ---
        it('should generate >= clause for gte operator', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'NumberEmployees', operator: 'gte', value: '25' }],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe('([NumberEmployees] >= 25)');
        });

        // --- lt operator ---
        it('should generate < clause for lt operator', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'ActivityCount', operator: 'lt', value: '5' }],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe('([ActivityCount] < 5)');
        });

        // --- lte operator ---
        it('should generate <= clause for lte operator', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'ActivityCount', operator: 'lte', value: '10' }],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe('([ActivityCount] <= 10)');
        });

        // --- startswith operator ---
        it('should generate LIKE with trailing % for startswith', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'Name', operator: 'startswith', value: 'A' }],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe("([Name] LIKE 'A%')");
        });

        // --- endswith operator ---
        it('should generate LIKE with leading % for endswith', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'Name', operator: 'endswith', value: 'Corp' }],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe("([Name] LIKE '%Corp')");
        });

        // --- contains operator ---
        it('should generate LIKE with surrounding % for contains', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'City', operator: 'contains', value: 'ica' }],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe("([City] LIKE '%ica%')");
        });

        // --- doesnotcontain operator ---
        it('should generate NOT LIKE for doesnotcontain', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'City', operator: 'doesnotcontain', value: 'test' }],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe("([City] NOT LIKE '%test%')");
        });

        // --- isnull operator ---
        it('should generate IS NULL for isnull', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'City', operator: 'isnull', value: null }],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe('([City] IS NULL)');
        });

        // --- isempty operator ---
        it('should generate IS NULL for isempty', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'Name', operator: 'isempty', value: '' }],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe('([Name] IS NULL)');
        });

        // --- isnotnull operator ---
        it('should generate IS NOT NULL for isnotnull', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'City', operator: 'isnotnull', value: null }],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe('([City] IS NOT NULL)');
        });

        // --- isnotempty operator ---
        it('should generate IS NOT NULL for isnotempty', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'Name', operator: 'isnotempty', value: '' }],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe('([Name] IS NOT NULL)');
        });

        // --- Boolean value conversion ---
        it('should convert boolean true to 1 for Boolean fields', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'IsActive', operator: 'eq', value: true }],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe('([IsActive] = 1)');
        });

        it('should convert boolean false to 0 for Boolean fields', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'IsActive', operator: 'eq', value: false }],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe('([IsActive] = 0)');
        });

        it('should convert string "true" to 1 for Boolean fields', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'IsActive', operator: 'eq', value: 'true' }],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe('([IsActive] = 1)');
        });

        it('should convert string "false" to 0 for Boolean fields', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'IsActive', operator: 'eq', value: 'false' }],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe('([IsActive] = 0)');
        });

        it('should convert null/falsy to 0 for Boolean fields', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'IsActive', operator: 'eq', value: null }],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe('([IsActive] = 0)');
        });

        // --- AND logic ---
        it('should join multiple filters with AND', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [
                    { field: 'City', operator: 'eq', value: 'Chicago' },
                    { field: 'ActivityCount', operator: 'gte', value: '5' },
                ],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe(
                "([City] = 'Chicago') AND ([ActivityCount] >= 5)"
            );
        });

        // --- OR logic ---
        it('should join multiple filters with OR', () => {
            const fs = JSON.stringify({
                logic: 'or',
                filters: [
                    { field: 'Name', operator: 'startswith', value: 'A' },
                    { field: 'Name', operator: 'startswith', value: 'B' },
                ],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe(
                "([Name] LIKE 'A%') OR ([Name] LIKE 'B%')"
            );
        });

        // --- Nested filter groups ---
        it('should handle nested filter groups with parentheses', () => {
            const fs = JSON.stringify({
                logic: 'or',
                filters: [
                    { field: 'Name', operator: 'startswith', value: 'A' },
                    {
                        logic: 'and',
                        filters: [
                            { field: 'City', operator: 'eq', value: 'Chicago' },
                            { field: 'ActivityCount', operator: 'gte', value: '5' },
                        ],
                    },
                ],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe(
                "([Name] LIKE 'A%') OR (([City] = 'Chicago') AND ([ActivityCount] >= 5))"
            );
        });

        // --- Complex multi-level nesting (from the JSDoc example) ---
        it('should handle the complex filter state from the JSDoc example', () => {
            const fs = JSON.stringify({
                logic: 'or',
                filters: [
                    { field: 'Name', operator: 'startswith', value: 'A' },
                    {
                        logic: 'or',
                        filters: [
                            { field: 'TotalRevenue', operator: 'gt', value: '10000000' },
                            { field: 'NumberEmployees', operator: 'gte', value: '25' },
                            {
                                logic: 'and',
                                filters: [
                                    { field: 'City', operator: 'eq', value: 'Chicago' },
                                    { field: 'ActivityCount', operator: 'gte', value: '5' },
                                ],
                            },
                        ],
                    },
                    { field: 'CreatedAt', operator: 'gte', value: '2023-01-01T06:00:00.000Z' },
                ],
            });
            const result = testView.TestGenerateWhereClause(fs, entityInfo);
            expect(result).toBe(
                "([Name] LIKE 'A%') OR " +
                '(([TotalRevenue] > 10000000) OR ([NumberEmployees] >= 25) OR ' +
                "(([City] = 'Chicago') AND ([ActivityCount] >= 5))) OR " +
                "([CreatedAt] >= '2023-01-01T06:00:00.000Z')"
            );
        });

        // --- Date values with quotes ---
        it('should wrap date values in quotes', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'CreatedAt', operator: 'gte', value: '2024-01-01' }],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe(
                "([CreatedAt] >= '2024-01-01')"
            );
        });

        // --- Single filter ---
        it('should handle a single filter without extra logic operators', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'TotalRevenue', operator: 'gt', value: '100' }],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe('([TotalRevenue] > 100)');
        });

        // --- Field not found ---
        it('should throw error when field is not found in entity', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'NonExistentField', operator: 'eq', value: 'x' }],
            });
            expect(() => testView.TestGenerateWhereClause(fs, entityInfo)).toThrow(
                'Unable to find field NonExistentField in entity MJTestEntity'
            );
        });

        // --- Case-insensitive field name matching ---
        it('should match field names case-insensitively', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [{ field: 'name', operator: 'eq', value: 'Test' }],
            });
            // The field is 'Name' in entity but 'name' in filter -- should still match
            // Note: the output uses the field name from the filter (not from the entity)
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe("([name] = 'Test')");
        });

        // --- Empty filters array ---
        it('should return empty string for empty filters array', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe('');
        });

        // --- Deeply nested groups ---
        it('should handle three levels of nesting', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [
                    {
                        logic: 'or',
                        filters: [
                            {
                                logic: 'and',
                                filters: [
                                    { field: 'Name', operator: 'eq', value: 'X' },
                                    { field: 'City', operator: 'eq', value: 'Y' },
                                ],
                            },
                            { field: 'TotalRevenue', operator: 'gt', value: '100' },
                        ],
                    },
                ],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe(
                "((([Name] = 'X') AND ([City] = 'Y')) OR ([TotalRevenue] > 100))"
            );
        });

        // --- Nested group surrounded by parentheses at top level ---
        it('should wrap nested groups in parentheses within the parent', () => {
            const fs = JSON.stringify({
                logic: 'and',
                filters: [
                    { field: 'Name', operator: 'eq', value: 'A' },
                    {
                        logic: 'or',
                        filters: [
                            { field: 'City', operator: 'eq', value: 'X' },
                            { field: 'City', operator: 'eq', value: 'Y' },
                        ],
                    },
                ],
            });
            expect(testView.TestGenerateWhereClause(fs, entityInfo)).toBe(
                "([Name] = 'A') AND (([City] = 'X') OR ([City] = 'Y'))"
            );
        });
    });

    // ----------------------------------------------------------------
    // Columns getter
    // ----------------------------------------------------------------
    describe('Columns', () => {
        it('should return empty array when GridState is null', () => {
            view.GridState = null;
            expect(view.Columns).toEqual([]);
        });

        it('should return empty array when GridState is empty string', () => {
            view.GridState = '';
            expect(view.Columns).toEqual([]);
        });

        it('should return empty array when GridState has no columnSettings', () => {
            view.GridState = JSON.stringify({});
            expect(view.Columns).toEqual([]);
        });

        it('should parse columns and attach EntityField reference', () => {
            const mockField = { Name: 'CompanyName', TSType: 'String', ID: 'f-1' };
            (view as Record<string, unknown>)['_ViewEntityInfo'] = {
                Fields: [mockField],
            };
            view.GridState = JSON.stringify({
                columnSettings: [
                    { Name: 'CompanyName', DisplayName: 'Company Name', hidden: false, width: 200 },
                ],
            });
            const cols = view.Columns;
            expect(cols).toHaveLength(1);
            expect(cols[0]).toBeInstanceOf(ViewColumnInfo);
            expect(cols[0].Name).toBe('CompanyName');
            expect(cols[0].EntityField).toBe(mockField);
        });

        it('should handle null column settings gracefully', () => {
            (view as Record<string, unknown>)['_ViewEntityInfo'] = { Fields: [] };
            view.GridState = JSON.stringify({
                columnSettings: [null, { Name: 'Test', DisplayName: 'Test' }],
            });
            const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const cols = view.Columns;
            // The null entry causes a console.log and returns undefined in the map
            expect(logSpy).toHaveBeenCalled();
            // The non-null entry should still be mapped, but EntityField won't match
            // We expect 2 entries in the map result (one undefined from null, one ViewColumnInfo)
            expect(cols).toHaveLength(2);
            logSpy.mockRestore();
        });

        it('should match field names case-insensitively', () => {
            const mockField = { Name: 'CompanyName', TSType: 'String', ID: 'f-1' };
            (view as Record<string, unknown>)['_ViewEntityInfo'] = {
                Fields: [mockField],
            };
            view.GridState = JSON.stringify({
                columnSettings: [
                    { Name: 'companyname', DisplayName: 'Company Name' },
                ],
            });
            const cols = view.Columns;
            expect(cols[0].EntityField).toBe(mockField);
        });
    });

    // ----------------------------------------------------------------
    // ViewEntityInfo getter
    // ----------------------------------------------------------------
    describe('ViewEntityInfo', () => {
        it('should return null by default', () => {
            expect(view.ViewEntityInfo).toBeNull();
        });

        it('should return the set _ViewEntityInfo', () => {
            const mockEntity = { Name: 'Test', ID: 'e-1', Fields: [] };
            (view as Record<string, unknown>)['_ViewEntityInfo'] = mockEntity;
            expect(view.ViewEntityInfo).toBe(mockEntity);
        });
    });
});
