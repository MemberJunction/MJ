/** How a statement refers to one typed bind parameter, and the name the value is passed under. */
export interface TypedParameterReference {
    /** The text written into the statement where the value goes. */
    readonly Placeholder: string;
    /** The name the driver binds the value under; for a positional driver, the position's name (`$1`). */
    readonly Name: string;
}

/**
 * How values and errors cross between MJ and a dialect's database driver.
 */
export interface DialectBinding {
    /** The placeholder for the bind parameter at zero-based `index`. */
    ParameterPlaceholder(index: number): string;
    /**
     * The reference to the bind parameter at zero-based `index` whose value has the database type
     * `sqlType` (such as `nvarchar(100)` or `character varying(100)`). Where the driver declares
     * parameter types (SQL Server), the parameter is named and declared with that type; where it
     * binds untyped text (PostgreSQL), the placeholder casts it.
     */
    TypedParameter(index: number, sqlType: string): TypedParameterReference;
    /** The value to bind for a boolean parameter. */
    BooleanParameterValue(value: boolean): boolean | number;
    /** Whether an error the driver threw is a connection failure rather than a query error. */
    IsConnectionError(e: unknown): boolean;
}
