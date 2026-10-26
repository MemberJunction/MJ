/**
 * The A2A server never picks an arbitrary user to act as. Whichever user happens to be first in
 * the user cache is not an identity: work done on behalf of a caller runs as that caller, and
 * server-internal work names the identity it runs as.
 *
 * Server.ts starts the HTTP server and connects to the database when imported, so this guard reads
 * its source instead.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const source = readFileSync(fileURLToPath(new URL('../Server.ts', import.meta.url)), 'utf8');

describe('A2A Server identity', () => {
    it('never falls back to the first cached user', () => {
        expect(source).not.toMatch(/Users\s*\[\s*0\s*\]/);
    });

    it('builds the task handlers from the caller resolved from the user cache', () => {
        // CreateTaskOperations is tested by execution in TaskOperations.test.ts.
        expect(source).toMatch(/CreateTaskOperations\(\s*authenticatedUser\s*,\s*UserCache\.Instance\.Users\s*,\s*provider\s*\)/);
    });

    it('never builds an entity or agent handler itself, outside CreateTaskOperations', () => {
        expect(source).not.toMatch(/new (EntityOperations|AgentOperations)\(/);
    });
});

describe('A2A Server task access', () => {
    it('looks up an existing task only through the caller-scoped accessor', () => {
        expect(source).not.toMatch(/tasks\.(get|Get)\(/);
        expect(source).toMatch(/tasks\.GetForUser\(/);
    });
});

describe('A2A agent card identity', () => {
    /** The source of one top-level function, from its declaration to its closing brace. */
    function functionSource(name: string): string {
        const start = source.search(new RegExp(`function ${name}\\b`));
        expect(start).toBeGreaterThanOrEqual(0);
        const end = source.indexOf('\n}\n', start);
        return source.slice(start, end);
    }

    it('never builds the public card as the system user', () => {
        expect(functionSource('generateAgentCard')).not.toMatch(/GetSystemUser/);
        expect(source).not.toMatch(/function resolveServiceUser/);
    });

    it('serves the minimal card when no service identity is configured', () => {
        expect(functionSource('generateAgentCard')).toMatch(/ResolveAgentCardIdentity\(/);
        expect(functionSource('generateAgentCard')).toMatch(/BuildAgentCard\(a2aServerSettings\)/);
    });
});
