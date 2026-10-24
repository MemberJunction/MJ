import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunView, type EntityInfo, type IMetadataProvider } from '@memberjunction/core';
import type { MJUserViewEntityExtended } from '@memberjunction/core-entities';
import {
    ComponentPartInterface,
    LoadComponentSpec,
    LoadPartInterface,
    QueryPartInterface,
    ViewPartInterface,
    WebUrlPartInterface,
} from './dashboard-part-interfaces';

const provider = { CurrentUser: { ID: 'u1' } } as unknown as IMetadataProvider;

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ViewPartInterface', () => {
    const view = {
        PropertiesObject: [
            { Name: 'ChapterID', Type: 'uuid', Target: { Field: 'ChapterID', Operator: '=' } },
            { Name: 'Org', Type: 'uuid', AllowOverride: false, IsRequired: true, Target: { Field: 'OrgID', Operator: '=' } },
            { Name: 'Since', Type: 'date', Default: { Token: 'Context.Today' }, Target: { Field: 'JoinedAt', Operator: '>=' } },
        ],
    } as unknown as MJUserViewEntityExtended;
    const entity = {
        Fields: [
            { Name: 'ID', Type: 'uniqueidentifier', IsBinaryFieldType: false },
            { Name: 'Name', Type: 'nvarchar', IsBinaryFieldType: false },
            { Name: 'Photo', Type: 'varbinary', IsBinaryFieldType: true },
        ],
    } as unknown as EntityInfo;

    it("declares the view's properties as inputs; a property that does not allow override is server-set", () => {
        const result = ViewPartInterface(view, entity);
        expect(result.Inputs.map(i => [i.Name, i.Type, i.ServerSet, i.HasOwnDefault, i.IsRequired])).toEqual([
            ['ChapterID', 'uuid', false, false, false],
            ['Org', 'uuid', true, false, true],
            ['Since', 'date', false, true, false],
        ]);
    });

    it("declares RecordSelected with the record's fields", () => {
        expect(ViewPartInterface(view, entity).Events).toEqual([
            { Name: 'RecordSelected', Values: [{ Name: 'ID', Type: 'uuid' }, { Name: 'Name', Type: 'string' }] },
        ]);
    });
});

describe('QueryPartInterface', () => {
    it("declares the query's parameters (a server-set one as such) and RowSelected with its columns", () => {
        const result = QueryPartInterface(
            [
                { Name: 'chapter_id', Type: 'string', Description: null, IsRequired: true, DefaultValue: null, IsServerSet: false },
                { Name: 'org_id', Type: 'string', Description: null, IsRequired: true, DefaultValue: null, IsServerSet: true },
                { Name: 'ids', Type: 'array', Description: null, IsRequired: false, DefaultValue: '[]', IsServerSet: false },
            ],
            [{ Name: 'MemberID', SQLBaseType: 'uniqueidentifier' }],
        );
        expect(result.Inputs.map(i => [i.Name, i.Type, i.ServerSet, i.UserCanFill, i.HasOwnDefault])).toEqual([
            ['chapter_id', 'string', false, true, false],
            ['org_id', 'string', true, true, false],
            ['ids', 'unsupported', false, true, true],
        ]);
        expect(result.Events).toEqual([{ Name: 'RowSelected', Values: [{ Name: 'MemberID', Type: 'uuid' }] }]);
    });
});

describe('ComponentPartInterface', () => {
    it("declares the component's props and events", () => {
        const result = ComponentPartInterface({
            properties: [
                { name: 'selectedChapter', type: 'string', description: 'd', required: true },
                { name: 'pageSize', type: 'number', description: 'd', required: false, defaultValue: 20 },
            ],
            events: [{ name: 'onSelectMember', description: 'd', parameters: [{ name: 'memberId', type: 'string', description: 'd' }] }],
        });
        expect(result.Inputs.map(i => [i.Name, i.Type, i.IsRequired, i.HasOwnDefault])).toEqual([
            ['selectedChapter', 'string', true, false],
            ['pageSize', 'number', false, true],
        ]);
        expect(result.Events).toEqual([{ Name: 'onSelectMember', Values: [{ Name: 'memberId', Type: 'string' }] }]);
    });
});

describe('WebUrlPartInterface', () => {
    it('declares one required input per placeholder, taking any value', () => {
        expect(WebUrlPartInterface('https://e.com/{Chapter}?s={Since}').Inputs.map(i => [i.Name, i.Type, i.IsRequired])).toEqual([
            ['Chapter', 'any', true],
            ['Since', 'any', true],
        ]);
        expect(WebUrlPartInterface('https://e.com').Inputs).toEqual([]);
    });
});

describe('LoadPartInterface', () => {
    it('declares nothing for an Artifact part or an unknown type', async () => {
        expect(await LoadPartInterface({ type: 'Artifact', artifactId: 'x' }, provider)).toEqual({ Inputs: [], Events: [] });
        expect(await LoadPartInterface(null, provider)).toEqual({ Inputs: [], Events: [] });
    });

    it('reads a Web URL part from its URL without the provider', async () => {
        const result = await LoadPartInterface({ type: 'WebURL', url: 'https://e.com/{A}' }, provider);
        expect(result.Inputs.map(i => i.Name)).toEqual(['A']);
    });
});

describe('LoadComponentSpec', () => {
    function stubRunView(result: { Success: boolean; Results: Array<{ Name: string; Specification: string }>; ErrorMessage?: string }) {
        const runView = vi.fn().mockResolvedValue(result);
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runView } as unknown as RunView);
        return runView;
    }

    it('loads the named component through the provider, by name, namespace and version', async () => {
        const runView = stubRunView({ Success: true, Results: [{ Name: 'Members', Specification: JSON.stringify({ name: 'Members', properties: [] }) }] });
        const spec = await LoadComponentSpec({ type: 'Component', componentName: "O'Brien", componentNamespace: 'crm', componentVersion: '1.2.0' }, provider);
        expect(spec.name).toBe('Members');
        expect(RunView.FromMetadataProvider).toHaveBeenCalledWith(provider);
        const params = runView.mock.calls[0][0];
        expect(params.EntityName).toBe('MJ: Components');
        expect(params.ExtraFilter).toEqual({
            default: "Name = 'O''Brien' AND Namespace = 'crm' AND Version = '1.2.0'",
            sqlserver: "Name = N'O''Brien' AND Namespace = 'crm' AND Version = '1.2.0'",
        });
        expect(params.OrderBy).toBe('VersionSequence DESC');
        expect(params.Fields).not.toContain('FunctionalRequirements');
    });

    it('takes the highest version when none is pinned', async () => {
        const runView = stubRunView({ Success: true, Results: [{ Name: 'Members', Specification: '{}' }] });
        await LoadComponentSpec({ type: 'Component', componentName: 'Members' }, provider);
        expect(runView.mock.calls[0][0].ExtraFilter.default).toBe("Name = 'Members'");
    });

    it('refuses no component, a missing one, and an invalid specification', async () => {
        await expect(LoadComponentSpec({ type: 'Component' }, provider)).rejects.toThrow('No component is selected.');
        stubRunView({ Success: true, Results: [] });
        await expect(LoadComponentSpec({ type: 'Component', componentName: 'Nope' }, provider)).rejects.toThrow('was not found');
        stubRunView({ Success: true, Results: [{ Name: 'Bad', Specification: '{oops' }] });
        await expect(LoadComponentSpec({ type: 'Component', componentName: 'Bad' }, provider)).rejects.toThrow('invalid specification');
    });
});
