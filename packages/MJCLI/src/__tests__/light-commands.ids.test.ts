/**
 * Every LIGHT_COMMANDS entry must be spelled the way oclif spells command ids.
 *
 * oclif ids are colon-separated — `cache:clear` — regardless of `topicSeparator: ' '`, which only
 * affects how a user types the command. The prerun hook matches `options.Command.id` against this
 * set, so a space-form entry never matches and the command silently pays the full bootstrap it was
 * listed here to avoid. Six entries were dead that way, including `codegen manifest`, whose own
 * comment says it must be light to break a build cycle.
 *
 * The pre-existing tests only asserted set membership, which is why they passed while the ids were
 * unusable. This one compares against the manifest oclif itself generates — and skips VISIBLY when
 * that manifest is absent, rather than returning early and reporting a pass it never earned.
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

    it('every colon-form entry is a command oclif actually has', (ctx) => {
        const known = manifestCommandIds();
        if (!known) {
            // Skip VISIBLY rather than return. A test that quietly passes when its input is missing
            // is indistinguishable from one that checked something, and this whole file exists
            // because a check that could not fail was mistaken for a passing one.
            ctx.skip('oclif.manifest.json is absent — run the package build first');
            return;
        }
        // The hook matches EXACTLY: `LIGHT_COMMANDS.has(options.Command.id)` in hooks/prerun.ts.
        // There is no topic-prefix matching, so a topic entry such as `dev:workspace` makes nothing
        // light — every command that should skip the bootstrap must be listed by its own id. An
        // earlier version of this test allowed topic prefixes and said the hook matched them; it
        // does not, and the allowance would have hidden exactly the dead entries this file is for.
        const unknown = [...LIGHT_COMMANDS]
            .filter(id => id.includes(':'))
            .filter(id => !known.has(id));

        expect(unknown, 'listed as light but not a command oclif has — the hook matches ids exactly, so these do nothing').toEqual([]);
    });

    it('no entry is empty or padded', () => {
        for (const id of LIGHT_COMMANDS) {
            expect(id).toBe(id.trim());
            expect(id.length).toBeGreaterThan(0);
        }
    });
});
