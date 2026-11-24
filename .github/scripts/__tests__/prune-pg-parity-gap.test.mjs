import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
    entitiesReferencedByString,
    entitiesReferencedBy,
    referencesRemovedRecord,
    recordsIn,
    readMetadata,
    findMissingEntities,
    planPrune,
} from '../prune-pg-parity-gap.mjs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'prune-pg-parity-gap.mjs');
const MISSING = 'MJ: AI Agent Rhythm Templates';

/** A metadata root shaped like the real one: the gap's own directory, a permission naming it, an
 * action whose description only mentions it, and an agent whose lookup points at a pruned record. */
function fixture() {
    const cwd = mkdtempSync(join(tmpdir(), 'pg-prune-'));
    const write = (path, value) => {
        mkdirSync(dirname(join(cwd, path)), { recursive: true });
        writeFileSync(join(cwd, path), JSON.stringify(value, null, 2));
    };
    write('metadata/.mj-sync.json', { version: '1.0.0', directoryOrder: ['rhythm-templates', 'entity-permissions', 'actions', 'agents'] });
    write('metadata/rhythm-templates/.mj-sync.json', { entity: MISSING, defaults: { AgentID: '@lookup:MJ: AI Agents.Name=Chief of Staff' } });
    write('metadata/rhythm-templates/.templates.json', [{ fields: { Name: 'Weekly Review' } }]);
    write('metadata/entity-permissions/.mj-sync.json', { entity: 'MJ: Entity Permissions' });
    write('metadata/entity-permissions/.perms.json', [
        { fields: { EntityID: '@lookup:MJ: Entities.Name=MJ: AI Agents', RoleID: '@lookup:MJ: Roles.Name=UI' } },
        { fields: { EntityID: `@lookup:MJ: Entities.Name=${MISSING}`, RoleID: '@lookup:MJ: Roles.Name=UI' } },
    ]);
    write('metadata/actions/.mj-sync.json', { entity: 'MJ: Actions' });
    write('metadata/actions/.actions.json', [
        { fields: { Name: 'List Rhythms', Description: `Lists offered ${MISSING} entries.` } },
        { fields: { Name: 'Run Rhythm', Description: 'Runs one.' }, relatedEntities: { [MISSING]: [{ fields: { Name: 'x' } }] } },
    ]);
    write('metadata/agents/.mj-sync.json', { entity: 'MJ: AI Agents' });
    write('metadata/agents/.agents.json', [
        { fields: { Name: 'Chief of Staff' }, relatedEntities: { 'MJ: AI Agent Actions': [{ fields: { ActionID: '@lookup:MJ: Actions.Name=Run Rhythm' } }] } },
        { fields: { Name: 'Helper' }, relatedEntities: { 'MJ: AI Agent Actions': [{ fields: { ActionID: '@lookup:MJ: Actions.Name=List Rhythms' } }] } },
    ]);
    return cwd;
}

const PRESENT = ['MJ: Entities', 'MJ: Entity Permissions', 'MJ: Roles', 'MJ: Actions', 'MJ: AI Agents', 'MJ: AI Agent Actions'];

describe('entitiesReferencedByString', () => {
    it('reads the target of a lookup and the entity a lookup into MJ: Entities names, nested ones included', () => {
        expect(
            entitiesReferencedByString(`@lookup:MJ: Entity Permissions.EntityID=@lookup:MJ: Entities.Name=${MISSING}&RoleID=@lookup:MJ: Roles.Name=UI?create`),
        ).toEqual(['MJ: Entity Permissions', 'MJ: Entities', 'MJ: Roles', MISSING]);
    });

    it('ignores prose that only mentions an entity', () => {
        expect(entitiesReferencedByString(`Lists offered ${MISSING} entries.`)).toEqual([]);
    });
});

describe('entitiesReferencedBy', () => {
    it('counts a relatedEntities key as a reference', () => {
        expect(entitiesReferencedBy({ fields: { Name: 'a' }, relatedEntities: { [MISSING]: [] } })).toEqual([MISSING]);
    });
});

describe('referencesRemovedRecord', () => {
    const removed = new Set(['MJ: Actions\u0000Run Rhythm']);

    it('matches a Name lookup to a removed record', () => {
        expect(referencesRemovedRecord({ fields: { ActionID: '@lookup:MJ: Actions.Name=Run Rhythm' } }, removed)).toBe(true);
    });

    it('does not match a record whose name only starts the same way', () => {
        expect(referencesRemovedRecord({ fields: { ActionID: '@lookup:MJ: Actions.Name=Run Rhythm Later' } }, removed)).toBe(false);
    });
});

describe('recordsIn', () => {
    it('reads an array of records and a single record, and nothing else', () => {
        expect(recordsIn([{ fields: {} }])).toHaveLength(1);
        expect(recordsIn({ fields: {} })).toHaveLength(1);
        expect(recordsIn({ name: 'a schema' })).toBeNull();
        expect(recordsIn([])).toBeNull();
    });
});

describe('planning the prune', () => {
    it('finds the missing entity and removes only what needs it', () => {
        const cwd = fixture();
        const previous = process.cwd();
        process.chdir(cwd);
        try {
            const metadata = readMetadata(['metadata']);
            const missing = findMissingEntities(metadata, PRESENT);
            expect(missing).toEqual([MISSING]);
            const plan = planPrune(metadata, missing);
            expect(plan.RemovedDirs).toEqual(['metadata/rhythm-templates']);
            const removed = Object.fromEntries([...plan.RemovedRecords].map(([path, set]) => [path, [...set].sort()]));
            expect(removed).toEqual({
                'metadata/rhythm-templates/.templates.json': [0],
                'metadata/entity-permissions/.perms.json': [1],
                'metadata/actions/.actions.json': [1],
                'metadata/agents/.agents.json': [0],
            });
        } finally {
            process.chdir(previous);
        }
    });

    it('reports no missing entity when the database has them all', () => {
        const cwd = fixture();
        const previous = process.cwd();
        process.chdir(cwd);
        try {
            expect(findMissingEntities(readMetadata(['metadata']), [...PRESENT, MISSING.toLowerCase()])).toEqual([]);
        } finally {
            process.chdir(previous);
        }
    });
});

describe('the CLI', () => {
    const run = (cwd, args) =>
        spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: join(cwd, 'out.txt'), GITHUB_STEP_SUMMARY: '' } });

    it('in regressions mode, prunes in place, writes the gap entities and gap=true, and exits 0', () => {
        const cwd = fixture();
        writeFileSync(join(cwd, 'present.txt'), PRESENT.join('\n'));
        writeFileSync(join(cwd, 'out.txt'), '');
        const result = run(cwd, ['--mode=regressions', '--present=present.txt', '--in-place', '--entities-out=gap.txt', 'metadata']);
        expect(result.status).toBe(0);
        expect(result.stdout).toMatch(/::warning title=PostgreSQL parity gap::/);
        expect(readFileSync(join(cwd, 'out.txt'), 'utf8')).toBe('gap=true\n');
        expect(readFileSync(join(cwd, 'gap.txt'), 'utf8')).toBe(`${MISSING}\n`);
        expect(existsSync(join(cwd, 'metadata/rhythm-templates'))).toBe(false);
        const perms = JSON.parse(readFileSync(join(cwd, 'metadata/entity-permissions/.perms.json'), 'utf8'));
        expect(perms).toHaveLength(1);
        const agents = JSON.parse(readFileSync(join(cwd, 'metadata/agents/.agents.json'), 'utf8'));
        expect(agents.map((a) => a.fields.Name)).toEqual(['Helper']);
        const actions = JSON.parse(readFileSync(join(cwd, 'metadata/actions/.actions.json'), 'utf8'));
        expect(actions.map((a) => a.fields.Name)).toEqual(['List Rhythms']);
    });

    it('refuses to run without --in-place, since it edits the roots', () => {
        const cwd = fixture();
        writeFileSync(join(cwd, 'present.txt'), PRESENT.join('\n'));
        expect(run(cwd, ['--mode=regressions', '--present=present.txt', '--entities-out=gap.txt', 'metadata']).status).toBe(2);
        expect(existsSync(join(cwd, 'metadata/rhythm-templates'))).toBe(true);
    });

    it('in gate mode, fails on a gap and changes nothing', () => {
        const cwd = fixture();
        writeFileSync(join(cwd, 'present.txt'), PRESENT.join('\n'));
        writeFileSync(join(cwd, 'out.txt'), '');
        const result = run(cwd, ['--mode=gate', '--present=present.txt', '--in-place', '--entities-out=gap.txt', 'metadata']);
        expect(result.status).toBe(1);
        expect(result.stdout).toMatch(/::error title=PostgreSQL parity gap::/);
        expect(existsSync(join(cwd, 'metadata/rhythm-templates'))).toBe(true);
    });

    it('with no gap, leaves the metadata unchanged and writes gap=false', () => {
        const cwd = fixture();
        writeFileSync(join(cwd, 'present.txt'), [...PRESENT, MISSING].join('\n'));
        writeFileSync(join(cwd, 'out.txt'), '');
        const result = run(cwd, ['--mode=gate', '--present=present.txt', '--in-place', '--entities-out=gap.txt', 'metadata']);
        expect(result.status).toBe(0);
        expect(readFileSync(join(cwd, 'out.txt'), 'utf8')).toBe('gap=false\n');
        expect(readFileSync(join(cwd, 'gap.txt'), 'utf8')).toBe('');
        expect(existsSync(join(cwd, 'metadata/rhythm-templates/.templates.json'))).toBe(true);
    });

    it('refuses an empty entity list rather than pruning everything', () => {
        const cwd = fixture();
        writeFileSync(join(cwd, 'present.txt'), '');
        expect(run(cwd, ['--mode=regressions', '--present=present.txt', '--in-place', '--entities-out=gap.txt', 'metadata']).status).toBe(1);
    });

    it('refuses an unknown mode', () => {
        const cwd = fixture();
        expect(run(cwd, ['--mode=report', '--present=present.txt', '--in-place', '--entities-out=gap.txt', 'metadata']).status).toBe(2);
    });
});
