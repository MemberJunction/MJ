/**
 * Wicket Schema Generator — uses SchemaBuilder to produce:
 *   1. Migration SQL for all 18 Wicket sink tables
 *   2. additionalSchemaInfo.json with soft PKs and FKs
 *
 * Run from repo root:
 *   node packages/Integration/connectors/generate-wicket-schema.mjs
 */
import { SchemaBuilder } from '@memberjunction/integration-schema-builder';
import * as fs from 'fs';
import * as path from 'path';

// ─── Source Schema Definition ────────────────────────────────────────
// Mirrors the Wicket JSON:API objects exactly as they come from the API.

/** Helper: build a SourceFieldInfo with defaults. */
function field(name, sourceType, opts = {}) {
    return {
        Name: name,
        Label: opts.label ?? name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        Description: opts.description ?? '',
        SourceType: sourceType,
        IsRequired: opts.required ?? false,
        MaxLength: opts.maxLength ?? null,
        Precision: opts.precision ?? null,
        Scale: opts.scale ?? null,
        DefaultValue: opts.defaultValue ?? null,
        IsPrimaryKey: opts.pk ?? false,
    };
}

/** Helper: standard source timestamps. */
function sourceTimestamps(includeUpdated = true) {
    const fields = [field('created_at', 'datetime', { label: 'Created At', description: 'Source system creation timestamp' })];
    if (includeUpdated) {
        fields.push(field('updated_at', 'datetime', { label: 'Updated At', description: 'Source system last update timestamp' }));
    }
    return fields;
}

const sourceSchema = {
    Objects: [
        // ═══ CORE ═══
        {
            ExternalName: 'people',
            ExternalLabel: 'People',
            Description: 'People (members, contacts) with personal, professional, and membership information',
            PrimaryKeyFields: ['uuid'],
            Relationships: [],
            Fields: [
                field('uuid', 'string', { pk: true, required: true, maxLength: 36, label: 'UUID', description: 'Wicket person UUID' }),
                field('given_name', 'string', { maxLength: 255 }),
                field('family_name', 'string', { maxLength: 255 }),
                field('additional_name', 'string', { maxLength: 255 }),
                field('alternate_name', 'string', { maxLength: 255 }),
                field('full_name', 'string', { maxLength: 500, description: 'Computed full name' }),
                field('identifying_number', 'string', { maxLength: 255 }),
                field('slug', 'string', { maxLength: 255 }),
                field('gender', 'string', { maxLength: 50 }),
                field('birth_date', 'date'),
                field('language', 'string', { maxLength: 10 }),
                field('preferred_pronoun', 'string', { maxLength: 50 }),
                field('job_title', 'string', { maxLength: 500 }),
                field('honorific_prefix', 'string', { maxLength: 50 }),
                field('honorific_suffix', 'string', { maxLength: 50 }),
                field('languages_spoken', 'string', { maxLength: 500, description: 'Comma-separated language codes' }),
                field('languages_written', 'string', { maxLength: 500, description: 'Comma-separated language codes' }),
                field('membership_number', 'string', { maxLength: 100 }),
                field('membership_began_on', 'date'),
                field('data_fields', 'json', { description: 'Custom data fields JSON' }),
                ...sourceTimestamps(),
            ],
        },
        {
            ExternalName: 'organizations',
            ExternalLabel: 'Organizations',
            Description: 'Organizations (companies, chapters, affiliates)',
            PrimaryKeyFields: ['uuid'],
            Relationships: [],
            Fields: [
                field('uuid', 'string', { pk: true, required: true, maxLength: 36, label: 'UUID' }),
                field('type', 'string', { maxLength: 100, description: 'Organization type' }),
                field('legal_name', 'string', { maxLength: 500 }),
                field('alternate_name', 'string', { maxLength: 500 }),
                field('description', 'text'),
                field('identifying_number', 'string', { maxLength: 255 }),
                field('data_fields', 'json', { description: 'Custom data fields JSON' }),
                ...sourceTimestamps(),
            ],
        },
        {
            ExternalName: 'connections',
            ExternalLabel: 'Connections',
            Description: 'Links between people and organizations (employment, affiliation)',
            PrimaryKeyFields: ['uuid'],
            Relationships: [
                { FieldName: 'person_id', TargetObject: 'people', TargetField: 'uuid' },
                { FieldName: 'organization_id', TargetObject: 'organizations', TargetField: 'uuid' },
            ],
            Fields: [
                field('uuid', 'string', { pk: true, required: true, maxLength: 36 }),
                field('type', 'string', { maxLength: 100 }),
                field('person_id', 'string', { maxLength: 36, description: 'FK to people.uuid' }),
                field('organization_id', 'string', { maxLength: 36, description: 'FK to organizations.uuid' }),
                ...sourceTimestamps(),
            ],
        },
        {
            ExternalName: 'groups',
            ExternalLabel: 'Groups',
            Description: 'Groups (committees, chapters, teams)',
            PrimaryKeyFields: ['uuid'],
            Relationships: [],
            Fields: [
                field('uuid', 'string', { pk: true, required: true, maxLength: 36 }),
                field('name', 'string', { maxLength: 500 }),
                field('slug', 'string', { maxLength: 255 }),
                field('description', 'text'),
                ...sourceTimestamps(),
            ],
        },
        {
            ExternalName: 'group_members',
            ExternalLabel: 'Group Members',
            Description: 'People who belong to groups',
            PrimaryKeyFields: ['uuid'],
            Relationships: [
                { FieldName: 'group_id', TargetObject: 'groups', TargetField: 'uuid' },
                { FieldName: 'person_id', TargetObject: 'people', TargetField: 'uuid' },
            ],
            Fields: [
                field('uuid', 'string', { pk: true, required: true, maxLength: 36 }),
                field('group_id', 'string', { maxLength: 36, description: 'FK to groups.uuid' }),
                field('person_id', 'string', { maxLength: 36, description: 'FK to people.uuid' }),
                ...sourceTimestamps(),
            ],
        },
        // ═══ MEMBERSHIPS ═══
        {
            ExternalName: 'memberships',
            ExternalLabel: 'Memberships',
            Description: 'Membership tier definitions (e.g., Gold, Silver, Bronze)',
            PrimaryKeyFields: ['uuid'],
            Relationships: [],
            Fields: [
                field('uuid', 'string', { pk: true, required: true, maxLength: 36 }),
                field('name', 'string', { maxLength: 500 }),
                field('slug', 'string', { maxLength: 255 }),
                field('description', 'text'),
                ...sourceTimestamps(),
            ],
        },
        {
            ExternalName: 'person_memberships',
            ExternalLabel: 'Person Memberships',
            Description: 'Individual membership assignments (a person holding a specific membership tier)',
            PrimaryKeyFields: ['uuid'],
            Relationships: [
                { FieldName: 'person_id', TargetObject: 'people', TargetField: 'uuid' },
                { FieldName: 'membership_id', TargetObject: 'memberships', TargetField: 'uuid' },
                { FieldName: 'organization_membership_id', TargetObject: 'organization_memberships', TargetField: 'uuid' },
            ],
            Fields: [
                field('uuid', 'string', { pk: true, required: true, maxLength: 36 }),
                field('starts_at', 'datetime'),
                field('ends_at', 'datetime'),
                field('person_id', 'string', { maxLength: 36, description: 'FK to people.uuid' }),
                field('membership_id', 'string', { maxLength: 36, description: 'FK to memberships.uuid' }),
                field('organization_membership_id', 'string', { maxLength: 36, description: 'FK to organization_memberships.uuid' }),
                ...sourceTimestamps(),
            ],
        },
        {
            ExternalName: 'organization_memberships',
            ExternalLabel: 'Organization Memberships',
            Description: 'Organization-level membership (an org holding a tier with seat assignments)',
            PrimaryKeyFields: ['uuid'],
            Relationships: [
                { FieldName: 'organization_id', TargetObject: 'organizations', TargetField: 'uuid' },
                { FieldName: 'membership_id', TargetObject: 'memberships', TargetField: 'uuid' },
            ],
            Fields: [
                field('uuid', 'string', { pk: true, required: true, maxLength: 36 }),
                field('starts_at', 'datetime'),
                field('ends_at', 'datetime'),
                field('max_assignments', 'integer'),
                field('organization_id', 'string', { maxLength: 36, description: 'FK to organizations.uuid' }),
                field('membership_id', 'string', { maxLength: 36, description: 'FK to memberships.uuid' }),
                ...sourceTimestamps(),
            ],
        },
        // ═══ CONTACT INFO — PEOPLE ═══
        {
            ExternalName: 'people_emails',
            ExternalLabel: 'People Emails',
            Description: 'Email addresses for people',
            PrimaryKeyFields: ['uuid'],
            Relationships: [
                { FieldName: 'person_id', TargetObject: 'people', TargetField: 'uuid' },
            ],
            Fields: [
                field('uuid', 'string', { pk: true, required: true, maxLength: 36 }),
                field('address', 'string', { maxLength: 500, description: 'Email address' }),
                field('type', 'string', { maxLength: 100, description: 'Email type (work, personal, etc.)' }),
                field('primary', 'boolean', { description: 'Whether this is the primary email' }),
                field('person_id', 'string', { maxLength: 36, description: 'FK to people.uuid' }),
                ...sourceTimestamps(),
            ],
        },
        {
            ExternalName: 'people_phones',
            ExternalLabel: 'People Phones',
            Description: 'Phone numbers for people',
            PrimaryKeyFields: ['uuid'],
            Relationships: [
                { FieldName: 'person_id', TargetObject: 'people', TargetField: 'uuid' },
            ],
            Fields: [
                field('uuid', 'string', { pk: true, required: true, maxLength: 36 }),
                field('number', 'string', { maxLength: 50 }),
                field('type', 'string', { maxLength: 100 }),
                field('extension', 'string', { maxLength: 20 }),
                field('primary', 'boolean', { description: 'Whether this is the primary phone' }),
                field('person_id', 'string', { maxLength: 36, description: 'FK to people.uuid' }),
                ...sourceTimestamps(),
            ],
        },
        {
            ExternalName: 'people_addresses',
            ExternalLabel: 'People Addresses',
            Description: 'Physical addresses for people',
            PrimaryKeyFields: ['uuid'],
            Relationships: [
                { FieldName: 'person_id', TargetObject: 'people', TargetField: 'uuid' },
            ],
            Fields: [
                field('uuid', 'string', { pk: true, required: true, maxLength: 36 }),
                field('address1', 'string', { maxLength: 500 }),
                field('address2', 'string', { maxLength: 500 }),
                field('city', 'string', { maxLength: 255 }),
                field('state_province', 'string', { maxLength: 255 }),
                field('zip_code', 'string', { maxLength: 20 }),
                field('country_code', 'string', { maxLength: 10 }),
                field('type', 'string', { maxLength: 100 }),
                field('primary', 'boolean', { description: 'Whether this is the primary address' }),
                field('person_id', 'string', { maxLength: 36, description: 'FK to people.uuid' }),
                ...sourceTimestamps(),
            ],
        },
        // ═══ CONTACT INFO — ORGANIZATIONS ═══
        {
            ExternalName: 'org_emails',
            ExternalLabel: 'Organization Emails',
            Description: 'Email addresses for organizations',
            PrimaryKeyFields: ['uuid'],
            Relationships: [
                { FieldName: 'organization_id', TargetObject: 'organizations', TargetField: 'uuid' },
            ],
            Fields: [
                field('uuid', 'string', { pk: true, required: true, maxLength: 36 }),
                field('address', 'string', { maxLength: 500 }),
                field('type', 'string', { maxLength: 100 }),
                field('primary', 'boolean'),
                field('organization_id', 'string', { maxLength: 36, description: 'FK to organizations.uuid' }),
                ...sourceTimestamps(),
            ],
        },
        {
            ExternalName: 'org_phones',
            ExternalLabel: 'Organization Phones',
            Description: 'Phone numbers for organizations',
            PrimaryKeyFields: ['uuid'],
            Relationships: [
                { FieldName: 'organization_id', TargetObject: 'organizations', TargetField: 'uuid' },
            ],
            Fields: [
                field('uuid', 'string', { pk: true, required: true, maxLength: 36 }),
                field('number', 'string', { maxLength: 50 }),
                field('type', 'string', { maxLength: 100 }),
                field('extension', 'string', { maxLength: 20 }),
                field('primary', 'boolean'),
                field('organization_id', 'string', { maxLength: 36, description: 'FK to organizations.uuid' }),
                ...sourceTimestamps(),
            ],
        },
        {
            ExternalName: 'org_addresses',
            ExternalLabel: 'Organization Addresses',
            Description: 'Physical addresses for organizations',
            PrimaryKeyFields: ['uuid'],
            Relationships: [
                { FieldName: 'organization_id', TargetObject: 'organizations', TargetField: 'uuid' },
            ],
            Fields: [
                field('uuid', 'string', { pk: true, required: true, maxLength: 36 }),
                field('address1', 'string', { maxLength: 500 }),
                field('address2', 'string', { maxLength: 500 }),
                field('city', 'string', { maxLength: 255 }),
                field('state_province', 'string', { maxLength: 255 }),
                field('zip_code', 'string', { maxLength: 20 }),
                field('country_code', 'string', { maxLength: 10 }),
                field('type', 'string', { maxLength: 100 }),
                field('primary', 'boolean'),
                field('organization_id', 'string', { maxLength: 36, description: 'FK to organizations.uuid' }),
                ...sourceTimestamps(),
            ],
        },
        // ═══ ACTIVITY ═══
        {
            ExternalName: 'touchpoints',
            ExternalLabel: 'Touchpoints',
            Description: 'Immutable audit trail of interactions (events, activities)',
            PrimaryKeyFields: ['uuid'],
            Relationships: [
                { FieldName: 'person_id', TargetObject: 'people', TargetField: 'uuid' },
            ],
            Fields: [
                field('uuid', 'string', { pk: true, required: true, maxLength: 36 }),
                field('action', 'string', { maxLength: 500 }),
                field('person_id', 'string', { maxLength: 36, description: 'FK to people.uuid' }),
                field('data', 'json', { description: 'Touchpoint payload JSON' }),
                ...sourceTimestamps(false), // touchpoints are immutable — no updated_at
            ],
        },
        // ═══ SECURITY & METADATA ═══
        {
            ExternalName: 'roles',
            ExternalLabel: 'Roles',
            Description: 'Security roles in the Wicket system',
            PrimaryKeyFields: ['uuid'],
            Relationships: [],
            Fields: [
                field('uuid', 'string', { pk: true, required: true, maxLength: 36 }),
                field('name', 'string', { maxLength: 500 }),
                field('slug', 'string', { maxLength: 255 }),
                field('description', 'text'),
                ...sourceTimestamps(),
            ],
        },
        {
            ExternalName: 'user_identities',
            ExternalLabel: 'User Identities',
            Description: 'Authentication identities (SSO, OAuth) linked to people',
            PrimaryKeyFields: ['uuid'],
            Relationships: [
                { FieldName: 'person_id', TargetObject: 'people', TargetField: 'uuid' },
            ],
            Fields: [
                field('uuid', 'string', { pk: true, required: true, maxLength: 36 }),
                field('provider', 'string', { maxLength: 255, description: 'Auth provider (e.g., auth0, okta)' }),
                field('uid', 'string', { maxLength: 500, description: 'Provider-specific user identifier' }),
                field('person_id', 'string', { maxLength: 36, description: 'FK to people.uuid' }),
                ...sourceTimestamps(),
            ],
        },
        {
            ExternalName: 'resource_tags',
            ExternalLabel: 'Resource Tags',
            Description: 'Tags applied to resources in the Wicket system',
            PrimaryKeyFields: ['uuid'],
            Relationships: [],
            Fields: [
                field('uuid', 'string', { pk: true, required: true, maxLength: 36 }),
                field('name', 'string', { maxLength: 500 }),
                field('slug', 'string', { maxLength: 255 }),
                field('resource_type', 'string', { maxLength: 255, description: 'Type of resource this tag applies to' }),
                // resource_tags are metadata — no timestamps from API
            ],
        },
    ],
};

// ─── Target Configs: 1:1 clone from source ────────────────────────────

const SCHEMA = 'wicket';

/** Map source object name → target table name. */
const TABLE_MAP = {
    people: 'Person',
    organizations: 'Organization',
    connections: 'Connection',
    groups: 'WicketGroup',         // "Group" is a SQL reserved word
    group_members: 'GroupMember',
    memberships: 'Membership',
    person_memberships: 'PersonMembership',
    organization_memberships: 'OrganizationMembership',
    people_emails: 'PersonEmail',
    people_phones: 'PersonPhone',
    people_addresses: 'PersonAddress',
    org_emails: 'OrganizationEmail',
    org_phones: 'OrganizationPhone',
    org_addresses: 'OrganizationAddress',
    touchpoints: 'Touchpoint',
    roles: 'Role',
    user_identities: 'UserIdentity',
    resource_tags: 'ResourceTag',
};

/** Column name overrides: source field → target column (for reserved words). */
const COLUMN_RENAMES = {
    primary: 'is_primary',       // PRIMARY is a SQL reserved word
    created_at: 'source_created_at',  // Avoid collision with __mj_CreatedAt
    updated_at: 'source_updated_at',  // Avoid collision with __mj_UpdatedAt
};

const typeMapper = {
    mapType(sourceType, maxLength) {
        // We populate TargetSqlType for SQL Server here since
        // SchemaBuilder doesn't auto-populate it from SourceFieldInfo
        switch (sourceType) {
            case 'string':
                if (maxLength && maxLength > 0) {
                    return maxLength > 4000 ? 'NVARCHAR(MAX)' : `NVARCHAR(${maxLength})`;
                }
                return 'NVARCHAR(255)';
            case 'text':     return 'NVARCHAR(MAX)';
            case 'integer':  return 'INT';
            case 'bigint':   return 'BIGINT';
            case 'boolean':  return 'BIT';
            case 'datetime': return 'DATETIMEOFFSET';
            case 'date':     return 'DATE';
            case 'uuid':     return 'UNIQUEIDENTIFIER';
            case 'json':     return 'NVARCHAR(MAX)';
            case 'float':    return 'FLOAT';
            case 'decimal':  return 'DECIMAL(18,2)';
            default:         return 'NVARCHAR(MAX)';
        }
    }
};

function buildTargetConfigs() {
    const configs = [];
    for (const srcObj of sourceSchema.Objects) {
        const tableName = TABLE_MAP[srcObj.ExternalName];
        if (!tableName) {
            throw new Error(`No table mapping for source object: ${srcObj.ExternalName}`);
        }

        const columns = srcObj.Fields.map(f => {
            const targetName = COLUMN_RENAMES[f.Name] ?? f.Name;
            return {
                SourceFieldName: f.Name,
                TargetColumnName: targetName,
                TargetSqlType: typeMapper.mapType(f.SourceType, f.MaxLength),
                IsNullable: !f.IsRequired,
                MaxLength: f.MaxLength,
                Precision: f.Precision,
                Scale: f.Scale,
                DefaultValue: f.DefaultValue,
                Description: f.Description || undefined,
            };
        });

        configs.push({
            SourceObjectName: srcObj.ExternalName,
            SchemaName: SCHEMA,
            TableName: tableName,
            EntityName: `Wicket ${tableName.replace(/([a-z])([A-Z])/g, '$1 $2')}`, // PascalCase → spaced
            Description: srcObj.Description,
            PrimaryKeyFields: ['uuid'],
            Columns: columns,
            SoftForeignKeys: [], // Let SchemaBuilder derive from source relationships
        });
    }
    return configs;
}

// ─── Run SchemaBuilder ───────────────────────────────────────────────

const repoRoot = path.resolve(import.meta.dirname, '../../..');

const input = {
    SourceSchema: sourceSchema,
    TargetConfigs: buildTargetConfigs(),
    Platform: 'sqlserver',
    MJVersion: '5.12',
    SourceType: 'Wicket',
    AdditionalSchemaInfoPath: 'metadata/integrations/additionalSchemaInfo.json',
    MigrationsDir: 'migrations/v5',
    MetadataDir: 'metadata/integrations',
    ExistingTables: [],           // Clean slate — no existing tables
    EntitySettingsForTargets: {}, // All custom schema — no __mj targets
};

const builder = new SchemaBuilder();
const output = builder.BuildSchema(input);

// ─── Report ──────────────────────────────────────────────────────────

if (output.Errors.length > 0) {
    console.error('ERRORS:');
    output.Errors.forEach(e => console.error(`  ✗ ${e}`));
    process.exit(1);
}

if (output.Warnings.length > 0) {
    console.warn('WARNINGS:');
    output.Warnings.forEach(w => console.warn(`  ⚠ ${w}`));
}

// ─── Write files ─────────────────────────────────────────────────────

const allFiles = [
    ...output.MigrationFiles,
    ...(output.AdditionalSchemaInfoUpdate ? [output.AdditionalSchemaInfoUpdate] : []),
    ...output.MetadataFiles,
];

for (const file of allFiles) {
    const fullPath = path.join(repoRoot, file.FilePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, file.Content, 'utf-8');
    console.log(`✓ ${file.FilePath}`);
    console.log(`  ${file.Description}`);
}

console.log(`\nDone! Generated ${allFiles.length} file(s).`);
