/**
 * @fileoverview How a record ID is matched in memory: a UUID by its normalised form, any other key as it is.
 * @module @memberjunction/record-set-processor-base
 */
import { IsValidUUID, NormalizeUUID } from '@memberjunction/global';

/** In-memory matching of `RecordRef.RecordID` values against IDs a database returned. */
export class RecordIDs {
    /**
     * The key a record ID is matched under: a UUID normalised by case (SQL Server returns UUIDs upper-case, a caller's
     * scope may give them lower-case), any other ID (a composite key segment, a case-sensitive natural key) unchanged.
     * For in-memory maps only; never interpolate the result into SQL.
     */
    public static Key(recordID: string): string {
        return IsValidUUID(recordID) ? NormalizeUUID(recordID) : recordID;
    }
}
