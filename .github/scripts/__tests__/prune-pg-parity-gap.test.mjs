import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
    entitiesReferencedByString,
    fieldsReferencedByString,
    entitiesReferencedBy,
    referencesRemovedRecord,
    recordsIn,
    readMetadata,
    findGap,
    planPrune,
} from '../prune-pg-parity-gap.mjs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'prune-pg-parity-gap.mjs');
const MISSING = 'MJ: AI Agent Rhythm Templates';
const FIELD_LOOKUP = (entity, field) => `@lookup:MJ: Entity Fields.EntityID=@lookup:MJ: Entities.Name=${entity}&Name=${field}`;

/**
 * A metadata root shaped like the real one: the gap's own directory; a permission naming the
 * missing entity; an action whose description only mentions it and one with a related child of it;
 * an agent that looks up the second action; and an entity record whose nested field settings name
 * a present column and a missing one (BaseAgentID).
 */
function fixture() {
    const cwd = mkdtempSync(join(tmpdir(), 'pg-prune-'));
    const write = (path, value) => {
        mkdirSync(dirname(join(cwd, path)), { recursive: true });
        writeFileSync(join(cwd, path), JSON.stringify(value, null, 2));
    };
    write('metadata/.mj-sync.json', { version: '1.0.0', directoryOrder: ['rhythm-templates', 'entity-permissions', 'actions', 'agents', 'entities'] });
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
        { fields: { Name: 'Run Rhythm', Description: 'Runs one.', TemplateID: `@lookup:${MISSING}.Name=Weekly Review` } },
    ]);
    write('metadata/agents/.mj-sync.json', { entity: 'MJ: AI Agents' });
    write('metadata/agents/.agents.json', [
        { fields: { Name: 'Chief of Staff' }, relatedEntities: { 'MJ: AI Agent Actions': [{ fields: { ActionID: '@lookup:MJ: Actions.Name=Run Rhythm' } }, { fields: { ActionID: '@lookup:MJ: Actions.Name=List Rhythms' } }] } },
        { fields: { Name: 'Helper' }, relatedEntities: { [MISSING]: [{ fields: { Name: 'x' } }] } },
    ]);
    write('metadata/entities/.mj-sync.json', { entity: 'MJ: Entities' });
    write('metadata/entities/.hierarchy.json', [
        {
            fields: { Name: 'MJ: AI Agents' },
            primaryKey: { ID: '@lookup:MJ: Entities.Name=MJ: AI Agents' },
            relatedEntities: {
                'MJ: Entity Fields': [
                    { fields: { Configuration: { IsHierarchy: true } }, primaryKey: { ID: FIELD_LOOKUP('MJ: AI Agents', 'ParentID') } },
                    { fields: { Configuration: { IsHierarchy: true } }, primaryKey: { ID: FIELD_LOOKUP('MJ: AI Agents', 'BaseAgentID') } },
                ],
            },
        },
    ]);
    return cwd;
}

const PRESENT = ['MJ: Entities', 'MJ: Entity Permissions', 'MJ: Roles', 'MJ: Actions', 'MJ: AI Agents', 'MJ: AI Agent Actions', 'MJ: Entity Fields'];
const PRESENT_FIELDS = [['MJ: AI Agents', 'ID'], ['MJ: AI Agents', 'ParentID'], ['MJ: AI Agents', 'Name']];

let previous = null;
const enter = (cwd) => {
    previous = process.cwd();
    process.chdir(cwd);
};
afterEach(() => {
    if (previous) process.chdir(previous);
    previous = null;
});

describe('reading references', () => {
    it('reads the target of a lookup and the entity a lookup into MJ: Entities names, nested ones included', () => {
        expect(
            entitiesReferencedByString(`@lookup:MJ: Entity Permissions.EntityID=@lookup:MJ: Entities.Name=${MISSING}&RoleID=@lookup:MJ: Roles.Name=UI?create`),
        ).toEqual(['MJ: Entity Permissions', 'MJ: Entities', 'MJ: Roles', MISSING]);
    });

    it('ignores prose that only mentions an entity', () => {
        expect(entitiesReferencedByString(`Lists offered ${MISSING} entries.`)).toEqual([]);
    });

    it('reads the entity and field of a lookup into MJ: Entity Fields, in either order and form', () => {
        expect(fieldsReferencedByString(FIELD_LOOKUP('MJ: AI Agents', 'BaseAgentID'))).toEqual([{ Entity: 'MJ: AI Agents', Field: 'BaseAgentID' }]);
        expect(fieldsReferencedByString('@lookup:MJ: Entity Fields.Name=Status&Entity=MJ: Actions?create')).toEqual([{ Entity: 'MJ: Actions', Field: 'Status' }]);
        expect(fieldsReferencedByString('@lookup:MJ: Actions.Name=Run')).toEqual([]);
    });

    it('counts a relatedEntities key as a reference', () => {
        expect(entitiesReferencedBy({ fields: { Name: 'a' }, relatedEntities: { [MISSING]: [] } })).toEqual([MISSING]);
    });

    it('matches a Name lookup to a removed record, and not a record whose name only starts the same way', () => {
        const removed = new Set(['MJ: Actions\u0000Run Rhythm']);
        expect(referencesRemovedRecord({ fields: { ActionID: '@lookup:MJ: Actions.Name=Run Rhythm' } }, removed)).toBe(true);
        expect(referencesRemovedRecord({ fields: { ActionID: '@lookup:MJ: Actions.Name=Run Rhythm Later' } }, removed)).toBe(false);
    });

    it('reads an array of records and a single record, and nothing else', () => {
        expect(recordsIn([{ fields: {} }])).toHaveLength(1);
        expect(recordsIn({ fields: {} })).toHaveLength(1);
        expect(recordsIn({ name: 'a schema' })).toBeNull();
        expect(recordsIn([])).toBeNull();
    });
});

describe('finding the gap', () => {
    it('finds the missing entity and the missing field of a present entity', () => {
        enter(fixture());
        expect(findGap(readMetadata(['metadata']), PRESENT, PRESENT_FIELDS)).toEqual({
            Entities: [MISSING],
            Fields: [{ Entity: 'MJ: AI Agents', Field: 'BaseAgentID' }],
        });
    });

    it('finds nothing when the database has them all, whatever the case', () => {
        enter(fixture());
        const gap = findGap(readMetadata(['metadata']), [...PRESENT, MISSING.toLowerCase()], [...PRESENT_FIELDS, ['mj: ai agents', 'baseagentid']]);
        expect(gap).toEqual({ Entities: [], Fields: [] });
    });
});

describe('planning the prune', () => {
    it('removes only what needs the gap: the directory, the smallest record or child, and their dependants', () => {
        enter(fixture());
        const metadata = readMetadata(['metadata']);
        const plan = planPrune(metadata, findGap(metadata, PRESENT, PRESENT_FIELDS));
        expect(plan.RemovedDirs).toEqual(['metadata/rhythm-templates']);
        const kept = Object.fromEntries([...plan.Files].map(([path, records]) => [path, records]));
        // The permission on the missing entity goes; the other stays.
        expect(kept['metadata/entity-permissions/.perms.json']).toHaveLength(1);
        // "List Rhythms" only mentions it in prose and stays; "Run Rhythm" looks it up and goes.
        expect(kept['metadata/actions/.actions.json'].map((r) => r.fields.Name)).toEqual(['List Rhythms']);
        // Chief of Staff stays, without the child that looked up the removed action; Helper stays
        // without its relatedEntities key for the missing entity.
        const agents = kept['metadata/agents/.agents.json'];
        expect(agents.map((a) => a.fields.Name)).toEqual(['Chief of Staff', 'Helper']);
        expect(agents[0].relatedEntities['MJ: AI Agent Actions'].map((c) => c.fields.ActionID)).toEqual(['@lookup:MJ: Actions.Name=List Rhythms']);
        expect(agents[1].relatedEntities).toEqual({});
        // The entity record stays with its ParentID setting; only the BaseAgentID child goes.
        const entity = kept['metadata/entities/.hierarchy.json'][0];
        expect(entity.relatedEntities['MJ: Entity Fields'].map((c) => c.primaryKey.ID)).toEqual([FIELD_LOOKUP('MJ: AI Agents', 'ParentID')]);
    });
});

describe('the CLI', () => {
    const run = (cwd, args) =>
        spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: join(cwd, 'out.txt'), GITHUB_STEP_SUMMARY: '' } });
    const setUp = (entities, fields) => {
        const cwd = fixture();
        writeFileSync(join(cwd, 'present.txt'), entities.join('\n'));
        writeFileSync(join(cwd, 'fields.txt'), fields.map(([e, f]) => `${e}\t${f}`).join('\n'));
        writeFileSync(join(cwd, 'out.txt'), '');
        return cwd;
    };
    const ARGS = ['--in-place', '--present=present.txt', '--present-fields=fields.txt', '--gap-out=gap.txt', 'metadata'];

    it('in regressions mode, prunes in place, writes the gap names and gap=true, and exits 0', () => {
        const cwd = setUp(PRESENT, PRESENT_FIELDS);
        const result = run(cwd, ['--mode=regressions', ...ARGS]);
        expect(result.status).toBe(0);
        expect(result.stdout).toMatch(/::warning title=PostgreSQL parity gap::.*MJ: AI Agents\.BaseAgentID/);
        expect(readFileSync(join(cwd, 'out.txt'), 'utf8')).toBe('gap=true\n');
        expect(readFileSync(join(cwd, 'gap.txt'), 'utf8')).toBe(`${MISSING}\nBaseAgentID\n`);
        expect(existsSync(join(cwd, 'metadata/rhythm-templates'))).toBe(false);
        expect(JSON.parse(readFileSync(join(cwd, 'metadata/entity-permissions/.perms.json'), 'utf8'))).toHaveLength(1);
        const entity = JSON.parse(readFileSync(join(cwd, 'metadata/entities/.hierarchy.json'), 'utf8'))[0];
        expect(entity.relatedEntities['MJ: Entity Fields']).toHaveLength(1);
    });

    it('in gate mode, fails on a gap and changes nothing', () => {
        const cwd = setUp(PRESENT, PRESENT_FIELDS);
        const result = run(cwd, ['--mode=gate', ...ARGS]);
        expect(result.status).toBe(1);
        expect(result.stdout).toMatch(/::error title=PostgreSQL parity gap::/);
        expect(existsSync(join(cwd, 'metadata/rhythm-templates'))).toBe(true);
    });

    it('with no gap, leaves the metadata unchanged and writes gap=false', () => {
        const cwd = setUp([...PRESENT, MISSING], [...PRESENT_FIELDS, ['MJ: AI Agents', 'BaseAgentID']]);
        const result = run(cwd, ['--mode=gate', ...ARGS]);
        expect(result.status).toBe(0);
        expect(readFileSync(join(cwd, 'out.txt'), 'utf8')).toBe('gap=false\n');
        expect(readFileSync(join(cwd, 'gap.txt'), 'utf8')).toBe('');
        expect(existsSync(join(cwd, 'metadata/rhythm-templates/.templates.json'))).toBe(true);
    });

    it('refuses to run without --in-place, since it edits the roots', () => {
        const cwd = setUp(PRESENT, PRESENT_FIELDS);
        expect(run(cwd, ['--mode=regressions', ...ARGS.filter((a) => a !== '--in-place')]).status).toBe(2);
        expect(existsSync(join(cwd, 'metadata/rhythm-templates'))).toBe(true);
    });

    it('refuses an empty entity or field list rather than pruning everything', () => {
        expect(run(setUp([], PRESENT_FIELDS), ['--mode=regressions', ...ARGS]).status).toBe(1);
        expect(run(setUp(PRESENT, []), ['--mode=regressions', ...ARGS]).status).toBe(1);
    });

    it('refuses an unknown mode', () => {
        expect(run(setUp(PRESENT, PRESENT_FIELDS), ['--mode=report', ...ARGS]).status).toBe(2);
    });
});
