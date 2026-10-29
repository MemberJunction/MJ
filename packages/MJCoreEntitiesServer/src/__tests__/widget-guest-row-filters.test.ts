/**
 * Every public web-widget guest authenticates as the one shared Anonymous principal, so a
 * Widget Guest Read or Update grant with no row filter lets one guest reach every row of that
 * entity: EntityInfo.UserExemptFromRowLevelSecurity treats an unfiltered grant as exempt.
 * This test reads the shipped permission metadata and fails when such a grant appears on an
 * entity that is not on the reference-data allowlist below.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const permissionsPath = join(repoRoot, 'metadata/entity-permissions/.entity-permissions.json');
const migrationPath = join(
    repoRoot,
    'migrations/v6/V202610282037__v6.2.x__Widget_Guest_Own_Row_Filters.sql',
);

const ROLE_LOOKUP = '@lookup:MJ: Roles.Name=Widget Guest';
const ENTITY_LOOKUP_PREFIX = '@lookup:MJ: Entities.Name=';
const FILTER_LOOKUP_PREFIX = '@lookup:MJ: Row Level Security Filters.Name=';

/**
 * Entities a guest may read unfiltered: shared reference data with no per-visitor rows.
 * Adding an entity here is a security decision — the grant must not cover rows written for a
 * visitor or a named user.
 */
const REFERENCE_ENTITY_ALLOWLIST = new Set<string>(['MJ: AI Agent Request Types']);

interface PermissionFields {
    EntityID: string;
    RoleID: string;
    CanRead?: boolean;
    CanUpdate?: boolean;
    ReadRLSFilterID?: string;
    UpdateRLSFilterID?: string;
}

interface PermissionRecord {
    fields: PermissionFields;
}

function loadWidgetGuestGrants(): PermissionFields[] {
    const records = JSON.parse(readFileSync(permissionsPath, 'utf8')) as PermissionRecord[];
    return records.map((r) => r.fields).filter((f) => f.RoleID === ROLE_LOOKUP);
}

function entityName(fields: PermissionFields): string {
    return fields.EntityID.startsWith(ENTITY_LOOKUP_PREFIX)
        ? fields.EntityID.slice(ENTITY_LOOKUP_PREFIX.length)
        : fields.EntityID;
}

function filterName(lookup: string | undefined): string | undefined {
    return lookup?.startsWith(FILTER_LOOKUP_PREFIX) ? lookup.slice(FILTER_LOOKUP_PREFIX.length) : undefined;
}

/** Every versioned SQL migration in migrations/v5 and migrations/v6, concatenated. */
function allMigrationText(): string {
    const texts: string[] = [];
    for (const folder of ['v5', 'v6']) {
        const dir = join(repoRoot, 'migrations', folder);
        for (const file of readdirSync(dir).filter((f) => f.startsWith('V') && f.endsWith('.sql'))) {
            texts.push(readFileSync(join(dir, file), 'utf8'));
        }
    }
    return texts.join('\n');
}

describe('Widget Guest permission row filters', () => {
    const grants = loadWidgetGuestGrants();

    it('finds the Widget Guest grants in the permission metadata', () => {
        expect(grants.length).toBeGreaterThan(0);
    });

    it('filters every Widget Guest Read grant outside the reference allowlist', () => {
        const unfiltered = grants
            .filter((g) => g.CanRead === true && !REFERENCE_ENTITY_ALLOWLIST.has(entityName(g)))
            .filter((g) => !filterName(g.ReadRLSFilterID))
            .map(entityName);
        expect(unfiltered).toEqual([]);
    });

    it('filters every Widget Guest Update grant outside the reference allowlist', () => {
        const unfiltered = grants
            .filter((g) => g.CanUpdate === true && !REFERENCE_ENTITY_ALLOWLIST.has(entityName(g)))
            .filter((g) => !filterName(g.UpdateRLSFilterID))
            .map(entityName);
        expect(unfiltered).toEqual([]);
    });

    it('grants nothing but Read on allowlisted reference entities', () => {
        const writable = grants
            .filter((g) => REFERENCE_ENTITY_ALLOWLIST.has(entityName(g)))
            .filter((g) => g.CanUpdate === true)
            .map(entityName);
        expect(writable).toEqual([]);
    });

    it('uses each Widget Guest filter on one entity only', () => {
        const entitiesByFilter = new Map<string, Set<string>>();
        for (const g of grants) {
            for (const name of [filterName(g.ReadRLSFilterID), filterName(g.UpdateRLSFilterID)]) {
                if (name?.startsWith('Widget Guest:')) {
                    const set = entitiesByFilter.get(name) ?? new Set<string>();
                    set.add(entityName(g));
                    entitiesByFilter.set(name, set);
                }
            }
        }
        const shared = [...entitiesByFilter.entries()].filter(([, set]) => set.size > 1).map(([name]) => name);
        expect(shared).toEqual([]);
    });

    it('references only filters that a migration seeds', () => {
        const migrations = allMigrationText();
        const names = new Set<string>();
        for (const g of grants) {
            for (const name of [filterName(g.ReadRLSFilterID), filterName(g.UpdateRLSFilterID)]) {
                if (name) {
                    names.add(name);
                }
            }
        }
        const missing = [...names].filter((name) => !migrations.includes(`'${name}'`));
        expect(missing).toEqual([]);
    });

    describe('own-row filters seeded by this release', () => {
        const migration = readFileSync(migrationPath, 'utf8');

        it.each([
            ['Widget Guest: Own Agent Requests', 'OriginatingAgentRunID IN (SELECT ID FROM ${flyway:defaultSchema}.vwAIAgentRuns WHERE ConversationID IN'],
            ['Widget Guest: Own Conversation Skills', 'ConversationID IN (SELECT ID FROM ${flyway:defaultSchema}.vwConversations WHERE'],
            ['Widget Guest: Own Conversation Detail Artifacts', 'ConversationDetailID IN (SELECT ID FROM ${flyway:defaultSchema}.vwConversationDetails WHERE'],
        ])('seeds %s with its derivation', (name, predicate) => {
            expect(migration).toContain(`N'${name}'`);
            expect(migration).toContain(predicate);
        });

        it('keeps each scope token inside one quoted equality (fail-closed when the scope is absent)', () => {
            const filterTexts = [...migration.matchAll(/N'((?:OriginatingAgentRunID|ConversationID|ConversationDetailID) IN [^\n]*)'\)/g)]
                .map((m) => m[1]);
            expect(filterTexts).toHaveLength(3);
            for (const text of filterTexts) {
                expect(text.match(/\{\{ScopeResourceID\}\}/g)).toHaveLength(1);
                expect(text).toContain("ExternalID = ''{{ScopeResourceID}}''");
            }
        });

        it('links the new filters from the matching grants', () => {
            const byEntity = new Map(grants.map((g) => [entityName(g), g]));
            expect(filterName(byEntity.get('MJ: AI Agent Requests')?.ReadRLSFilterID)).toBe('Widget Guest: Own Agent Requests');
            expect(filterName(byEntity.get('MJ: AI Agent Requests')?.UpdateRLSFilterID)).toBe('Widget Guest: Own Agent Requests');
            expect(filterName(byEntity.get('MJ: Conversation Skills')?.ReadRLSFilterID)).toBe('Widget Guest: Own Conversation Skills');
            expect(filterName(byEntity.get('MJ: Conversation Skills')?.UpdateRLSFilterID)).toBe('Widget Guest: Own Conversation Skills');
            expect(filterName(byEntity.get('MJ: Conversation Detail Artifacts')?.ReadRLSFilterID))
                .toBe('Widget Guest: Own Conversation Detail Artifacts');
            for (const [entity, filter] of [
                ['MJ: AI Agent Runs', 'Widget Guest: Own Agent Runs'],
                ['MJ: AI Agent Run Steps', 'Widget Guest: Own Agent Run Steps'],
                ['MJ: AI Prompt Runs', 'Widget Guest: Own Prompt Runs'],
            ]) {
                expect(filterName(byEntity.get(entity)?.UpdateRLSFilterID)).toBe(filter);
            }
        });
    });
});
