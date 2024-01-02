const fs = require('fs');
const fse = require('fs-extra');

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
      console.error(err)
    }

}