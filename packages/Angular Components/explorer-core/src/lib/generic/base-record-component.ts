import { BaseEntity, EntityFieldInfo } from "@memberjunction/core";

export abstract class BaseRecordComponent {
    public abstract record: any

    public FormatField(entityFieldInfo: EntityFieldInfo, value: any, decimals: number = 2, currency: string = 'USD') {
        return entityFieldInfo.FormatValue(value, decimals, currency);
    }

    public FormatValue(fieldName: string, decimals: number = 2, currency: string = 'USD') {
        if (!this.record) 
            throw new Error('this.record not set');

        const f = (<BaseEntity>this.record).Fields.find(f => f.Name.trim().toLowerCase() === fieldName.trim().toLowerCase());
        if (!f) 
            throw new Error(`Field ${fieldName} not found in entity ${this.record.EntityInfo.Name}`);

        return f.FormatValue(decimals, currency);
    }
}