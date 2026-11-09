import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import { join, relative, resolve } from 'path';

/**
 * Explorer loads Font Awesome FREE, so an icon only Font Awesome Pro has renders blank, and nothing short of looking
 * at the screen shows it (`fa-waveform-lines` did, on the Realtime Recordings list: #5342). This guard reads the
 * realtime dashboards' templates and component files and fails on any `fa-*` class that the Free stylesheet has no
 * rule for. A rule covers glyphs (`.fa-microphone`), styles (`.fa-solid`) and utilities (`.fa-fw`, `.fa-spin`) alike:
 * the test the realtime widget's build applies to the surfaces it ships
 * (`realtime-widget/scripts/build-global-styles.mjs`).
 *
 * It covers the realtime dashboards only. The rest of this package still uses Pro-only icons, which have to be
 * replaced before the scan can widen to it.
 */

const SRC_DIR = resolve(__dirname, '..');

/** The realtime dashboards in this package. */
const REALTIME_DIRS = ['RealtimeRecordings', 'AI/components/analytics/realtime'].map((dir) => join(SRC_DIR, dir));

/** Font Awesome Free's whole stylesheet (solid, regular, brands and the utilities), the file Explorer loads. */
const FREE_CSS = readFileSync(createRequire(__filename).resolve('@fortawesome/fontawesome-free/css/all.min.css'), 'utf8');

/** An `fa-*` class. The lookbehind skips custom properties such as `--fa-primary-color`. */
const FA_CLASS = /(?<![\w-])fa-[a-z0-9]+(?:-[a-z0-9]+)*/g;

/** Whether the Free stylesheet has a rule for the class. */
function isFree(name: string): boolean {
    return new RegExp(`\\.${name}[{,:]`).test(FREE_CSS);
}

/** The `.ts` and `.html` files under a folder. Specs are left out: the icons in them are test data. */
function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            return sourceFiles(path);
        }
        return /\.(ts|html)$/.test(entry.name) && !/\.(test|spec)\.ts$/.test(entry.name) ? [path] : [];
    });
}

/** Each `fa-*` class the files use, with the files that use it. */
function iconClasses(files: string[]): Map<string, string[]> {
    const found = new Map<string, string[]>();
    for (const file of files) {
        for (const name of new Set(readFileSync(file, 'utf8').match(FA_CLASS) ?? [])) {
            found.set(name, [...(found.get(name) ?? []), relative(SRC_DIR, file)]);
        }
    }
    return found;
}

describe('realtime dashboard icons are in Font Awesome Free (#5342)', () => {
    it('tells a Free icon from a Pro-only one', () => {
        expect(isFree('fa-wave-square')).toBe(true);
        expect(isFree('fa-solid')).toBe(true);
        expect(isFree('fa-fw')).toBe(true);
        expect(isFree('fa-waveform-lines')).toBe(false);
    });

    it('uses no icon that Font Awesome Free lacks', () => {
        const found = iconClasses(REALTIME_DIRS.flatMap(sourceFiles));
        expect(found.size).toBeGreaterThan(0);
        const missing = [...found].filter(([name]) => !isFree(name)).map(([name, files]) => `${name} (${files.join(', ')})`);
        expect(missing, 'not in Font Awesome Free, so they render blank; use a Free icon').toEqual([]);
    });
});
