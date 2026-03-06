import { logError } from "./status_logging";
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
            return a.localeCompare(b);
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
 * Sorts an array of items by Sequence, then by __mj_CreatedAt, then alphabetically by a
 * type-appropriate name field, and finally by ID as a last-resort tiebreaker. This ensures
 * that generated code maintains the same order across multiple CodeGen runs and different
 * database environments, even when Sequence values are identical (e.g., all 0) and
 * CreatedAt timestamps match (e.g., batch-inserted rows).
 *
 * The alphabetical tiebreaker checks, in order:
 *   - Value (EntityFieldValueInfo)
 *   - Name (EntityFieldInfo)
 *   - RelatedEntityJoinField (EntityRelationshipInfo)
 *   - ID (universal last resort — all types have this)
 *
 * @param items - Array of items that have Sequence and optional date/name properties
 * @returns A new sorted array
 */
export function sortBySequenceAndCreatedAt<T extends { Sequence: number; __mj_CreatedAt?: Date; Value?: string; Name?: string; RelatedEntityJoinField?: string; ID?: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => {
        // Primary sort by Sequence
        if (a.Sequence !== b.Sequence) {
            return a.Sequence - b.Sequence;
        }
        // Secondary sort by __mj_CreatedAt for consistent ordering
        if (a.__mj_CreatedAt && b.__mj_CreatedAt) {
            const timeDiff = a.__mj_CreatedAt.getTime() - b.__mj_CreatedAt.getTime();
            if (timeDiff !== 0) return timeDiff;
        }
        // If one has a date and the other doesn't, prioritize the one with a date
        if (a.__mj_CreatedAt && !b.__mj_CreatedAt) return -1;
        if (!a.__mj_CreatedAt && b.__mj_CreatedAt) return 1;

        // Alphabetical tiebreakers — try type-appropriate name fields in order
        // Value (EntityFieldValueInfo)
        if (a.Value != null && b.Value != null) {
            const cmp = a.Value.localeCompare(b.Value);
            if (cmp !== 0) return cmp;
        } else if (a.Value != null && b.Value == null) return -1;
        else if (a.Value == null && b.Value != null) return 1;

        // Name (EntityFieldInfo)
        if (a.Name != null && b.Name != null) {
            const cmp = a.Name.localeCompare(b.Name);
            if (cmp !== 0) return cmp;
        }

        // RelatedEntityJoinField (EntityRelationshipInfo)
        if (a.RelatedEntityJoinField != null && b.RelatedEntityJoinField != null) {
            const cmp = a.RelatedEntityJoinField.localeCompare(b.RelatedEntityJoinField);
            if (cmp !== 0) return cmp;
        }

        // Last resort: sort by ID for absolute determinism
        if (a.ID != null && b.ID != null) {
            return a.ID.localeCompare(b.ID);
        }
        return 0;
    });
}