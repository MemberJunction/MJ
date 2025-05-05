import { logError } from "./status_logging";
import { unlinkSync } from "fs-extra";

const fs = require('fs');
const fse = require('fs-extra');
const glob = require('glob');
const path = require('path');

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
      fse.copySync(sourceDir, destDir, { overwrite: true })
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

export async function combineFiles(directory: string, combinedFileName: string, pattern: string, overwriteExistingFile: boolean): Promise<void> {
    const combinedFilePath = path.join(directory, combinedFileName);

    try {
        // Check if the combined file exists and if overwriteExistingFile is false, skip the process
        const fileExists = await fs.promises.access(combinedFilePath)
            .then(() => true)
            .catch(() => false);

        if (fileExists && !overwriteExistingFile) {
            console.log(`File ${combinedFileName} already exists. Skipping the process as overwriteExistingFile is set to false.`);
            return;
        }

        // Use promisified glob to find files that match the pattern
        const files = await new Promise<string[]>((resolve, reject) => {
            glob(pattern, { cwd: directory }, (err: Error | null, matches: string[]) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(matches.filter((file: string) => file !== combinedFileName));
            });
        });

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

        // Read all files in parallel for better performance
        const fileContents = await Promise.all(
            files.map(async (file: string) => {
                const filePath = path.join(directory, file);
                return await fs.promises.readFile(filePath, 'utf8');
            })
        );

        // Combine the contents
        const combinedContent = fileContents.join('\n\n\n');

        // Write the combined content to the specified file
        await fs.promises.writeFile(combinedFilePath, combinedContent);
    } catch (error) {
        logError(`Error combining files in directory ${directory}: ${error}`);
        throw error;
    }
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