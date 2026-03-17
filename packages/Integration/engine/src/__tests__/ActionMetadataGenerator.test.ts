import { describe, it, expect } from 'vitest';
import {
    ActionMetadataGenerator,
    type ActionGeneratorConfig,
    type IntegrationObjectInfo,
} from '../ActionMetadataGenerator.js';

// ─── Test Fixtures ───────────────────────────────────────────────────

function createMinimalObject(overrides: Partial<IntegrationObjectInfo> = {}): IntegrationObjectInfo {
    return {
        Name: 'contacts',
        DisplayName: 'Contact',
        Description: 'A person in the CRM',
        SupportsWrite: true,
        Fields: [
            { Name: 'email', DisplayName: 'Email', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Email address' },
            { Name: 'firstname', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'First name' },
            { Name: 'hs_object_id', DisplayName: 'Object ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Internal ID' },
            { Name: 'createdate', DisplayName: 'Created Date', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Created at' },
        ],
        ...overrides,
    };
}

function createConfig(overrides: Partial<ActionGeneratorConfig> = {}): ActionGeneratorConfig {
    return {
        IntegrationName: 'TestCRM',
        CategoryName: 'TestCategory',
        Objects: [createMinimalObject()],
        IncludeSearch: true,
        IncludeList: true,
        ...overrides,
    };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('ActionMetadataGenerator', () => {
    const generator = new ActionMetadataGenerator();

    describe('Generate', () => {
        it('should produce 6 actions per writable object (Get/Create/Update/Delete/Search/List)', () => {
            const result = generator.Generate(createConfig());
            expect(result.ActionRecords).toHaveLength(6);

            const names = result.ActionRecords.map(a => a.fields['Name'] as string);
            expect(names).toContain('TestCRM - Get Contact');
            expect(names).toContain('TestCRM - Create Contact');
            expect(names).toContain('TestCRM - Update Contact');
            expect(names).toContain('TestCRM - Delete Contact');
            expect(names).toContain('TestCRM - Search Contact');
            expect(names).toContain('TestCRM - List Contact');
        });

        it('should produce only Get/Search/List for read-only objects', () => {
            const config = createConfig({
                Objects: [createMinimalObject({ SupportsWrite: false })],
            });
            const result = generator.Generate(config);
            expect(result.ActionRecords).toHaveLength(3);

            const names = result.ActionRecords.map(a => a.fields['Name'] as string);
            expect(names).toContain('TestCRM - Get Contact');
            expect(names).toContain('TestCRM - Search Contact');
            expect(names).toContain('TestCRM - List Contact');
            expect(names).not.toContain('TestCRM - Create Contact');
            expect(names).not.toContain('TestCRM - Update Contact');
            expect(names).not.toContain('TestCRM - Delete Contact');
        });

        it('should skip Search and List when disabled', () => {
            const config = createConfig({ IncludeSearch: false, IncludeList: false });
            const result = generator.Generate(config);
            expect(result.ActionRecords).toHaveLength(4); // Get, Create, Update, Delete

            const names = result.ActionRecords.map(a => a.fields['Name'] as string);
            expect(names).not.toContain('TestCRM - Search Contact');
            expect(names).not.toContain('TestCRM - List Contact');
        });

        it('should handle multiple objects', () => {
            const config = createConfig({
                Objects: [
                    createMinimalObject({ Name: 'contacts', DisplayName: 'Contact' }),
                    createMinimalObject({ Name: 'deals', DisplayName: 'Deal' }),
                ],
            });
            const result = generator.Generate(config);
            expect(result.ActionRecords).toHaveLength(12); // 6 verbs × 2 objects
        });

        it('should return empty actions for empty object list', () => {
            const config = createConfig({ Objects: [] });
            const result = generator.Generate(config);
            expect(result.ActionRecords).toHaveLength(0);
        });
    });

    describe('SyncConfig', () => {
        it('should produce valid mj-sync config', () => {
            const result = generator.Generate(createConfig());
            expect(result.SyncConfig['entity']).toBe('MJ: Actions');
            expect(result.SyncConfig['filePattern']).toBe('**/.*.json');

            const pull = result.SyncConfig['pull'] as Record<string, unknown>;
            expect(pull).toBeDefined();

            const related = pull['relatedEntities'] as Record<string, unknown>;
            expect(related).toHaveProperty('MJ: Action Params');
            expect(related).toHaveProperty('MJ: Action Result Codes');
        });
    });

    describe('Action fields', () => {
        it('should set DriverClass to IntegrationActionExecutor', () => {
            const result = generator.Generate(createConfig());
            for (const action of result.ActionRecords) {
                expect(action.fields['DriverClass']).toBe('IntegrationActionExecutor');
            }
        });

        it('should set Type to Custom and Status to Active', () => {
            const result = generator.Generate(createConfig());
            for (const action of result.ActionRecords) {
                expect(action.fields['Type']).toBe('Custom');
                expect(action.fields['Status']).toBe('Active');
            }
        });

        it('should include Config JSON with correct routing info', () => {
            const result = generator.Generate(createConfig());
            const getAction = result.ActionRecords.find(a => a.fields['Name'] === 'TestCRM - Get Contact');
            expect(getAction).toBeDefined();

            const config = JSON.parse(getAction!.fields['Config'] as string);
            expect(config.IntegrationName).toBe('TestCRM');
            expect(config.ObjectName).toBe('contacts');
            expect(config.Verb).toBe('Get');
        });

        it('should use @lookup for CategoryID', () => {
            const result = generator.Generate(createConfig());
            for (const action of result.ActionRecords) {
                expect(action.fields['CategoryID']).toBe('@lookup:MJ: Action Categories.Name=TestCategory');
            }
        });

        it('should use custom IconClass if provided', () => {
            const config = createConfig({ IconClass: 'fa-brands fa-hubspot' });
            const result = generator.Generate(config);
            for (const action of result.ActionRecords) {
                expect(action.fields['IconClass']).toBe('fa-brands fa-hubspot');
            }
        });

        it('should default IconClass to fa-solid fa-plug', () => {
            const config = createConfig();
            delete (config as Record<string, unknown>)['IconClass']; // explicitly undefined
            const result = generator.Generate(config);
            for (const action of result.ActionRecords) {
                expect(action.fields['IconClass']).toBe('fa-solid fa-plug');
            }
        });
    });

    describe('Get action params', () => {
        it('should include ExternalID as required input', () => {
            const result = generator.Generate(createConfig());
            const getAction = result.ActionRecords.find(a => (a.fields['Name'] as string).includes('Get Contact'));
            const params = getAction!.relatedEntities['MJ: Action Params'];

            const externalIdParam = params.find(p => p.fields['Name'] === 'ExternalID' && p.fields['Type'] === 'Both');
            expect(externalIdParam).toBeDefined();
            expect(externalIdParam!.fields['IsRequired']).toBe(true);
        });

        it('should include output params for each field', () => {
            const result = generator.Generate(createConfig());
            const getAction = result.ActionRecords.find(a => (a.fields['Name'] as string).includes('Get Contact'));
            const params = getAction!.relatedEntities['MJ: Action Params'];

            const outputParams = params.filter(p => p.fields['Type'] === 'Output');
            // Should have: Record (system), plus email, firstname, hs_object_id, createdate (per-field)
            // ExternalID is now Type='Both', not Output
            expect(outputParams.length).toBeGreaterThanOrEqual(5);

            const emailOutput = outputParams.find(p => p.fields['Name'] === 'email');
            expect(emailOutput).toBeDefined();
        });

        it('should use @parent:ID for ActionID', () => {
            const result = generator.Generate(createConfig());
            for (const action of result.ActionRecords) {
                for (const param of action.relatedEntities['MJ: Action Params']) {
                    expect(param.fields['ActionID']).toBe('@parent:ID');
                }
            }
        });
    });

    describe('Create action params', () => {
        it('should include writable fields as input params', () => {
            const result = generator.Generate(createConfig());
            const createAction = result.ActionRecords.find(a => (a.fields['Name'] as string).includes('Create Contact'));
            const inputParams = createAction!.relatedEntities['MJ: Action Params'].filter(p => p.fields['Type'] === 'Input');

            const paramNames = inputParams.map(p => p.fields['Name'] as string);
            expect(paramNames).toContain('email');
            expect(paramNames).toContain('firstname');
        });

        it('should exclude read-only and primary key fields from create inputs', () => {
            const result = generator.Generate(createConfig());
            const createAction = result.ActionRecords.find(a => (a.fields['Name'] as string).includes('Create Contact'));
            const inputParams = createAction!.relatedEntities['MJ: Action Params'].filter(p => p.fields['Type'] === 'Input');

            const paramNames = inputParams.map(p => p.fields['Name'] as string);
            expect(paramNames).not.toContain('hs_object_id'); // PK
            expect(paramNames).not.toContain('createdate'); // read-only
        });

        it('should respect field IsRequired for create params', () => {
            const result = generator.Generate(createConfig());
            const createAction = result.ActionRecords.find(a => (a.fields['Name'] as string).includes('Create Contact'));
            const inputParams = createAction!.relatedEntities['MJ: Action Params'].filter(p => p.fields['Type'] === 'Input');

            const emailParam = inputParams.find(p => p.fields['Name'] === 'email');
            expect(emailParam!.fields['IsRequired']).toBe(true);

            const firstnameParam = inputParams.find(p => p.fields['Name'] === 'firstname');
            expect(firstnameParam!.fields['IsRequired']).toBe(false);
        });
    });

    describe('Update action params', () => {
        it('should include ExternalID as required input', () => {
            const result = generator.Generate(createConfig());
            const updateAction = result.ActionRecords.find(a => (a.fields['Name'] as string).includes('Update Contact'));
            const params = updateAction!.relatedEntities['MJ: Action Params'];

            const idParam = params.find(p => p.fields['Name'] === 'ExternalID' && p.fields['Type'] === 'Both');
            expect(idParam).toBeDefined();
            expect(idParam!.fields['IsRequired']).toBe(true);
        });

        it('should make all field params optional for updates (partial update)', () => {
            const result = generator.Generate(createConfig());
            const updateAction = result.ActionRecords.find(a => (a.fields['Name'] as string).includes('Update Contact'));
            const fieldParams = updateAction!.relatedEntities['MJ: Action Params'].filter(
                p => p.fields['Type'] === 'Input' && p.fields['Name'] !== 'ExternalID' && p.fields['Name'] !== 'CompanyIntegrationID'
            );

            for (const param of fieldParams) {
                expect(param.fields['IsRequired']).toBe(false);
            }
        });
    });

    describe('Delete action params', () => {
        it('should only have ExternalID and CompanyIntegrationID as inputs', () => {
            const result = generator.Generate(createConfig());
            const deleteAction = result.ActionRecords.find(a => (a.fields['Name'] as string).includes('Delete Contact'));
            const inputParams = deleteAction!.relatedEntities['MJ: Action Params'].filter(p => p.fields['Type'] === 'Input');

            expect(inputParams).toHaveLength(2);
            const names = inputParams.map(p => p.fields['Name'] as string);
            expect(names).toContain('ExternalID');
            expect(names).toContain('CompanyIntegrationID');
        });
    });

    describe('Search action params', () => {
        it('should include pagination params', () => {
            const result = generator.Generate(createConfig());
            const searchAction = result.ActionRecords.find(a => (a.fields['Name'] as string).includes('Search Contact'));
            const params = searchAction!.relatedEntities['MJ: Action Params'];
            const names = params.map(p => p.fields['Name'] as string);

            expect(names).toContain('PageSize');
            expect(names).toContain('Page');
            expect(names).toContain('Sort');
        });

        it('should include Records, TotalCount, HasMore as outputs', () => {
            const result = generator.Generate(createConfig());
            const searchAction = result.ActionRecords.find(a => (a.fields['Name'] as string).includes('Search Contact'));
            const outputParams = searchAction!.relatedEntities['MJ: Action Params'].filter(p => p.fields['Type'] === 'Output');
            const outputNames = outputParams.map(p => p.fields['Name'] as string);

            expect(outputNames).toContain('Records');
            expect(outputNames).toContain('TotalCount');
            expect(outputNames).toContain('HasMore');
        });
    });

    describe('List action params', () => {
        it('should include Cursor for cursor-based pagination', () => {
            const result = generator.Generate(createConfig());
            const listAction = result.ActionRecords.find(a => (a.fields['Name'] as string).includes('List Contact'));
            const params = listAction!.relatedEntities['MJ: Action Params'];
            const names = params.map(p => p.fields['Name'] as string);

            expect(names).toContain('Cursor');
            expect(names).toContain('PageSize');
        });

        it('should include NextCursor in outputs', () => {
            const result = generator.Generate(createConfig());
            const listAction = result.ActionRecords.find(a => (a.fields['Name'] as string).includes('List Contact'));
            const outputParams = listAction!.relatedEntities['MJ: Action Params'].filter(p => p.fields['Type'] === 'Output');
            const outputNames = outputParams.map(p => p.fields['Name'] as string);

            expect(outputNames).toContain('NextCursor');
            expect(outputNames).toContain('Records');
            expect(outputNames).toContain('HasMore');
        });
    });

    describe('Result codes', () => {
        it('should include SUCCESS for all verbs', () => {
            const result = generator.Generate(createConfig());
            for (const action of result.ActionRecords) {
                const codes = action.relatedEntities['MJ: Action Result Codes'];
                const successCode = codes.find(c => c.fields['ResultCode'] === 'SUCCESS');
                expect(successCode).toBeDefined();
                expect(successCode!.fields['IsSuccess']).toBe(true);
            }
        });

        it('should include NOT_FOUND for Get actions', () => {
            const result = generator.Generate(createConfig());
            const getAction = result.ActionRecords.find(a => (a.fields['Name'] as string).includes('Get Contact'));
            const codes = getAction!.relatedEntities['MJ: Action Result Codes'];
            const notFound = codes.find(c => c.fields['ResultCode'] === 'NOT_FOUND');
            expect(notFound).toBeDefined();
            expect(notFound!.fields['IsSuccess']).toBe(false);
        });

        it('should include verb-specific failure codes for mutation verbs', () => {
            const result = generator.Generate(createConfig());

            const createAction = result.ActionRecords.find(a => (a.fields['Name'] as string).includes('Create Contact'));
            const createCodes = createAction!.relatedEntities['MJ: Action Result Codes'];
            expect(createCodes.find(c => c.fields['ResultCode'] === 'CREATE_FAILED')).toBeDefined();
            expect(createCodes.find(c => c.fields['ResultCode'] === 'NOT_SUPPORTED')).toBeDefined();

            const deleteAction = result.ActionRecords.find(a => (a.fields['Name'] as string).includes('Delete Contact'));
            const deleteCodes = deleteAction!.relatedEntities['MJ: Action Result Codes'];
            expect(deleteCodes.find(c => c.fields['ResultCode'] === 'DELETE_FAILED')).toBeDefined();
        });

        it('should use @parent:ID for ActionID in result codes', () => {
            const result = generator.Generate(createConfig());
            for (const action of result.ActionRecords) {
                for (const code of action.relatedEntities['MJ: Action Result Codes']) {
                    expect(code.fields['ActionID']).toBe('@parent:ID');
                }
            }
        });
    });

    describe('DisplayName fallback', () => {
        it('should humanize object name when DisplayName is empty', () => {
            const config = createConfig({
                Objects: [createMinimalObject({ Name: 'line_items', DisplayName: '' })],
            });
            const result = generator.Generate(config);
            const names = result.ActionRecords.map(a => a.fields['Name'] as string);
            expect(names).toContain('TestCRM - Get Line Items');
        });
    });
});
