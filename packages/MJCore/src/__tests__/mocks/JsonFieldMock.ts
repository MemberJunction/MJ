/**
 * Fixtures for the JSONType live-sync tests: a `Products` entity carrying two JSON text columns
 * (`Config`, `Settings`) plus its IS-A child `Meetings`, and a stub data provider that records what
 * a `Save()` actually hands to persistence.
 */
import { BaseEntity } from '../../generic/baseEntity';
import { EntityInfo } from '../../generic/entityInfo';
import type { IEntityDataProvider } from '../../generic/interfaces';
import { ALL_ENTITY_DATA, PRODUCT_ENTITY_DATA, PRODUCT_ENTITY_ID } from './MockEntityData';

export const JSON_MOCK_USER = { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] };

function jsonColumn(name: string, sequence: number, jsonType: string, isArray: boolean) {
    return {
        ID: `f-prod-${name.toLowerCase()}`,
        EntityID: PRODUCT_ENTITY_ID,
        Name: name,
        Type: 'nvarchar',
        IsPrimaryKey: false,
        IsSoftPrimaryKey: false,
        IsSoftForeignKey: false,
        AllowsNull: true,
        AutoIncrement: false,
        IsVirtual: false,
        IsNameField: false,
        AllowUpdateAPI: true,
        ValueListType: 'None',
        Sequence: sequence,
        Status: 'Active',
        Entity: 'Products',
        EntityFieldValues: [],
        JSONType: jsonType,
        JSONTypeIsArray: isArray,
    };
}

/** Every mock entity, with `Products` extended by the two JSON columns. */
export function buildJsonEntityInfos(): EntityInfo[] {
    const products = {
        ...PRODUCT_ENTITY_DATA,
        EntityFields: [
            ...PRODUCT_ENTITY_DATA.EntityFields,
            jsonColumn('Config', 5, 'IConfig', false),
            jsonColumn('Settings', 6, 'ISettings', true),
        ],
    };
    return ALL_ENTITY_DATA.map((d) => new EntityInfo(d.ID === PRODUCT_ENTITY_ID ? products : d));
}

/**
 * Stub persistence. `Saves` holds a snapshot of the JSON columns as the provider received them —
 * i.e. after `BaseEntity` finished its own pre-save work — so ordering claims are assertable.
 */
export class JsonStubProvider {
    public Saves: Array<{ Config: unknown; Settings: unknown }> = [];
    public FailNextSave = false;
    public CurrentUser = JSON_MOCK_USER;
    get SupportsEntityTransactions() { return true; }
    get IsInTransaction() { return false; }
    async Save(entity: BaseEntity): Promise<Record<string, unknown>> {
        this.Saves.push({ Config: entity.Get('Config'), Settings: entity.Get('Settings') });
        if (this.FailNextSave) {
            this.FailNextSave = false;
            throw new Error('database unavailable');
        }
        return entity.GetAll();
    }
    async Delete(): Promise<boolean> { return true; }
    SetCachedRecordName(): void { /* no-op */ }
    GetCachedRecordName(): string | undefined { return undefined; }
    get Provider(): IEntityDataProvider { return this as unknown as IEntityDataProvider; }
}
