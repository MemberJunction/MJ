import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SimpleChange, type ChangeDetectorRef } from '@angular/core';
import type { EntityInfo, IMetadataProvider, UserViewProperty } from '@memberjunction/core';
import { UserInfoEngine, type MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { ViewPropertiesEditorComponent } from '../lib/view-properties-editor/view-properties-editor.component';
import { ViewConfigPanelComponent, type ViewSaveEvent } from '../lib/view-config-panel/view-config-panel.component';
import { ViewWorkspaceComponent } from '../lib/view-workspace/view-workspace.component';

/**
 * The view designer's Properties panel: the editor edits a copy immutably, the config panel loads
 * the view's properties, blocks a save while any is invalid and emits them with the save, and the
 * workspace writes them onto the view (null for none, as a view without properties always had).
 */

const ENTITY = {
    ID: 'entity-1',
    Name: 'Members',
    DisplayNameOrName: 'Members',
    Fields: [
        { ID: 'f1', Name: 'Name', DisplayNameOrName: 'Name', DefaultInView: true, DefaultColumnWidth: 200, Type: 'nvarchar', EntityFieldValues: [] },
        { ID: 'f2', Name: 'ChapterID', DisplayNameOrName: 'Chapter', DefaultInView: true, DefaultColumnWidth: 120, Type: 'uniqueidentifier', EntityFieldValues: [] },
        { ID: 'f3', Name: 'Photo', DisplayNameOrName: 'Photo', DefaultInView: false, Type: 'varbinary', IsBinaryFieldType: true, EntityFieldValues: [] },
    ],
} as unknown as EntityInfo;

const chapter: UserViewProperty = { Name: 'Chapter', Type: 'uuid', AllowOverride: false, Target: { Field: 'ChapterID', Operator: '=' } };

describe('ViewPropertiesEditorComponent', () => {
    function editor(properties: UserViewProperty[] = []) {
        const e = new ViewPropertiesEditorComponent();
        e.Entity = ENTITY;
        e.Properties = properties;
        const emitted: UserViewProperty[][] = [];
        e.PropertiesChange.subscribe(p => emitted.push(p));
        return { e, emitted };
    }

    it('adds a property targeting the first field and removes it, emitting a new list each time', () => {
        const { e, emitted } = editor();
        e.AddProperty();
        expect(emitted[0]).toEqual([{ Name: 'Property1', Type: 'string', AllowOverride: true, Target: { Field: 'Name', Operator: '=' } }]);
        e.RemoveProperty(0);
        expect(emitted[1]).toEqual([]);
        expect(emitted[0]).not.toBe(emitted[1]);
    });

    it('offers non-binary fields only, and the operators each type allows', () => {
        const { e } = editor();
        expect(e.FieldOptions.map(f => f.Name)).toEqual(['Name', 'ChapterID']);
        expect(e.OperatorsFor('boolean')).toEqual(['=', '<>']);
        expect(e.OperatorsFor('uuid')).toEqual(['=', '<>', 'IN']);
    });

    it('changing the type keeps a valid operator, resets an invalid one and drops a fixed default', () => {
        const { e } = editor([{ Name: 'Age', Type: 'number', Default: { Value: 3 }, Target: { Field: 'Name', Operator: '>=' } }]);
        e.SetType(0, 'boolean');
        expect(e.Properties[0]).toMatchObject({ Type: 'boolean', Target: { Operator: '=' }, Default: undefined });
    });

    it('edits a fixed default by type and a token default with an offset', () => {
        const { e } = editor([{ Name: 'Age', Type: 'number', Target: { Field: 'Name', Operator: '=' } }]);
        e.SetDefaultMode(0, 'value');
        e.SetDefaultValue(0, '21');
        expect(e.Properties[0].Default).toEqual({ Value: 21 });
        e.SetDefaultValue(0, '  ');
        expect(e.Properties[0].Default).toEqual({ Value: null });

        e.SetType(0, 'date');
        e.SetDefaultMode(0, 'token');
        expect(e.Properties[0].Default?.Token).toBe('Context.Today');
        e.SetOffset(0, -30, 'day');
        expect(e.Properties[0].Default).toEqual({ Token: 'Context.Today', Offset: { Amount: -30, Unit: 'day' } });
        e.SetToken(0, 'Context.UserID');
        expect(e.Properties[0].Default?.Offset).toBeUndefined();
        expect(e.TakesOffset(e.Properties[0])).toBe(false);
    });

    it('lists the problems that block saving', () => {
        const { e } = editor([{ ...chapter, Target: { Field: 'Photo', Operator: '>' } }]);
        expect(e.Problems).toEqual([
            'Property "Chapter": Target.Field "Photo" is not a field of the view\'s entity.',
            'Property "Chapter": Target.Operator > does not apply to a uuid property. Allowed: =, <>, IN.',
        ]);
    });
});

describe('ViewConfigPanelComponent — properties', () => {
    function panel(declared: UserViewProperty[] | null) {
        const cdr = { detectChanges: vi.fn(), markForCheck: vi.fn() } as unknown as ChangeDetectorRef;
        const p = new ViewConfigPanelComponent(cdr);
        p.Provider = { CurrentUser: null } as unknown as IMetadataProvider;
        p.Entity = ENTITY;
        p.ViewEntity = { Name: 'Chapter Members', Description: '', IsShared: false, SmartFilterEnabled: false, FilterState: null, PropertiesObject: declared, UserCanEdit: true } as unknown as MJUserViewEntityExtended;
        p.IsOpen = true;
        p.ngOnChanges({ IsOpen: new SimpleChange(false, true, false) });
        const saved: ViewSaveEvent[] = [];
        p.Save.subscribe(e => saved.push(e));
        return { p, saved };
    }

    it('loads a copy of the view properties and emits them with the save', () => {
        const declared = [chapter];
        const { p, saved } = panel(declared);
        expect(p.Properties).toEqual(declared);
        expect(p.Properties).not.toBe(declared);
        p.OnSave();
        expect(saved[0].Properties).toEqual([chapter]);
    });

    it('a view without properties emits an empty list', () => {
        const { p, saved } = panel(null);
        expect(p.Properties).toEqual([]);
        p.OnSave();
        expect(saved[0].Properties).toEqual([]);
    });

    it('blocks saving while a property is invalid', () => {
        const { p, saved } = panel([{ ...chapter, Target: { Field: 'Nope', Operator: '=' } }]);
        expect(p.IsValid).toBe(false);
        expect(p.IsValidForSaveAsNew).toBe(false);
        p.OnSave();
        p.OnSaveAsNew();
        expect(saved).toEqual([]);
    });
});

describe('ViewWorkspaceComponent — saving properties onto the view', () => {
    let component: ViewWorkspaceComponent;
    let view: { PropertiesObject: UserViewProperty[] | null; Save: ReturnType<typeof vi.fn> } & Record<string, unknown>;

    beforeEach(() => {
        const cdr = { detectChanges: vi.fn(), markForCheck: vi.fn() } as unknown as ChangeDetectorRef;
        component = new ViewWorkspaceComponent(cdr);
        vi.spyOn(UserInfoEngine, 'Instance', 'get').mockReturnValue({ SetSetting: vi.fn(), GetSetting: vi.fn() } as unknown as UserInfoEngine);
        view = { ID: 'view-1', PropertiesObject: null, Save: vi.fn().mockResolvedValue(true), LatestResult: null };
        component.Provider = { CurrentUser: { ID: 'user-1' } } as unknown as IMetadataProvider;
        component.AutoSaveView = true;
        (component as unknown as { _entity: EntityInfo })._entity = ENTITY;
        component.CurrentViewEntity = view as unknown as MJUserViewEntityExtended;
    });

    afterEach(() => vi.restoreAllMocks());

    function event(properties: UserViewProperty[] | undefined): ViewSaveEvent {
        return {
            Name: 'Chapter Members', Description: '', IsShared: false, SaveAsNew: false, Columns: [], SortField: null, SortDirection: 'asc',
            SortItems: [], SmartFilterEnabled: false, SmartFilterPrompt: '', FilterState: null, AggregatesConfig: null, Properties: properties,
        };
    }

    it('writes the properties onto the view, and null for an empty list', async () => {
        await component.OnSaveView(event([chapter]));
        expect(view.PropertiesObject).toEqual([chapter]);
        await component.OnSaveView(event([]));
        expect(view.PropertiesObject).toBeNull();
        expect(view.Save).toHaveBeenCalledTimes(2);
    });

    it('leaves the view properties alone when the event carries none', async () => {
        view.PropertiesObject = [chapter];
        await component.OnSaveView(event(undefined));
        expect(view.PropertiesObject).toEqual([chapter]);
    });
});
