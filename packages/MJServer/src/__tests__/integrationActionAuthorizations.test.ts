/**
 * The SQL Server backup actions are gated by `AssertCanRunAction`, which refuses every non-Owner
 * unless the action has an `MJ: Action Authorizations` row the user's roles hold. This pins the
 * shipped metadata that makes the Integrations dashboard usable by Developer and Integration role
 * holders: the authorization, its role grants, and a row on each action the dashboard runs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(__dirname, '..', '..', '..', '..');
const AUTHORIZATION_NAME = 'Integrations: Bootstrap From Backup';
const AUTHORIZATION_LOOKUP = `@lookup:MJ: Authorizations.Name=${AUTHORIZATION_NAME}`;

/** Every action the Integrations dashboard or the archive seed job runs as the caller. */
const GATED_ACTIONS = [
    'Bootstrap SQL Server Integration From Backup',
    'Restore SQL Server Backup To Staging',
    'Load SQL Server Integration From Staging',
    'Drop SQL Server Staging Database',
    'List Azure Backup Blobs',
    'Inspect SQL Server Backup',
];

interface MetadataRecord {
    fields: Record<string, unknown>;
    primaryKey?: { ID: string };
    relatedEntities?: Record<string, MetadataRecord[]>;
}

function readMetadata(relativePath: string): MetadataRecord[] {
    return JSON.parse(readFileSync(join(repoRoot, relativePath), 'utf8')) as MetadataRecord[];
}

const UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;

describe('integration action authorizations', () => {
    const authorizations = readMetadata('metadata/authorizations/.integrations.json');
    const roleGrants = readMetadata('metadata/authorization-roles/.integrations-roles.json');
    const actions = readMetadata('metadata/actions/.integration-actions.json');

    it('defines the authorization, active, under the Integrations root', () => {
        const root = authorizations.find(a => a.fields.Name === 'Integrations');
        const child = authorizations.find(a => a.fields.Name === AUTHORIZATION_NAME);
        expect(root?.fields.ParentID).toBeNull();
        expect(root?.fields.IsActive).toBe(true);
        expect(child?.fields.ParentID).toBe('@lookup:MJ: Authorizations.Name=Integrations');
        expect(child?.fields.IsActive).toBe(true);
        for (const record of authorizations) {
            expect(record.primaryKey?.ID).toMatch(UUID);
        }
    });

    it.each(['Developer', 'Integration'])('grants the authorization to the %s role', role => {
        const grant = roleGrants.find(g => g.fields.RoleID === `@lookup:MJ: Roles.Name=${role}`);
        expect(grant?.fields.AuthorizationID).toBe(AUTHORIZATION_LOOKUP);
        expect(grant?.fields.Type).toBe('Allow');
        expect(grant?.primaryKey?.ID).toMatch(UUID);
    });

    it('grants it to no other role', () => {
        expect(roleGrants).toHaveLength(2);
    });

    it.each(GATED_ACTIONS)('%s carries an Action Authorizations row for it', name => {
        const action = actions.find(a => a.fields.Name === name);
        expect(action, `action not in metadata: ${name}`).toBeDefined();
        const rows = action?.relatedEntities?.['MJ: Action Authorizations'] ?? [];
        expect(rows).toHaveLength(1);
        expect(rows[0].fields.ActionID).toBe('@parent:ID');
        expect(rows[0].fields.AuthorizationID).toBe(AUTHORIZATION_LOOKUP);
        expect(rows[0].primaryKey?.ID).toMatch(UUID);
    });

    it('uses a distinct primary key on every row', () => {
        const ids = [
            ...authorizations.map(a => a.primaryKey?.ID),
            ...roleGrants.map(g => g.primaryKey?.ID),
            ...actions.flatMap(a => (a.relatedEntities?.['MJ: Action Authorizations'] ?? []).map(r => r.primaryKey?.ID)),
        ];
        expect(new Set(ids).size).toBe(ids.length);
    });
});
