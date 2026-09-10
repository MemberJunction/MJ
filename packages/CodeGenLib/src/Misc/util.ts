import { logError } from "./status_logging";
import { ordinalCompare } from "@memberjunction/global";
import fs, { unlinkSync } from "fs";
import fsExtra from 'fs-extra';
import { globSync } from 'glob';
import path from 'path';

export function makeDirs(dirPaths: string[]) {
    for (let i = 0; i < dirPaths.length; i++) {
        makeDir(dirPaths[i]);
    }
}

export function makeDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

export function copyDir(sourceDir: string, destDir: string) {
    // To copy a folder or file, select overwrite accordingly
    try {
      fsExtra.copySync(sourceDir, destDir, { overwrite: true })
    } catch (err) {
      logError(err as string)
    }

}

export async function attemptDeleteFile(filePath: string, maxRetries: number, repeatDelay: number): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        unlinkSync(filePath);
        return; // if we get here without an exception, we're good, move on
      } 
      catch (err) {
        if ((err as any).code === 'ENOENT') {
          // file doesn't exist, so just ignore this and move on
          return;
        }
        else if ((err as any).code === 'EBUSY') {
          await new Promise(resolve => setTimeout(resolve, repeatDelay));
        } 
        else {
          console.warn(`    Failed to delete file ${filePath}: ${(err as any).message}`);
          return;
        }
      }
    }
  }

export function combineFiles(directory: string, combinedFileName: string, pattern: string, overwriteExistingFile: boolean): void {
    const combinedFilePath = path.join(directory, combinedFileName);

    // Check if the combined file exists and if overwriteExistingFile is false, skip the process
    if (fs.existsSync(combinedFilePath) && !overwriteExistingFile) {
        console.log(`File ${combinedFileName} already exists. Skipping the process as overwriteExistingFile is set to false.`);
        return;
    }

    // Use globSync to find files that match the pattern synchronously, excluding the combinedFileName
    const files = globSync(pattern, { cwd: directory }).filter((file: string) => file !== combinedFileName);

    // Sort the files so that files ending with '.generated.sql' come before '.permissions.generated.sql'
    files.sort((a: string, b: string) => {
        const isAPermissions = a.includes('.permissions.generated.sql');
        const isBPermissions = b.includes('.permissions.generated.sql');
        if (isAPermissions && !isBPermissions) {
            return 1;
        } else if (!isAPermissions && isBPermissions) {
            return -1;
        } else {
            return ordinalCompare(a, b);
        }
    });

    let combinedContent = '';
    files.forEach((file: string) => {
        const filePath = path.join(directory, file);
        combinedContent += fs.readFileSync(filePath, 'utf8') + '\n\n\n';
    });

    // Write the combined content to the specified file
    fs.writeFileSync(combinedFilePath, combinedContent);
}


/**
 * Logs the provided params to the console if the shouldLog parameter is true
 * @param shouldLog 
 */
export function logIf(shouldLog: boolean, ...args: any[]) {
    if (shouldLog) {
        console.log(...args);
    }
}

/**
 * Sorts an array of items by Sequence, then alphabetically by a type-appropriate name field,
 * and finally by ID as a last-resort tiebreaker. This ensures that generated code maintains
 * the same order across multiple CodeGen runs **and across different database environments**,
 * even when Sequence values are identical (e.g., all 0 or all 1).
 *
 * Why no `__mj_CreatedAt` tiebreaker: timestamps are set with `GETUTCDATE()` at insert time
 * and diverge per environment (the dev who originally generated metadata gets one set of
 * timestamps; a clean install via Flyway gets another, batched into the same SQL Server tick).
 * Using them as a sort key made codegen output a function of DB-resident insertion history
 * rather than of metadata identity, which is the root cause of the long-running "flip-flop"
 * non-determinism. Codegen output must be a pure function of metadata identity.
 *
 * The alphabetical tiebreaker checks, in order:
 *   - Value (EntityFieldValueInfo)
 *   - Name (EntityFieldInfo)
 *   - RelatedEntityJoinField (EntityRelationshipInfo)
 *   - ID (universal last resort — all types have this)
 *
 * @param items - Array of items that have Sequence and optional name properties
 * @returns A new sorted array
 */
export function sortBySequenceAndCreatedAt<T extends { Sequence: number; __mj_CreatedAt?: Date; Value?: string; Name?: string; RelatedEntityJoinField?: string; ID?: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => {
        // Primary sort by Sequence
        if (a.Sequence !== b.Sequence) {
            return a.Sequence - b.Sequence;
        }

        // Alphabetical tiebreakers — try type-appropriate name fields in order
        // Value (EntityFieldValueInfo)
        if (a.Value != null && b.Value != null) {
            const cmp = ordinalCompare(a.Value, b.Value);
            if (cmp !== 0) return cmp;
        } else if (a.Value != null && b.Value == null) return -1;
        else if (a.Value == null && b.Value != null) return 1;

        // Name (EntityFieldInfo)
        if (a.Name != null && b.Name != null) {
            const cmp = ordinalCompare(a.Name, b.Name);
            if (cmp !== 0) return cmp;
        }

        // RelatedEntityJoinField (EntityRelationshipInfo)
        if (a.RelatedEntityJoinField != null && b.RelatedEntityJoinField != null) {
            const cmp = ordinalCompare(a.RelatedEntityJoinField, b.RelatedEntityJoinField);
            if (cmp !== 0) return cmp;
        }

        // Last resort: sort by ID for absolute determinism
        if (a.ID != null && b.ID != null) {
            return ordinalCompare(a.ID, b.ID);
        }
        return 0;
    });
}

/**
 * Sorts EntityRelationshipInfo items deterministically and **environment-independently**.
 * Sort order: Sequence → RelatedEntity name → RelatedEntityJoinField → ID.
 *
 * `__mj_CreatedAt` is intentionally NOT used as a tiebreaker — see
 * {@link sortBySequenceAndCreatedAt} for the rationale. Batch-inserted relationships
 * routinely share Sequence values (especially when CodeGen mis-keys the Sequence counter,
 * a separate bug), so the alphabetical tiebreakers are doing the real work of stabilizing
 * the order across environments.
 */
export function sortRelatedEntities<T extends { Sequence: number; __mj_CreatedAt?: Date; RelatedEntity?: string; RelatedEntityJoinField?: string; ID?: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => {
        // Primary sort by Sequence
        if (a.Sequence !== b.Sequence) {
            return a.Sequence - b.Sequence;
        }

        // Tiebreaker: RelatedEntity name (the display name of the related entity)
        if (a.RelatedEntity != null && b.RelatedEntity != null) {
            const cmp = ordinalCompare(a.RelatedEntity, b.RelatedEntity);
            if (cmp !== 0) return cmp;
        }

        // Tiebreaker: RelatedEntityJoinField (FK column name)
        if (a.RelatedEntityJoinField != null && b.RelatedEntityJoinField != null) {
            const cmp = ordinalCompare(a.RelatedEntityJoinField, b.RelatedEntityJoinField);
            if (cmp !== 0) return cmp;
        }

        // Last resort: ID
        if (a.ID != null && b.ID != null) {
            return ordinalCompare(a.ID, b.ID);
        }
        return 0;
    });
}

/**
 * Serializes a value to JSON with recursively sorted object keys, ensuring deterministic
 * string representations across runs regardless of property insertion order.
 *
 * @param value - Value to serialize
 * @param space - Optional indentation (e.g. 2 for pretty-printed JSON)
 */
export function canonicalJSONStringify(value: unknown, space?: number | string): string {
    return JSON.stringify(sortKeysRecursively(value), null, space);
}

function sortKeysRecursively(value: unknown): unknown {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(sortKeysRecursively);
    }
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort(ordinalCompare);
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
        result[key] = sortKeysRecursively(obj[key]);
    }
    return result;
}

/**
 * Deep structural equality comparison for JSON-serializable objects and primitives.
 */
export function deepEqualJSON(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;

    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!deepEqualJSON(a[i], b[i])) return false;
        }
        return true;
    }

    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
        if (!Object.prototype.hasOwnProperty.call(objB, key)) return false;
        if (!deepEqualJSON(objA[key], objB[key])) return false;
    }
    return true;
}