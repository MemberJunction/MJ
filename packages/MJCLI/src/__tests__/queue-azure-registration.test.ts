import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MJGlobal } from '@memberjunction/global';
import { BaseTransportDriverFactory, ManifestEnricherRegistry } from '@memberjunction/work-queue-engine';

const QUEUE_COMMANDS = join(dirname(fileURLToPath(import.meta.url)), '..', 'commands', 'queue');
const AZURE_IMPORT = /^import '@memberjunction\/work-queue-engine\/azure';$/m;
const NEEDS_AZURE = ['export-topology', 'import-bindings', 'validate-bindings', 'work'];
const MUST_NOT = ['index', 'stats', 'backlog', 'dead-letters', 'replay', 'discard', 'partitions', 'publish', 'usage'];

describe('mj queue commands and the Azure transport', () => {
    it('registers the Azure driver factory and manifest enricher when a cloud command module loads', async () => {
        await import('../commands/queue/validate-bindings');
        const factory = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTransportDriverFactory>(BaseTransportDriverFactory, 'Azure');
        expect(factory.Resolved).toBe(true);
        expect(ManifestEnricherRegistry.Instance.Has('Azure')).toBe(true);
    }, 120_000);

    it.each(NEEDS_AZURE)('%s imports the engine ./azure subpath statically', (name) => {
        expect(readFileSync(join(QUEUE_COMMANDS, `${name}.ts`), 'utf8')).toMatch(AZURE_IMPORT);
    });

    it.each(MUST_NOT)('%s does not load the Azure transport', (name) => {
        expect(readFileSync(join(QUEUE_COMMANDS, `${name}.ts`), 'utf8')).not.toContain('work-queue-engine/azure');
    });
});
