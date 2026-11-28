import { beforeAll, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MJGlobal } from '@memberjunction/global';
import { BaseTransportDriverFactory, ManifestEnricherRegistry } from '@memberjunction/work-queue-engine';

const QUEUE_COMMANDS = join(dirname(fileURLToPath(import.meta.url)), '..', 'commands', 'queue');
const AZURE_IMPORT = /^import '@memberjunction\/work-queue-engine\/azure';$/m;
const NEEDS_AZURE = ['export-topology', 'import-bindings', 'validate-bindings', 'work'];
const MUST_NOT = ['index', 'stats', 'backlog', 'dead-letters', 'replay', 'discard', 'partitions', 'publish', 'usage'];

/**
 * Budget for the one cold load of a queue command module, which loads the Azure transport: ~18 s alone on a dev machine,
 * over 120 s inside a full-repo test run (PR 5 wave-4 full mirror). It is a hook timeout, so the load is never counted
 * against the test's own timeout (D-091 item 13).
 */
const MODULE_LOAD_TIMEOUT_MS = 300_000;

describe('mj queue commands and the Azure transport', () => {
    let loaded: PromiseSettledResult<typeof import('../commands/queue/validate-bindings')>;

    // The command module loads once, here: the test below asserts on what the load registered, not on how long it took.
    beforeAll(async () => {
        [loaded] = await Promise.allSettled([import('../commands/queue/validate-bindings')]);
    }, MODULE_LOAD_TIMEOUT_MS);

    it('registers the Azure driver factory and manifest enricher when a cloud command module loads', () => {
        expect(loaded.status === 'rejected' ? loaded.reason : null).toBeNull();
        const factory = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTransportDriverFactory>(BaseTransportDriverFactory, 'Azure');
        expect(factory.Resolved).toBe(true);
        expect(ManifestEnricherRegistry.Instance.Has('Azure')).toBe(true);
    });

    it.each(NEEDS_AZURE)('%s imports the engine ./azure subpath statically', (name) => {
        expect(readFileSync(join(QUEUE_COMMANDS, `${name}.ts`), 'utf8')).toMatch(AZURE_IMPORT);
    });

    it.each(MUST_NOT)('%s does not load the Azure transport', (name) => {
        expect(readFileSync(join(QUEUE_COMMANDS, `${name}.ts`), 'utf8')).not.toContain('work-queue-engine/azure');
    });
});
