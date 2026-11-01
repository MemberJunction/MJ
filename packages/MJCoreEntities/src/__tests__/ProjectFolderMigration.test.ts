import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Text-level pins on the conversation-folder upgrade migration. There is no database in unit tests, so
 * these assert the SQL's shape where a wrong shape is a security bug.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
    path.join(here, '../../../../migrations/v6/V202610310943__v6.2.x__Backfill_Legacy_Project_OwnerUserID.sql'),
    'utf8',
);

/** The RLS filter as SQL Server stores it: the N'...' literal with doubled quotes undone. */
function rlsFilterText(): string {
    const match = migration.match(/@NewFilterText NVARCHAR\(MAX\) = N'((?:[^']|'')*)'/);
    if (!match) throw new Error('FilterText assignment not found');
    return match[1].replace(/''/g, "'");
}

describe('V202610310943 conversation-folder migration', () => {
    it('matches folder grants against the OUTER folder ID, never an unqualified [ID] inside the grant subquery', () => {
        const filter = rlsFilterText();
        expect(filter).toContain('CAST([ID] AS NVARCHAR(36)) IN (SELECT [rp].[ResourceRecordID]');
        const subquery = filter.slice(filter.indexOf('(SELECT [rp].[ResourceRecordID]'));
        // Inside the subquery an unqualified [ID] binds to [rp].[ID], which opens every folder to a
        // grant whose ResourceRecordID is its own ID.
        expect(subquery).not.toMatch(/(?<![.\]])\[ID\]/);
        expect(subquery).not.toMatch(/(?<![.\w\]])ID\b(?!\])/);
    });

    it('ranks the folder creator above conversation authorship when inferring an owner', () => {
        const coalesce = migration.slice(migration.indexOf('COALESCE('), migration.indexOf(') AS InferredOwnerUserID'));
        const creator = coalesce.indexOf("rc.Type = N'Create'");
        const firstConversation = coalesce.indexOf('FROM ${flyway:defaultSchema}.Conversation c');
        expect(creator).toBeGreaterThan(-1);
        expect(firstConversation).toBeGreaterThan(-1);
        expect(creator).toBeLessThan(firstConversation);
    });

    it('leaves conversations alone, since folder inheritance is opt-in', () => {
        expect(migration).not.toContain('inheritFolderAccess');
        expect(migration).not.toMatch(/UPDATE\s+c\b|UPDATE\s+\$\{flyway:defaultSchema\}\.\[?Conversation\b/);
    });

    it('replaces the read filter only while it still holds the text V202609260053 installed', () => {
        const update = migration.slice(migration.indexOf('UPDATE ${flyway:defaultSchema}.RowLevelSecurityFilter'));
        expect(update).toContain("AND FilterText IN (N'(OwnerUserID IS NULL OR OwnerUserID = ''{{UserID}}'')', @NewFilterText);");
        expect(update).toMatch(/IF @@ROWCOUNT = 0\s+PRINT /);
    });

    it('carries no metadata insert for the Projects resource type', () => {
        expect(migration).not.toMatch(/INSERT INTO \$\{flyway:defaultSchema\}\.ResourceType/);
    });
});
