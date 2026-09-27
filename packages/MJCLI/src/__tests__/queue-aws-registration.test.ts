import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MJGlobal } from '@memberjunction/global';
import { BaseTransportDriverFactory, ManifestEnricherRegistry } from '@memberjunction/work-queue-engine';

const QUEUE_COMMANDS = join(dirname(fileURLToPath(import.meta.url)), '..', 'commands', 'queue');
const AWS_IMPORT = /^import '@memberjunction\/work-queue-engine\/aws';$/m;
const AZURE_IMPORT = /^import '@memberjunction\/work-queue-engine\/azure';$/m;
const NEEDS_AWS = ['export-topology', 'import-bindings', 'validate-bindings', 'work'];
const MUST_NOT = ['index', 'stats', 'backlog', 'dead-letters', 'replay', 'discard', 'partitions', 'publish', 'usage'];

describe('mj queue commands and the AWS transport', () => {
    it('registers the AWS and Azure driver factories and manifest enrichers when a cloud command module loads', async () => {
        await import('../commands/queue/validate-bindings');
        for (const driverClass of ['AWS', 'Azure']) {
            const factory = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTransportDriverFactory>(BaseTransportDriverFactory, driverClass);
            expect(factory.Resolved).toBe(true);
            expect(ManifestEnricherRegistry.Instance.Has(driverClass)).toBe(true);
        }
    });

    it.each(NEEDS_AWS)('%s imports the engine ./aws and ./azure subpaths statically', (name) => {
        const source = readFileSync(join(QUEUE_COMMANDS, `${name}.ts`), 'utf8');
        expect(source).toMatch(AWS_IMPORT);
        expect(source).toMatch(AZURE_IMPORT);
    });

    it.each(MUST_NOT)('%s does not load a cloud transport', (name) => {
        const source = readFileSync(join(QUEUE_COMMANDS, `${name}.ts`), 'utf8');
        expect(source).not.toContain('work-queue-engine/aws');
        expect(source).not.toContain('work-queue-engine/azure');
    });
});
