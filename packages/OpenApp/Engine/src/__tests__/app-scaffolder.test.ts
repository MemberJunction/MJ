/**
 * Unit tests for OpenApp scaffolder (`app-scaffolder.ts`) and Schema Consistency CI generation.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
    ScaffoldOpenApp,
    GenerateSchemaConsistencyWorkflow,
    GenerateSchemaConsistencyScript,
    ExpectedForeignKeyIndexName,
    ScanMigrationForeignKeyIndexes,
    SCHEMA_CONSISTENCY_WORKFLOW_PATH,
    SCHEMA_CONSISTENCY_SCRIPT_PATH,
} from '../scaffold/app-scaffolder.js';

describe('ExpectedForeignKeyIndexName', () => {
    it('builds CodeGen-standard IDX_AUTO_MJ_FKEY_{Table}_{Column} and truncates at 128 chars', () => {
        expect(ExpectedForeignKeyIndexName('ActivityFile', 'ActivityID')).toBe(
            'IDX_AUTO_MJ_FKEY_ActivityFile_ActivityID'
        );
        const longName = ExpectedForeignKeyIndexName('A'.repeat(100), 'B'.repeat(50));
        expect(longName.length).toBe(128);
        expect(longName.startsWith('IDX_AUTO_MJ_FKEY_')).toBe(true);
    });
});

describe('ScanMigrationForeignKeyIndexes', () => {
    it('flags FK columns in CREATE TABLE and ALTER TABLE that lack IDX_AUTO_MJ_FKEY_* indexes', () => {
        const result = ScanMigrationForeignKeyIndexes([
            {
                File: 'V202601010001__baseline.sql',
                Sql: `
                    CREATE TABLE [\${flyway:defaultSchema}].[AddressLink] (
                        ID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
                        AddressID UNIQUEIDENTIFIER NOT NULL,
                        AddressTypeID UNIQUEIDENTIFIER NOT NULL,
                        CONSTRAINT FK_AddressLink_Address FOREIGN KEY (AddressID)
                            REFERENCES [\${flyway:defaultSchema}].[Address](ID),
                        CONSTRAINT FK_AddressLink_AddressType FOREIGN KEY ([AddressTypeID])
                            REFERENCES [\${flyway:defaultSchema}].[AddressType]([ID])
                    );
                    ALTER TABLE [\${flyway:defaultSchema}].[Person]
                        ADD CONSTRAINT FK_Person_SeniorityLevel FOREIGN KEY (SeniorityLevelID)
                            REFERENCES [\${flyway:defaultSchema}].[SeniorityLevel](ID);
                    CREATE NONCLUSTERED INDEX IDX_AUTO_MJ_FKEY_AddressLink_AddressID
                        ON [\${flyway:defaultSchema}].[AddressLink] ([AddressID]);
                `,
            },
        ]);

        expect(result.ForeignKeys).toHaveLength(3);
        expect(result.Missing).toEqual([
            {
                Table: 'AddressLink',
                Column: 'AddressTypeID',
                ExpectedIndex: 'IDX_AUTO_MJ_FKEY_AddressLink_AddressTypeID',
                File: 'V202601010001__baseline.sql',
            },
            {
                Table: 'Person',
                Column: 'SeniorityLevelID',
                ExpectedIndex: 'IDX_AUTO_MJ_FKEY_Person_SeniorityLevelID',
                File: 'V202601010001__baseline.sql',
            },
        ]);
    });

    it('passes when a subsequent migration adds the missing IDX_AUTO_MJ_FKEY_* indexes', () => {
        const result = ScanMigrationForeignKeyIndexes([
            {
                File: 'V202601010001__baseline.sql',
                Sql: `
                    CREATE TABLE [\${flyway:defaultSchema}].[ActivityFile] (
                        ID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
                        ActivityID UNIQUEIDENTIFIER NOT NULL,
                        FileID UNIQUEIDENTIFIER NOT NULL,
                        CONSTRAINT FK_ActivityFile_Activity FOREIGN KEY (ActivityID) REFERENCES [\${flyway:defaultSchema}].[Activity](ID),
                        CONSTRAINT FK_ActivityFile_File FOREIGN KEY (FileID) REFERENCES [\${mjSchema}].[File](ID)
                    );
                `,
            },
            {
                File: 'V202604200002__add_fk_indexes.sql',
                Sql: `
                    CREATE NONCLUSTERED INDEX IDX_AUTO_MJ_FKEY_ActivityFile_ActivityID
                        ON [\${flyway:defaultSchema}].[ActivityFile] ([ActivityID]);
                    CREATE NONCLUSTERED INDEX IDX_AUTO_MJ_FKEY_ActivityFile_FileID
                        ON [\${flyway:defaultSchema}].[ActivityFile] ([FileID]);
                `,
            },
        ]);

        expect(result.ForeignKeys).toHaveLength(2);
        expect(result.Missing).toEqual([]);
    });

    it('ignores commented-out or string-literal FOREIGN KEY text', () => {
        const result = ScanMigrationForeignKeyIndexes([
            {
                File: 'V202601010001__comments.sql',
                Sql: `
                    -- CREATE TABLE [acme].[Ghost] (GhostID UNIQUEIDENTIFIER, FOREIGN KEY (GhostID) REFERENCES [acme].[Other](ID));
                    /* ALTER TABLE [acme].[Ghost] ADD CONSTRAINT FK_Ghost FOREIGN KEY (GhostID) REFERENCES [acme].[Other](ID); */
                    SELECT N'FOREIGN KEY (GhostID) REFERENCES [acme].[Other](ID)';
                `,
            },
        ]);

        expect(result.ForeignKeys).toHaveLength(0);
        expect(result.Missing).toHaveLength(0);
    });
});

describe('GenerateSchemaConsistencyWorkflow & GenerateSchemaConsistencyScript', () => {
    it('generates workflow YAML with static FK index check and clean-room MC1-MC4 catalog check', () => {
        const workflow = GenerateSchemaConsistencyWorkflow({
            SchemaName: 'acme_crm',
            MigrationsDirectory: 'migrations',
        });

        expect(workflow).toContain('name: Schema Consistency');
        expect(workflow).toContain('fk-indexes:');
        expect(workflow).toContain('catalog-consistency:');
        expect(workflow).toContain(`node ./${SCHEMA_CONSISTENCY_SCRIPT_PATH} --self-test`);
        expect(workflow).toContain(`node ./${SCHEMA_CONSISTENCY_SCRIPT_PATH} --dir ./migrations`);
        expect(workflow).toContain(
            `node ./${SCHEMA_CONSISTENCY_SCRIPT_PATH} --live --schema acme_crm --core-schema __mj --database "$DB_DATABASE"`
        );
    });

    it('generates script with both static FK scanner and live MC1-MC4 SQL queries', () => {
        const script = GenerateSchemaConsistencyScript({
            SchemaName: 'acme_crm',
            MigrationsDirectory: 'migrations',
        });

        expect(script).toContain('IDX_AUTO_MJ_FKEY_');
        expect(script).toContain('sys.foreign_key_columns');
        expect(script).toContain('sys.index_columns');
        expect(script).toContain('EntityField');
        expect(script).toContain('[MC1]');
        expect(script).toContain('[MC4]');
    });
});

describe('ScaffoldOpenApp', () => {
    it('writes mj-app.json, .github/workflows/schema-consistency.yml, and .github/scripts/check-schema-consistency.mjs', () => {
        const tempRoot = mkdtempSync(join(tmpdir(), 'mj-openapp-scaffold-'));
        try {
            const result = ScaffoldOpenApp({
                RepoRoot: tempRoot,
                AppName: 'acme-crm',
                DisplayName: 'Acme CRM',
                Description: 'Customer relationship management for MemberJunction',
                SchemaName: 'acme_crm',
                PublisherName: 'Acme Corp',
                RepositoryUrl: 'https://github.com/acme/mj-crm',
            });

            expect(result.Success).toBe(true);
            expect(result.Files.map((f) => f.RelativePath)).toEqual([
                'mj-app.json',
                SCHEMA_CONSISTENCY_WORKFLOW_PATH,
                SCHEMA_CONSISTENCY_SCRIPT_PATH,
            ]);
            expect(result.Files.every((f) => f.Status === 'created')).toBe(true);

            const workflowOnDisk = readFileSync(join(tempRoot, SCHEMA_CONSISTENCY_WORKFLOW_PATH), 'utf8');
            expect(workflowOnDisk).toContain('Foreign Key Index Coverage');
            expect(workflowOnDisk).toContain('Clean-Room Schema & Metadata Consistency (MC1-MC4)');

            const scriptOnDisk = readFileSync(join(tempRoot, SCHEMA_CONSISTENCY_SCRIPT_PATH), 'utf8');
            expect(scriptOnDisk).toContain('IDX_AUTO_MJ_FKEY_');

            // Second run without Overwrite skips existing files idempotently
            const secondRun = ScaffoldOpenApp({
                RepoRoot: tempRoot,
                AppName: 'acme-crm',
                DisplayName: 'Acme CRM',
                Description: 'Customer relationship management for MemberJunction',
                SchemaName: 'acme_crm',
                PublisherName: 'Acme Corp',
                RepositoryUrl: 'https://github.com/acme/mj-crm',
            });
            expect(secondRun.Success).toBe(true);
            expect(secondRun.Files.every((f) => f.Status === 'skipped')).toBe(true);
        } finally {
            rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    it('rejects reserved schema names before writing any files', () => {
        const tempRoot = mkdtempSync(join(tmpdir(), 'mj-openapp-scaffold-reserved-'));
        try {
            const result = ScaffoldOpenApp({
                RepoRoot: tempRoot,
                AppName: 'bad-app',
                DisplayName: 'Bad App',
                Description: 'Attempts to claim reserved __mj schema',
                SchemaName: '__mj',
                PublisherName: 'Acme',
                RepositoryUrl: 'https://github.com/acme/bad-app',
            });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toMatch(/reserved/i);
            expect(existsSync(join(tempRoot, 'mj-app.json'))).toBe(false);
        } finally {
            rmSync(tempRoot, { recursive: true, force: true });
        }
    });
});
