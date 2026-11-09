import { describe, it, expect } from 'vitest';
import QueueBacklog from '../commands/queue/backlog.js';
import QueueDeadLetters from '../commands/queue/dead-letters.js';
import QueueDiscard from '../commands/queue/discard.js';
import QueueExportTopology from '../commands/queue/export-topology.js';
import QueueImportBindings from '../commands/queue/import-bindings.js';
import QueuePartitions from '../commands/queue/partitions.js';
import QueuePublish from '../commands/queue/publish.js';
import QueueReplay from '../commands/queue/replay.js';
import QueueStats from '../commands/queue/stats.js';
import QueueValidateBindings from '../commands/queue/validate-bindings.js';
import QueueWork from '../commands/queue/work.js';

interface FlagSurface {
    required?: boolean;
    dependsOn?: string[];
}

type CommandSurface = { flags: Record<string, FlagSurface> };

const COMMANDS: Array<[string, CommandSurface, string[], string[]]> = [
    ['publish', QueuePublish, ['attribute', 'count', 'dedup-key', 'json', 'partition-key', 'payload', 'topic'], ['topic']],
    ['stats', QueueStats, ['json', 'subscription'], []],
    ['dead-letters', QueueDeadLetters, ['cursor', 'json', 'page-size', 'subscription'], ['subscription']],
    ['partitions', QueuePartitions, ['condition', 'cursor', 'json', 'page-size', 'subscription'], ['subscription']],
    ['replay', QueueReplay, ['delivery', 'note', 'subscription'], ['delivery', 'subscription']],
    ['discard', QueueDiscard, ['delivery', 'reason', 'subscription'], ['delivery', 'reason', 'subscription']],
    ['backlog', QueueBacklog, ['json', 'subscription'], ['subscription']],
    ['work', QueueWork, ['concurrency', 'idle-exit-ms', 'max', 'max-duration-ms', 'once', 'shutdown-drain-ms', 'subscription'], ['subscription']],
    ['export-topology', QueueExportTopology, ['output', 'transport'], ['transport']],
    ['import-bindings', QueueImportBindings, ['json'], []],
    ['validate-bindings', QueueValidateBindings, ['json', 'transport'], []],
];

describe('mj queue command surface', () => {
    it('declares exactly the documented flags', () => {
        for (const [name, command, flags] of COMMANDS) {
            expect(Object.keys(command.flags).sort(), name).toEqual(flags);
        }
    });

    it('marks the documented flags and arguments required', () => {
        for (const [name, command, , required] of COMMANDS) {
            const actual = Object.entries(command.flags).filter(([, flag]) => flag.required === true).map(([flag]) => flag).sort();
            expect(actual, name).toEqual(required);
        }
        expect(QueueImportBindings.args.file.required).toBe(true);
    });

    it('ties the one-shot flags to --once', () => {
        const flags: Record<string, FlagSurface> = QueueWork.flags;
        for (const name of ['max', 'idle-exit-ms', 'max-duration-ms']) {
            expect(flags[name].dependsOn, name).toEqual(['once']);
        }
    });

    it('keeps only the text-only pages light', async () => {
        const { LIGHT_COMMANDS } = await import('../light-commands.js');
        expect(['queue', 'queue usage', 'queue:usage'].every(id => LIGHT_COMMANDS.has(id))).toBe(true);
        expect(['queue stats', 'queue work', 'queue backlog'].some(id => LIGHT_COMMANDS.has(id))).toBe(false);
    });
});
