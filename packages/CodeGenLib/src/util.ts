import { logError, logStatus } from "./logging";

const fs = require('fs');
const fse = require('fs-extra');
const glob = require('glob');
const path = require('path');

export function replaceAllSpaces(s: string): string {
    if (s.includes(' '))
        return replaceAllSpaces(s.replace(' ', '')); // recursive case
    else // base case
        return s;
}

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
      logError(err)
    }

}

export function combineFiles(directory: string, combinedFileName: string, pattern: string, overwriteExistingFile: boolean): void {
    const combinedFilePath = path.join(directory, combinedFileName);

    // Check if the combined file exists and if overwriteExistingFile is false, skip the process
    if (fs.existsSync(combinedFilePath) && !overwriteExistingFile) {
        console.log(`File ${combinedFileName} already exists. Skipping the process as overwriteExistingFile is set to false.`);
        return;
    }

    // Use glob.sync to find files that match the pattern synchronously, excluding the combinedFileName
    const files = glob.sync(pattern, { cwd: directory }).filter(file => file !== combinedFileName);

    // Sort the files so that files ending with '.generated.sql' come before '.permissions.generated.sql'
    files.sort((a, b) => {
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
    files.forEach(file => {
        const filePath = path.join(directory, file);
        combinedContent += fs.readFileSync(filePath, 'utf8') + '\n\n\n';
    });

    // Write the combined content to the specified file
    fs.writeFileSync(combinedFilePath, combinedContent);
    console.log(`Combined file created at ${combinedFilePath}`);
}

// Usage example
//combineFiles('path/to/directory', 'combinedFile.sql', '*.permissions.generated.sql', true);
