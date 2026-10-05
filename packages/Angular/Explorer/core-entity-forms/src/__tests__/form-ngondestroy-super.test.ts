import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `BaseFormComponent.ngOnDestroy` unsubscribes the root-singleton FormStateService stream and disposes
 * the duplicate-entry check. A `*FormComponentExtended` that overrides `ngOnDestroy` without calling
 * `super.ngOnDestroy()` leaves one live subscriber (pinning the destroyed form) per form ever opened.
 */
const customDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'custom');

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return sourceFiles(full);
        return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [full] : [];
    });
}

/** Body of the first `ngOnDestroy` method, found by brace matching. */
function ngOnDestroyBody(source: string): string | null {
    const match = /\bngOnDestroy\s*\(\s*\)\s*(?::\s*void\s*)?\{/.exec(source);
    if (!match) return null;
    let depth = 1;
    let i = match.index + match[0].length;
    for (; i < source.length && depth > 0; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') depth--;
    }
    return source.slice(match.index + match[0].length, i - 1);
}

describe('custom form components that override ngOnDestroy', () => {
    const extendedForms = sourceFiles(customDir)
        .map((file) => ({ file, source: readFileSync(file, 'utf8') }))
        .filter(({ source }) => /export class \w+FormComponentExtended\b/.test(source));

    it('finds the extended forms', () => {
        expect(extendedForms.length).toBeGreaterThan(10);
    });

    it.each(extendedForms.map(({ file, source }) => [file.slice(customDir.length + 1), source] as const))(
        '%s calls super.ngOnDestroy()',
        (_name, source) => {
            const body = ngOnDestroyBody(source);
            if (body === null) return; // inherits the base implementation
            expect(body).toContain('super.ngOnDestroy()');
        }
    );
});
