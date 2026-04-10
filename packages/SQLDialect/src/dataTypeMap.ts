/**
 * Represents a mapped data type from one database platform to another.
 */
export interface MappedType {
    /** The target platform data type name (e.g., "VARCHAR", "UUID", "BOOLEAN") */
    typeName: string;
    /** Whether the type supports a length parameter (e.g., VARCHAR(255)) */
    supportsLength: boolean;
    /** Whether the type supports precision/scale (e.g., NUMERIC(10,2)) */
    supportsPrecisionScale: boolean;
    /** Default length if applicable */
    defaultLength?: number;
}

/**
 * Maps data types from one database platform to another.
 * Each dialect provides its own DataTypeMap implementation.
 */
export interface DataTypeMap {
    /**
     * Maps a source database type to the target platform type.
     * @param sourceType - The source database type name (case-insensitive)
     * @param sourceLength - Optional length from the source type definition
     * @param sourcePrecision - Optional precision from the source type definition
     * @param sourceScale - Optional scale from the source type definition
     * @returns The mapped type for the target platform
     */
    MapType(sourceType: string, sourceLength?: number, sourcePrecision?: number, sourceScale?: number): MappedType;

    /**
     * Returns the full type string with length/precision/scale as needed.
     * E.g., "VARCHAR(255)" or "NUMERIC(10,2)" or "UUID"
     */
    MapTypeToString(sourceType: string, sourceLength?: number, sourcePrecision?: number, sourceScale?: number): string;
}
