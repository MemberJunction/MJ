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

    it('hands the task caller to the entity operations', () => {
        expect(source).toMatch(/new EntityOperations\(\s*provider\s*,\s*contextUser\s*\)/);
    });
});

describe('A2A Server task access', () => {
    it('looks up an existing task only through the caller-scoped accessor', () => {
        expect(source).not.toMatch(/tasks\.(get|Get)\(/);
        expect(source).toMatch(/tasks\.GetForUser\(/);
    });
});
