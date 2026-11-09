/**
 * Plain-object stand-ins for `EntityInfo` / `EntityFieldInfo`, shared by the JSONType codegen tests.
 * (The generator is exercised with the same kind of hand-built fixtures the other codegen suites use;
 * it reads only the properties set here.)
 */

export type Plain = Record<string, unknown>;

export function makeField(overrides: Plain = {}): Plain {
    return {
        Name: 'TestField',
        CodeName: 'TestField',
        DisplayName: 'Test Field',
        Type: 'nvarchar',
        SQLFullType: 'nvarchar(MAX)',
        AllowsNull: true,
        ReadOnly: false,
        IsPrimaryKey: false,
        AutoIncrement: false,
        IsVirtual: false,
        AllowUpdateAPI: true,
        ValueListType: 'None',
        ValueListTypeEnum: 'None',
        EntityFieldValues: [],
        RelatedEntity: null,
        RelatedEntityBaseView: null,
        RelatedEntityFieldName: null,
        DefaultValue: null,
        Description: '',
        Status: 'Active',
        NeedsQuotes: true,
        JSONType: null,
        JSONTypeIsArray: false,
        JSONTypeDefinition: null,
        ...overrides,
    };
}

export function makePrimaryKeyField(): Plain {
    return makeField({
        Name: 'ID', CodeName: 'ID', DisplayName: 'ID', Type: 'uniqueidentifier', SQLFullType: 'uniqueidentifier',
        AllowsNull: false, IsPrimaryKey: true, AutoIncrement: false, ReadOnly: true,
    });
}

export function makeEntity(fields: Plain[], overrides: Plain = {}): Plain {
    return {
        Name: 'Test Entity',
        ClassName: 'TestEntity',
        SchemaName: '__mj',
        BaseTable: 'TestEntity',
        BaseView: 'vwTestEntities',
        Description: '',
        PrimaryKeys: fields.filter((f) => f.IsPrimaryKey),
        Fields: fields,
        EntityObjectSubclassName: '',
        EntityObjectSubclassImport: '',
        IsChildType: false,
        Status: 'Active',
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        ...overrides,
    };
}

/** Entities whose JSONTypes carry NO `@mjValidate`: their output must not change with this feature. */
export function buildUntaggedEntities(): Record<string, Plain> {
    const plainDefinition = `export interface IMyConfig {
    Name: string;
    Limit?: number;
    IMyConfig?: string;   // a property that shares its name with the type
    Children: IMyConfig[];
}`;
    const withComments = `/**
 * Settings blob. IMySettings is documented in prose here.
 */
export interface IMySettings { Theme: 'light' | 'dark'; Extra: IMyExtra }
export interface IMyExtra { Note: string | null }`;
    return {
        jsonEntity: makeEntity([
            makePrimaryKeyField(),
            makeField({ Name: 'Config', CodeName: 'Config', JSONType: 'IMyConfig', JSONTypeDefinition: plainDefinition }),
            makeField({ Name: 'SharedConfig', CodeName: 'SharedConfig', JSONType: 'IMyConfig', JSONTypeDefinition: plainDefinition }),
            makeField({ Name: 'Items', CodeName: 'Items', JSONType: 'IMyExtra', JSONTypeIsArray: true, AllowsNull: false, JSONTypeDefinition: withComments }),
            makeField({ Name: 'Settings', CodeName: 'Settings', JSONType: 'IMySettings', JSONTypeDefinition: withComments }),
            makeField({ Name: 'NoDefinition', CodeName: 'NoDefinition', JSONType: 'ISomewhereElse' }),
            makeField({ Name: 'Plain', CodeName: 'Plain' }),
        ]),
        plainEntity: makeEntity([
            makePrimaryKeyField(),
            makeField({ Name: 'Name', CodeName: 'Name', Type: 'nvarchar', AllowsNull: false }),
            makeField({ Name: 'Score', CodeName: 'Score', Type: 'int', SQLFullType: 'int' }),
        ]),
    };
}
