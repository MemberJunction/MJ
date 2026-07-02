import { describe, it, expect } from 'vitest';
import type { CuratedFormSchema } from '@memberjunction/interactive-component-types/forms';
import { buildFixtureFormHostProps } from '../ComponentStudio/services/form-host-props-fixture';

function schema(overrides: Partial<CuratedFormSchema> = {}): CuratedFormSchema {
    return {
        entityName: 'Customers',
        displayName: 'Customer',
        nameField: 'Name',
        fields: [],
        ...overrides,
    };
}

describe('buildFixtureFormHostProps', () => {
    it('builds the FormHostProps envelope from a curated schema', () => {
        const s = schema({
            fields: [
                { name: 'ID', type: 'string', required: false, isPrimaryKey: true, sequence: 0 },
                { name: 'Name', type: 'string', required: true, isPrimaryKey: false, sequence: 1, maxLength: 100 },
            ],
        });
        const props = buildFixtureFormHostProps(s, 'edit');
        expect(props.entityName).toBe('Customers');
        expect(props.entityMetadata.displayName).toBe('Customer');
        expect(props.entityMetadata.nameField).toBe('Name');
        expect(props.mode).toBe('edit');
        expect(props.canEdit).toBe(true);
        expect(props.canDelete).toBe(true);
        expect(props.canCreate).toBe(true);
    });

    it('synthesises type-appropriate sample values per field', () => {
        const s = schema({
            fields: [
                { name: 'Name', type: 'string', required: false, isPrimaryKey: false, sequence: 1, maxLength: 200 },
                { name: 'Count', type: 'number', required: false, isPrimaryKey: false, sequence: 2 },
                { name: 'Active', type: 'boolean', required: false, isPrimaryKey: false, sequence: 3 },
                { name: 'When', type: 'datetime', required: false, isPrimaryKey: false, sequence: 4 },
                { name: 'Status', type: 'enum', required: false, isPrimaryKey: false, sequence: 5,
                  allowedValues: ['Active', 'Inactive'] },
                { name: 'AccountID', type: 'foreign-key', required: false, isPrimaryKey: false, sequence: 6,
                  references: { entity: 'Accounts', displayField: 'Name' } },
            ],
        });
        const props = buildFixtureFormHostProps(s, 'view');
        const rec = props.record as Record<string, unknown>;
        expect(rec.Name).toBe('Sample Name');
        expect(rec.Count).toBe(42);
        expect(rec.Active).toBe(true);
        expect(typeof rec.When).toBe('string');
        expect(rec.Status).toBe('Active');
        expect(rec.AccountID).toMatchObject({ Name: 'Sample Accounts' });
    });

    it('short strings (maxLength <= 24) get a brief "Sample" fixture', () => {
        const s = schema({
            fields: [
                { name: 'Code', type: 'string', required: false, isPrimaryKey: false, sequence: 1, maxLength: 8 },
            ],
        });
        const props = buildFixtureFormHostProps(s);
        expect((props.record as Record<string, unknown>).Code).toBe('Sample');
    });

    it('populates primaryKey from PK fields when not in create mode', () => {
        const s = schema({
            fields: [
                { name: 'ID', type: 'string', required: false, isPrimaryKey: true, sequence: 0 },
                { name: 'Name', type: 'string', required: true, isPrimaryKey: false, sequence: 1 },
            ],
        });
        const props = buildFixtureFormHostProps(s, 'view');
        expect(props.primaryKey).not.toBeNull();
        expect((props.primaryKey as Record<string, unknown>).ID).toBeTruthy();
    });

    it('omits primaryKey in create mode', () => {
        const s = schema({
            fields: [
                { name: 'ID', type: 'string', required: false, isPrimaryKey: true, sequence: 0 },
            ],
        });
        const props = buildFixtureFormHostProps(s, 'create');
        expect(props.primaryKey).toBeNull();
    });

    it('omits primaryKey when the entity has no PK', () => {
        const s = schema({
            fields: [
                { name: 'Name', type: 'string', required: true, isPrimaryKey: false, sequence: 0 },
            ],
        });
        const props = buildFixtureFormHostProps(s);
        expect(props.primaryKey).toBeNull();
    });

    it('falls back to "Name" when FK target has no displayField', () => {
        const s = schema({
            fields: [
                { name: 'AccountID', type: 'foreign-key', required: false, isPrimaryKey: false, sequence: 0,
                  references: { entity: 'Accounts' } },
            ],
        });
        const props = buildFixtureFormHostProps(s);
        expect((props.record as Record<string, unknown>).AccountID).toMatchObject({ Name: 'Sample Accounts' });
    });

    it('strips "MJ:" prefix from FK fixture entity name', () => {
        const s = schema({
            fields: [
                { name: 'AppID', type: 'foreign-key', required: false, isPrimaryKey: false, sequence: 0,
                  references: { entity: 'MJ: Applications', displayField: 'Name' } },
            ],
        });
        const props = buildFixtureFormHostProps(s);
        const fk = (props.record as Record<string, unknown>).AppID as Record<string, unknown>;
        expect(fk.Name).toBe('Sample Applications');
    });
});
