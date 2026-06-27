/**
 * The canonical set of SQL base types MJ recognizes.
 * Used for column typing, formatting decisions, and alignment.
 * Platform-specific mappings live in the SQLDialect package.
 */
export type SQLBaseType =
    | 'int' | 'bigint' | 'smallint' | 'tinyint'
    | 'decimal' | 'numeric' | 'float' | 'real' | 'money' | 'smallmoney'
    | 'nvarchar' | 'varchar' | 'char' | 'nchar' | 'text' | 'ntext'
    | 'bit'
    | 'uniqueidentifier'
    | 'datetime' | 'datetime2' | 'datetimeoffset' | 'date' | 'time' | 'smalldatetime'
    | 'varbinary' | 'binary' | 'image'
    | 'xml' | 'json'
    | 'geography' | 'geometry'
    | 'sql_variant';

/**
 * Base column descriptor. The minimum information needed to describe
 * a column of data: what it's called, what type it is, how to display it.
 */
export class ColumnDescriptor {
    /** Field name in the row data — the key used to access the value: row[field] */
    field: string;

    /** Human-readable display name for headers, labels, and tooltips */
    displayName?: string;

    /** SQL base type — source of truth for formatting in MJ */
    sqlBaseType?: SQLBaseType;

    /** Full SQL type with precision/scale: 'decimal(18,2)', 'nvarchar(255)' */
    sqlFullType?: string;

    /** Column width in pixels (hint for renderers) */
    width?: number;

    /** Human-readable description of what this column represents */
    description?: string;

    constructor(field: string) {
        this.field = field;
    }
}

/**
 * Column descriptor with MemberJunction entity lineage.
 * Enables entity linking, schema-aware formatting, and agent understanding
 * of where data originates.
 */
export class MJColumnDescriptor extends ColumnDescriptor {
    /** MJ entity name this column originates from (e.g., "Customers") */
    sourceEntity?: string;

    /** Field name in that entity (e.g., "ID", "FirstName") */
    sourceFieldName?: string;

    /** True for calculated expressions: CASE, ROUND, CONCAT, etc. */
    isComputed?: boolean;

    /** True for aggregate functions: SUM, COUNT, AVG, etc. */
    isSummary?: boolean;

    /** Create from a SimpleQueryFieldInfo (bridges legacy component data requirements) */
    static FromSimpleQueryField(field: {
        name: string;
        type?: string;
        sourceEntity?: string;
        sourceFieldName?: string;
        isSummary?: boolean;
        description?: string;
    }): MJColumnDescriptor {
        const result = new MJColumnDescriptor(field.name);
        result.sqlBaseType = field.type as SQLBaseType;
        result.sourceEntity = field.sourceEntity;
        result.sourceFieldName = field.sourceFieldName;
        result.isSummary = field.isSummary;
        result.description = field.description;
        return result;
    }

    /** Create from a base ColumnDescriptor + entity lineage */
    static FromColumnDescriptor(
        col: ColumnDescriptor,
        entityName: string,
        sourceFieldName?: string
    ): MJColumnDescriptor {
        const result = new MJColumnDescriptor(col.field);
        Object.assign(result, col);
        result.sourceEntity = entityName;
        result.sourceFieldName = sourceFieldName ?? col.field;
        return result;
    }
}

/**
 * Column descriptor with full display configuration for grid/table rendering.
 * Most consumers don't need this — it's specific to the grid renderer.
 */
export class GridColumnDescriptor extends MJColumnDescriptor {
    visible: boolean = true;
    sortable: boolean = true;
    resizable: boolean = true;
    reorderable: boolean = true;
    order: number = 0;
    align?: 'left' | 'center' | 'right';
    pinned?: 'left' | 'right' | null;
    minWidth?: number;
    maxWidth?: number;
    flex?: number;

    /** Create from an MJColumnDescriptor with sensible display defaults */
    static FromMJColumn(col: MJColumnDescriptor, order: number): GridColumnDescriptor {
        const result = new GridColumnDescriptor(col.field);
        Object.assign(result, col);
        result.order = order;
        return result;
    }

    /** Strip grid flags, returning just the data-level column info */
    ToMJColumn(): MJColumnDescriptor {
        const result = new MJColumnDescriptor(this.field);
        result.displayName = this.displayName;
        result.sqlBaseType = this.sqlBaseType;
        result.sqlFullType = this.sqlFullType;
        result.width = this.width;
        result.description = this.description;
        result.sourceEntity = this.sourceEntity;
        result.sourceFieldName = this.sourceFieldName;
        result.isComputed = this.isComputed;
        result.isSummary = this.isSummary;
        return result;
    }
}
