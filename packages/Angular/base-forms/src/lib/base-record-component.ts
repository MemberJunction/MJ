import { BaseEntity, EntityFieldInfo } from "@memberjunction/core";

export abstract class BaseRecordComponent {
    public abstract record: BaseEntity

    public FormatField(entityFieldInfo: EntityFieldInfo, value: any, decimals: number = 2, currency: string = 'USD') {
        return entityFieldInfo.FormatValue(value, decimals, currency);
    }

    public FormatValue(fieldName: string, decimals: number = 2, currency: string = 'USD') {
        if (!this.record) 
            throw new Error('this.record not set');

        const r = <BaseEntity>this.record;      
        const f = r.Fields.find(f => f.Name.trim().toLowerCase() === fieldName.trim().toLowerCase() || 
                                     f.CodeName.trim().toLowerCase() === fieldName.trim().toLowerCase());
        if (!f) 
            throw new Error(`Field ${fieldName} not found in entity ${r.EntityInfo.Name}`);

        return f.FormatValue(decimals, currency);
    }
}