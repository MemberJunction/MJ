/**
 * Tests for the Open App client-bootstrap generator.
 *
 * app.module.ts side-effect-imports the generated file, so it must ALWAYS be a valid ES
 * module — including when there are no active imports (no apps, or every app disabled, so
 * every import is commented out). The generator therefore always emits a trailing `export {};`
 * to match the ensure-script stub and avoid leaving a comment-only "global script" file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
    writeFileSync: vi.fn(),
}));

import { writeFileSync } from 'node:fs';
import { RegenerateClientBootstrap, type ClientBootstrapEntry } from '../install/client-bootstrap-gen.js';

const mockWriteFileSync = vi.mocked(writeFileSync);

function generated(entries: ClientBootstrapEntry[]): string {
    RegenerateClientBootstrap('/repo', entries);
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    return mockWriteFileSync.mock.calls[0][1] as string;
}

function entry(name: string, pkg: string, enabled: boolean): ClientBootstrapEntry {
    return { AppName: name, Version: '1.0.0', PackageName: pkg, Enabled: enabled };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('RegenerateClientBootstrap — always a valid ES module', () => {
    it('emits export {} when there are no installed apps', () => {
        const content = generated([]);
        expect(content).toContain('No Open Apps installed');
        expect(content).toContain('export {};');
    });

    it('emits export {} when every app is disabled (all imports commented out)', () => {
        const content = generated([entry('acme', '@acme/client', false)]);
        // The import is commented out — without the trailing marker the file would be a
        // comment-only global script, not a module.
        expect(content).toContain("// import '@acme/client';");
        expect(content).not.toContain("\nimport '@acme/client';"); // not an active import
        expect(content).toContain('export {};');
    });

    it('emits an active import for an enabled app (still a module)', () => {
        const content = generated([entry('acme', '@acme/client', true)]);
        expect(content).toContain("import '@acme/client';");
        expect(content).toContain('export {};');
    });

    it('imports enabled apps and comments out disabled ones in one file', () => {
        const content = generated([
            entry('on', '@on/client', true),
            entry('off', '@off/client', false),
        ]);
        expect(content).toContain("import '@on/client';");
        expect(content).toContain("// import '@off/client';");
        expect(content).toContain('export {};');
    });
});
