/**
 * Every LIGHT_COMMANDS entry must be spelled the way oclif spells command ids (plan §16.3 #14).
 *
 * oclif ids are colon-separated — `cache:clear` — regardless of `topicSeparator: ' '`, which only
 * affects how a user types the command. The prerun hook matches `options.Command.id` against this
 * set, so a space-form entry never matches and the command silently pays the full bootstrap it was
 * listed here to avoid. Six entries were dead that way, including `codegen manifest`, whose own
 * comment says it must be light to break a build cycle.
 *
 * The pre-existing tests only asserted set membership, which is why they passed while the ids were
 * unusable. This one compares against the manifest oclif itself generates.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LIGHT_COMMANDS } from '../light-commands';

/** Command ids oclif knows about, from the generated manifest (absent before a build). */
function manifestCommandIds(): Set<string> | null {
    const path = join(__dirname, '..', '..', 'oclif.manifest.json');
    if (!existsSync(path)) {
        return null;
    }
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as { commands?: Record<string, unknown> };
    return new Set(Object.keys(manifest.commands ?? {}));
}

describe('LIGHT_COMMANDS spelling', () => {
    it('contains a colon-form id for every multi-word command', () => {
        const spaceOnly = [...LIGHT_COMMANDS]
            .filter(id => id.includes(' '))
            .filter(id => !LIGHT_COMMANDS.has(id.replace(/ /g, ':')));

        expect(spaceOnly, 'these entries can never match an oclif command id').toEqual([]);
    });

    it('every colon-form entry is a command oclif actually has', () => {
        const known = manifestCommandIds();
        if (!known) {
            return; // no manifest in this working tree; the build generates it
        }
        const unknown = [...LIGHT_COMMANDS]
            .filter(id => id.includes(':'))
            .filter(id => !known.has(id))
            // A topic prefix (`dev:workspace`) is a legitimate entry even though it is not itself a
            // command: the hook also matches topics so every command under them stays light.
            .filter(id => ![...known].some(command => command.startsWith(`${id}:`)));

        expect(unknown, 'listed as light but not a known command or topic').toEqual([]);
    });

    it('no entry is empty or padded', () => {
        for (const id of LIGHT_COMMANDS) {
            expect(id).toBe(id.trim());
            expect(id.length).toBeGreaterThan(0);
        }
    });
});
