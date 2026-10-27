/**
 * How values and errors cross between MJ and a dialect's database driver.
 */
export interface DialectBinding {
    /** The placeholder for the bind parameter at zero-based `index`. */
    ParameterPlaceholder(index: number): string;
    /** The value to bind for a boolean parameter. */
    BooleanParameterValue(value: boolean): boolean | number;
    /** Whether an error the driver threw is a connection failure rather than a query error. */
    IsConnectionError(e: unknown): boolean;
}
