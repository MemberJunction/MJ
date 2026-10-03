/**
 * S-3. The UI grant on evaluations and scores must not be a blanket read.
 * The filter is SQL because the filter entity grants Create to no role, and the
 * permission update is SQL because the generated permission id differs per database.
 * The admin path is an authorization, not a second unfiltered UI grant.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const migrationPath = join(
    repoRoot,
    'migrations/v6/V202609302345__v6.2.x__Rubric_Evaluation_UI_RLS.sql',
);

describe('rubric evaluation UI row filter', () => {
    const migration = readFileSync(migrationPath, 'utf8');
    const authorization = JSON.parse(readFileSync(join(
        repoRoot,
        'metadata/authorizations/.rubric-evaluations.json',
    ), 'utf8'));
    const authorizationRole = JSON.parse(readFileSync(join(
        repoRoot,
        'metadata/authorization-roles/.rubric-evaluation-roles.json',
    ), 'utf8'));

    it('limits evaluation reads to EvaluatorUserID and the admin authorization', () => {
        expect(migration).toContain("[EvaluatorUserID] = ''{{UserID}}''");
        expect(migration).toContain("N''Administer Rubric Evaluations''");
        expect(migration).toContain('UI: Own Rubric Evaluations');
        expect(migration).toContain('[EvaluationID] IN (SELECT [ev].[ID]');
        expect(migration).toContain("[denied].[Type] = N''Deny''");
    });

    it('grants UI create and update only after attaching the read and update filters', () => {
        const filterInsert = migration.indexOf('INSERT INTO ${flyway:defaultSchema}.[RowLevelSecurityFilter]');
        const permissionUpdate = migration.indexOf('[CanCreate] = 1');
        expect(filterInsert).toBeGreaterThan(-1);
        expect(permissionUpdate).toBeGreaterThan(filterInsert);
        expect(migration).toContain('[CanUpdate] = 1');
        expect(migration).toContain('[ReadRLSFilterID] = @EvaluationFilterID');
        expect(migration).toContain('[UpdateRLSFilterID] = @EvaluationFilterID');
        expect(migration).toContain('[ReadRLSFilterID] = @ScoreFilterID');
        expect(migration).toContain('[UpdateRLSFilterID] = @ScoreFilterID');
        expect(migration).not.toContain('[CanDelete] = 1');
        expect(migration).toContain('7FAA091D-C1A3-48A7-82D2-3D17729470F9');
        expect(migration).toContain('122ED707-2BC0-42E8-B25F-6BDDE7164962');
    });

    it('defines the admin authorization and grants it to Developer', () => {
        expect(authorization[0].fields.Name).toBe('Administer Rubric Evaluations');
        expect(authorization[0].fields.IsActive).toBe(true);
        expect(authorizationRole[0].fields.AuthorizationID).toBe(
            '@lookup:MJ: Authorizations.Name=Administer Rubric Evaluations',
        );
        expect(authorizationRole[0].fields.RoleID).toBe('@lookup:MJ: Roles.Name=Developer');
        expect(authorizationRole[0].fields.Type).toBe('Allow');
    });
});
