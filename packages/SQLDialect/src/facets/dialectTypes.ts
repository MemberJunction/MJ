/**
 * The SQL type names a dialect uses for each conceptual category, lower case and trimmed, as the
 * database's catalog reports them. A frozen plain object.
 */
export interface DialectTypes {
    /** Boolean column types. */
    readonly BooleanTypeNames: readonly string[];
    /** Variable-length character and text types. */
    readonly StringTypeNames: readonly string[];
    /** The subset of {@link StringTypeNames} that pads stored values with spaces to the declared length. */
    readonly FixedWidthStringTypeNames: readonly string[];
    /** Date, time and timestamp types. */
    readonly DateTypeNames: readonly string[];
    /** Integer types. */
    readonly IntegerTypeNames: readonly string[];
    /** Floating-point and decimal types. */
    readonly FloatTypeNames: readonly string[];
    /** UUID types. */
    readonly UuidTypeNames: readonly string[];
    /** Binary types. */
    readonly BinaryTypeNames: readonly string[];
    /** JSON and XML types. */
    readonly JsonTypeNames: readonly string[];
    /** Fixed-precision currency types. */
    readonly CurrencyTypeNames: readonly string[];
    /** Interval and duration types. */
    readonly IntervalTypeNames: readonly string[];
    /** Network address types. */
    readonly NetworkTypeNames: readonly string[];
}
