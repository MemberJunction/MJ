import { describe, it, expect } from 'vitest';
import { SoftFKConfigEmitter } from '../SoftFKConfigEmitter.js';
import type { SoftFKEntry, SourceSchemaInfo, TargetTableConfig, TargetColumnConfig } from '../interfaces.js';

function MakeTargetConfig(overrides: Partial<TargetTableConfig> = {}): TargetTableConfig {
    return {
        SourceObjectName: 'contacts',
        SchemaName: 'hubspot',
        TableName: 'Contact',
        EntityName: 'HubSpot Contact',
        PrimaryKeyFields: ['ContactID'],
        Columns: [],
        SoftForeignKeys: [],
        ...overrides,
    };
}

describe('SoftFKConfigEmitter', () => {
    const emitter = new SoftFKConfigEmitter();

    describe('ParseExistingConfig', () => {
        it('should return empty object for null input', () => {
            expect(emitter.ParseExistingConfig(null)).toEqual({});
        });

        it('should return empty object for empty string', () => {
            expect(emitter.ParseExistingConfig('')).toEqual({});
            expect(emitter.ParseExistingConfig('   ')).toEqual({});
        });

        it('should parse valid JSON', () => {
            const json = JSON.stringify({ hubspot: [{ TableName: 'Contact' }] });
            const result = emitter.ParseExistingConfig(json);
            expect(result['hubspot']).toHaveLength(1);
            expect(result['hubspot'][0].TableName).toBe('Contact');
        });
    });

    describe('MergeSchemaConfig', () => {
        it('should add new schema and table entries', () => {
            const entries: SoftFKEntry[] = [{
                SchemaName: 'hubspot',
                TableName: 'Deal',
                FieldName: 'ContactID',
                TargetSchemaName: 'hubspot',
                TargetTableName: 'Contact',
                TargetFieldName: 'ID',
            }];

            const result = emitter.MergeSchemaConfig({}, entries);
            expect(result['hubspot']).toHaveLength(1);
            expect(result['hubspot'][0].TableName).toBe('Deal');
            expect(result['hubspot'][0].ForeignKeys).toHaveLength(1);
            expect(result['hubspot'][0].ForeignKeys![0].FieldName).toBe('ContactID');
        });

        it('should not duplicate existing FK entries', () => {
            const existing = {
                hubspot: [{
                    TableName: 'Deal',
                    ForeignKeys: [{
                        FieldName: 'ContactID',
                        SchemaName: 'hubspot',
                        RelatedTable: 'Contact',
                        RelatedField: 'ID',
                    }],
                }],
            };

            const entries: SoftFKEntry[] = [{
                SchemaName: 'hubspot',
                TableName: 'Deal',
                FieldName: 'ContactID',
                TargetSchemaName: 'hubspot',
                TargetTableName: 'Contact',
                TargetFieldName: 'ID',
            }];

            const result = emitter.MergeSchemaConfig(existing, entries);
            expect(result['hubspot'][0].ForeignKeys).toHaveLength(1);
        });

        it('should add new FKs to existing table entries', () => {
            const existing = {
                hubspot: [{
                    TableName: 'Deal',
                    ForeignKeys: [{
                        FieldName: 'ContactID',
                        SchemaName: 'hubspot',
                        RelatedTable: 'Contact',
                        RelatedField: 'ID',
                    }],
                }],
            };

            const entries: SoftFKEntry[] = [{
                SchemaName: 'hubspot',
                TableName: 'Deal',
                FieldName: 'OwnerID',
                TargetSchemaName: 'hubspot',
                TargetTableName: 'Owner',
                TargetFieldName: 'ID',
            }];

            const result = emitter.MergeSchemaConfig(existing, entries);
            expect(result['hubspot'][0].ForeignKeys).toHaveLength(2);
        });

        it('should not mutate the original config', () => {
            const existing = { hubspot: [{ TableName: 'Deal', ForeignKeys: [] }] };
            const entries: SoftFKEntry[] = [{
                SchemaName: 'hubspot', TableName: 'Deal', FieldName: 'X',
                TargetSchemaName: 'hubspot', TargetTableName: 'Y', TargetFieldName: 'ID',
            }];
            emitter.MergeSchemaConfig(existing, entries);
            expect(existing['hubspot'][0].ForeignKeys).toHaveLength(0);
        });
    });

    describe('GenerateConfigEntries', () => {
        it('should extract soft FKs from source relationships', () => {
            const sourceSchema: SourceSchemaInfo = {
                Objects: [{
                    ExternalName: 'deals',
                    ExternalLabel: 'Deals',
                    Fields: [
                        { Name: 'id', Label: 'ID', SourceType: 'string', IsRequired: true, MaxLength: null, Precision: null, Scale: null, DefaultValue: null, IsPrimaryKey: true, IsForeignKey: false, ForeignKeyTarget: null },
                        { Name: 'contact_id', Label: 'Contact ID', SourceType: 'string', IsRequired: false, MaxLength: null, Precision: null, Scale: null, DefaultValue: null, IsPrimaryKey: false, IsForeignKey: true, ForeignKeyTarget: 'contacts' },
                    ],
                    PrimaryKeyFields: ['id'],
                    Relationships: [{ FieldName: 'contact_id', TargetObject: 'contacts', TargetField: 'id' }],
                }],
            };

            const dealConfig = MakeTargetConfig({
                SourceObjectName: 'deals',
                TableName: 'Deal',
                Columns: [{ SourceFieldName: 'contact_id', TargetColumnName: 'ContactID', TargetSqlType: 'NVARCHAR(255)', IsNullable: true, MaxLength: 255, Precision: null, Scale: null, DefaultValue: null }],
            });
            const contactConfig = MakeTargetConfig({ SourceObjectName: 'contacts', TableName: 'Contact' });

            const entries = emitter.GenerateConfigEntries(sourceSchema, [dealConfig, contactConfig]);
            expect(entries).toHaveLength(1);
            expect(entries[0].FieldName).toBe('ContactID');
            expect(entries[0].TargetTableName).toBe('Contact');
            expect(entries[0].TargetFieldName).toBe('ContactID');
        });

        it('should include pre-defined SoftForeignKeys from target configs', () => {
            const sourceSchema: SourceSchemaInfo = { Objects: [] };
            const config = MakeTargetConfig({
                SoftForeignKeys: [{
                    SchemaName: 'hubspot', TableName: 'Deal', FieldName: 'OwnerID',
                    TargetSchemaName: '__mj', TargetTableName: 'User', TargetFieldName: 'ID',
                }],
            });

            const entries = emitter.GenerateConfigEntries(sourceSchema, [config]);
            expect(entries).toHaveLength(1);
            expect(entries[0].FieldName).toBe('OwnerID');
        });

        it('should skip relationships whose target object is not being imported', () => {
            const sourceSchema: SourceSchemaInfo = {
                Objects: [{
                    ExternalName: 'deals',
                    ExternalLabel: 'Deals',
                    Fields: [],
                    PrimaryKeyFields: ['id'],
                    Relationships: [{ FieldName: 'owner_id', TargetObject: 'owners', TargetField: 'id' }],
                }],
            };
            const config = MakeTargetConfig({ SourceObjectName: 'deals' });
            const entries = emitter.GenerateConfigEntries(sourceSchema, [config]);
            expect(entries).toHaveLength(0);
        });
    });

    describe('EmitConfigFile', () => {
        it('should produce valid JSON EmittedFile', () => {
            const config = { hubspot: [{ TableName: 'Contact', ForeignKeys: [] }] };
            const file = emitter.EmitConfigFile('path/to/config.json', config);
            expect(file.FilePath).toBe('path/to/config.json');
            expect(JSON.parse(file.Content)).toEqual(config);
        });
    });
});

// ── RSU-spec additionalSchemaInfo lifecycle: per-table REPLACE for soft FKs ────
// "when we then get a new set from a schema refresh, it replaces the primary key and
// foreign key mappings … for the tables (adds new ones, removes old ones that no longer
// exist)". MergeSoftPKs already replaces per table; ClearForeignKeysForTables gives FKs
// the same semantics — this run's tables get exactly this run's FK set, others untouched.
describe('SoftFKConfigEmitter.ClearForeignKeysForTables (RSU spec — replace, not accumulate)', () => {
    const emitter = new SoftFKConfigEmitter();
    const existing = () => ({
        crm: [
            { TableName: 'contacts', PrimaryKey: [{ FieldName: 'id' }], ForeignKeys: [
                { FieldName: 'account_id', SchemaName: 'crm', RelatedTable: 'accounts', RelatedField: 'id' },
                { FieldName: 'stale_id', SchemaName: 'crm', RelatedTable: 'gone_table', RelatedField: 'id' },
            ]},
            { TableName: 'untouched', ForeignKeys: [
                { FieldName: 'x_id', SchemaName: 'crm', RelatedTable: 'x', RelatedField: 'id' },
            ]},
        ],
    });
    const contactsConfig = MakeTargetConfig({ SchemaName: 'crm', TableName: 'contacts', SourceObjectName: 'contacts' });

    it('clears FKs for tables in THIS run so the rebuild reflects the current resolution', () => {
        const cleared = emitter.ClearForeignKeysForTables(existing(), [contactsConfig]);
        const contacts = cleared['crm'].find(t => t.TableName === 'contacts')!;
        expect(contacts.ForeignKeys).toBeUndefined();      // stale_id gone; MergeSchemaConfig re-adds current FKs
        expect(contacts.PrimaryKey).toEqual([{ FieldName: 'id' }]); // PK untouched here (MergeSoftPKs replaces it)
    });

    it('leaves tables NOT in this run untouched', () => {
        const cleared = emitter.ClearForeignKeysForTables(existing(), [contactsConfig]);
        expect(cleared['crm'].find(t => t.TableName === 'untouched')!.ForeignKeys).toHaveLength(1);
    });

    it('does not mutate the input config', () => {
        const input = existing();
        emitter.ClearForeignKeysForTables(input, [contactsConfig]);
        expect(input['crm'].find(t => t.TableName === 'contacts')!.ForeignKeys).toHaveLength(2);
    });

    it('a stale FK cannot outlive the resolution: clear + re-merge yields exactly the new set', () => {
        const cleared = emitter.ClearForeignKeysForTables(existing(), [contactsConfig]);
        const merged = emitter.MergeSchemaConfig(cleared, [
            { SchemaName: 'crm', TableName: 'contacts', FieldName: 'account_id', TargetSchemaName: 'crm', TargetTableName: 'accounts', TargetFieldName: 'id' },
        ]);
        expect(merged['crm'].find(t => t.TableName === 'contacts')!.ForeignKeys).toEqual([
            { FieldName: 'account_id', SchemaName: 'crm', RelatedTable: 'accounts', RelatedField: 'id' },
        ]);
    });
});
