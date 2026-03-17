/**
 * Generates MJ Action metadata files (mj-sync format) from integration connector
 * metadata — IntegrationObjects and IntegrationObjectFields.
 *
 * For each supported object, this generator emits one action per CRUD verb
 * (Get, Create, Update, Delete, Search, List) with strongly-typed ActionParams
 * derived from the object's fields.
 *
 * Output is designed to be written directly to /metadata/ for `mj sync push`.
 */

// ─── Types ───────────────────────────────────────────────────────────

/** CRUD verb that an integration action can dispatch to */
type IntegrationActionVerb = 'Get' | 'Create' | 'Update' | 'Delete' | 'Search' | 'List';

/** Simplified representation of an integration object for generation */
export interface IntegrationObjectInfo {
    /** Object name in the external system (e.g., "contacts", "deals") */
    Name: string;
    /** Human-readable display name (e.g., "Contacts", "Deals") */
    DisplayName: string;
    /** Object description */
    Description?: string;
    /** Whether the connector supports writing to this object */
    SupportsWrite: boolean;
    /** Fields on this object */
    Fields: IntegrationFieldInfo[];
    /**
     * Whether to include this object in action generation. Defaults to true.
     * Set to false for objects that should be available for API property lookups
     * but don't suit generic CRUD action patterns (e.g., activity objects).
     */
    IncludeInActionGeneration?: boolean;
}

/** Simplified representation of an integration object field for generation */
export interface IntegrationFieldInfo {
    /** Field name in the external system (e.g., "email", "firstname") */
    Name: string;
    /** Human-readable display name */
    DisplayName: string;
    /** Field description */
    Description?: string;
    /** Field data type (e.g., "string", "number", "datetime", "boolean") */
    Type: string;
    /** Whether this field is required for creates */
    IsRequired: boolean;
    /** Whether this field is read-only (should not appear in Create/Update params) */
    IsReadOnly: boolean;
    /** Whether this field is the primary key */
    IsPrimaryKey: boolean;
}

/** Configuration for the generator */
export interface ActionGeneratorConfig {
    /** Integration name (e.g., "HubSpot", "Salesforce") */
    IntegrationName: string;
    /** Action category name for all generated actions */
    CategoryName: string;
    /** Icon class for generated actions (Font Awesome) */
    IconClass?: string;
    /** Objects to generate actions for */
    Objects: IntegrationObjectInfo[];
    /** Whether to include Search actions (requires connector support) */
    IncludeSearch?: boolean;
    /** Whether to include List actions (requires connector support) */
    IncludeList?: boolean;
}

/** A single generated action record in mj-sync format */
interface ActionRecord {
    fields: Record<string, unknown>;
    relatedEntities: {
        'MJ: Action Params': ActionParamRecord[];
        'MJ: Action Result Codes': ActionResultCodeRecord[];
    };
}

/** A single generated action param record in mj-sync format */
interface ActionParamRecord {
    fields: Record<string, unknown>;
}

/** A single generated result code record in mj-sync format */
interface ActionResultCodeRecord {
    fields: Record<string, unknown>;
}

/** Complete output from the generator */
export interface GeneratedActionMetadata {
    /** The .mj-sync.json configuration file content */
    SyncConfig: Record<string, unknown>;
    /** The action records JSON (array of ActionRecord) */
    ActionRecords: ActionRecord[];
}

// ─── Generator ───────────────────────────────────────────────────────

/**
 * Generates Action metadata for all objects in an integration.
 * Output is directly compatible with mj-sync push format.
 */
export class ActionMetadataGenerator {

    /**
     * Generates all action metadata for the given configuration.
     * @returns SyncConfig (for .mj-sync.json) and ActionRecords (for .actions.json)
     */
    public Generate(config: ActionGeneratorConfig): GeneratedActionMetadata {
        const actions: ActionRecord[] = [];

        for (const obj of config.Objects) {
            actions.push(...this.GenerateActionsForObject(config, obj));
        }

        return {
            SyncConfig: this.BuildSyncConfig(),
            ActionRecords: actions,
        };
    }

    // ─── Per-Object Generation ───────────────────────────────────────

    private GenerateActionsForObject(
        config: ActionGeneratorConfig,
        obj: IntegrationObjectInfo
    ): ActionRecord[] {
        const actions: ActionRecord[] = [];
        const displayName = obj.DisplayName || this.Humanize(obj.Name);

        // Get — always generated
        actions.push(this.BuildGetAction(config, obj, displayName));

        // Create/Update/Delete — only if object supports write
        if (obj.SupportsWrite) {
            actions.push(this.BuildCreateAction(config, obj, displayName));
            actions.push(this.BuildUpdateAction(config, obj, displayName));
            actions.push(this.BuildDeleteAction(config, obj, displayName));
        }

        // Search — if configured
        if (config.IncludeSearch !== false) {
            actions.push(this.BuildSearchAction(config, obj, displayName));
        }

        // List — if configured
        if (config.IncludeList !== false) {
            actions.push(this.BuildListAction(config, obj, displayName));
        }

        return actions;
    }

    // ─── Action Builders ─────────────────────────────────────────────

    private BuildGetAction(
        config: ActionGeneratorConfig,
        obj: IntegrationObjectInfo,
        displayName: string
    ): ActionRecord {
        const params: ActionParamRecord[] = [
            this.BuildSystemParam('ExternalID', 'Input', true, `The unique ID of the ${displayName} record to retrieve`),
            this.BuildSystemParam('CompanyIntegrationID', 'Input', false, 'Optional: specific CompanyIntegration to use'),
            this.BuildSystemParam('Record', 'Output', false, `The retrieved ${displayName} record with all fields`),
            this.BuildSystemParam('ExternalID', 'Output', false, `The external ID of the retrieved record`),
        ];

        // Add output params for each field so agents know what fields exist
        for (const field of obj.Fields) {
            params.push(this.FieldToOutputParam(field));
        }

        return this.BuildAction(config, obj, 'Get', displayName,
            `Retrieves a single ${displayName} record from ${config.IntegrationName} by its external ID`,
            params
        );
    }

    private BuildCreateAction(
        config: ActionGeneratorConfig,
        obj: IntegrationObjectInfo,
        displayName: string
    ): ActionRecord {
        const params: ActionParamRecord[] = [
            this.BuildSystemParam('CompanyIntegrationID', 'Input', false, 'Optional: specific CompanyIntegration to use'),
        ];

        // Input params for writable fields
        for (const field of obj.Fields) {
            if (field.IsReadOnly || field.IsPrimaryKey) continue;
            params.push(this.FieldToInputParam(field));
        }

        // Output
        params.push(this.BuildSystemParam('ExternalID', 'Output', false, `The external ID of the newly created ${displayName} record`));

        return this.BuildAction(config, obj, 'Create', displayName,
            `Creates a new ${displayName} record in ${config.IntegrationName}`,
            params
        );
    }

    private BuildUpdateAction(
        config: ActionGeneratorConfig,
        obj: IntegrationObjectInfo,
        displayName: string
    ): ActionRecord {
        const params: ActionParamRecord[] = [
            this.BuildSystemParam('ExternalID', 'Input', true, `The external ID of the ${displayName} record to update`),
            this.BuildSystemParam('CompanyIntegrationID', 'Input', false, 'Optional: specific CompanyIntegration to use'),
        ];

        // Input params for writable fields (none required — partial update)
        for (const field of obj.Fields) {
            if (field.IsReadOnly || field.IsPrimaryKey) continue;
            params.push(this.FieldToInputParam(field, false)); // Not required for updates
        }

        params.push(this.BuildSystemParam('ExternalID', 'Output', false, `The external ID of the updated record`));

        return this.BuildAction(config, obj, 'Update', displayName,
            `Updates an existing ${displayName} record in ${config.IntegrationName}. Only provided fields are changed.`,
            params
        );
    }

    private BuildDeleteAction(
        config: ActionGeneratorConfig,
        obj: IntegrationObjectInfo,
        displayName: string
    ): ActionRecord {
        const params: ActionParamRecord[] = [
            this.BuildSystemParam('ExternalID', 'Input', true, `The external ID of the ${displayName} record to delete`),
            this.BuildSystemParam('CompanyIntegrationID', 'Input', false, 'Optional: specific CompanyIntegration to use'),
        ];

        return this.BuildAction(config, obj, 'Delete', displayName,
            `Deletes (archives) a ${displayName} record from ${config.IntegrationName}`,
            params
        );
    }

    private BuildSearchAction(
        config: ActionGeneratorConfig,
        obj: IntegrationObjectInfo,
        displayName: string
    ): ActionRecord {
        const params: ActionParamRecord[] = [
            this.BuildSystemParam('CompanyIntegrationID', 'Input', false, 'Optional: specific CompanyIntegration to use'),
            this.BuildSystemParam('PageSize', 'Input', false, 'Maximum number of records to return (default: 100)'),
            this.BuildSystemParam('Page', 'Input', false, 'Page number for paginated results (1-based)'),
            this.BuildSystemParam('Sort', 'Input', false, 'Sort expression (connector-specific format)'),
        ];

        // Input params for searchable fields (all non-PK fields as optional filters)
        for (const field of obj.Fields) {
            if (field.IsPrimaryKey) continue;
            params.push(this.FieldToInputParam(field, false)); // All optional for search
        }

        // Outputs
        params.push(this.BuildSystemParam('Records', 'Output', false, `Array of matching ${displayName} records`));
        params.push(this.BuildSystemParam('TotalCount', 'Output', false, 'Total number of matching records'));
        params.push(this.BuildSystemParam('HasMore', 'Output', false, 'Whether more pages of results exist'));

        return this.BuildAction(config, obj, 'Search', displayName,
            `Searches for ${displayName} records in ${config.IntegrationName} matching the given field filters`,
            params
        );
    }

    private BuildListAction(
        config: ActionGeneratorConfig,
        obj: IntegrationObjectInfo,
        displayName: string
    ): ActionRecord {
        const params: ActionParamRecord[] = [
            this.BuildSystemParam('CompanyIntegrationID', 'Input', false, 'Optional: specific CompanyIntegration to use'),
            this.BuildSystemParam('PageSize', 'Input', false, 'Maximum number of records to return per page (default: 100)'),
            this.BuildSystemParam('Cursor', 'Input', false, 'Opaque cursor for fetching the next page (from previous ListResult)'),
            this.BuildSystemParam('Sort', 'Input', false, 'Sort expression (connector-specific format)'),
            this.BuildSystemParam('Records', 'Output', false, `Array of ${displayName} records in this page`),
            this.BuildSystemParam('HasMore', 'Output', false, 'Whether more pages of results exist'),
            this.BuildSystemParam('NextCursor', 'Output', false, 'Cursor to pass for the next page'),
            this.BuildSystemParam('TotalCount', 'Output', false, 'Total number of records, if known'),
        ];

        return this.BuildAction(config, obj, 'List', displayName,
            `Lists ${displayName} records from ${config.IntegrationName} with cursor-based pagination`,
            params
        );
    }

    // ─── Core Builders ───────────────────────────────────────────────

    private BuildAction(
        config: ActionGeneratorConfig,
        obj: IntegrationObjectInfo,
        verb: IntegrationActionVerb,
        displayName: string,
        description: string,
        params: ActionParamRecord[]
    ): ActionRecord {
        const actionConfig = {
            IntegrationName: config.IntegrationName,
            ObjectName: obj.Name,
            Verb: verb,
        };

        return {
            fields: {
                Name: `${config.IntegrationName} - ${verb} ${displayName}`,
                Description: description,
                Type: 'Custom',
                Status: 'Active',
                DriverClass: 'IntegrationActionExecutor',
                CategoryID: `@lookup:MJ: Action Categories.Name=${config.CategoryName}`,
                Config: JSON.stringify(actionConfig),
                IconClass: config.IconClass ?? 'fa-solid fa-plug',
            },
            relatedEntities: {
                'MJ: Action Params': params,
                'MJ: Action Result Codes': this.BuildStandardResultCodes(verb),
            },
        };
    }

    private BuildSystemParam(
        name: string,
        type: 'Input' | 'Output' | 'Both',
        isRequired: boolean,
        description: string
    ): ActionParamRecord {
        return {
            fields: {
                ActionID: '@parent:ID',
                Name: name,
                Type: type,
                ValueType: 'Scalar',
                IsArray: false,
                IsRequired: isRequired,
                Description: description,
            },
        };
    }

    private FieldToInputParam(field: IntegrationFieldInfo, requiredOverride?: boolean): ActionParamRecord {
        return {
            fields: {
                ActionID: '@parent:ID',
                Name: field.Name,
                Type: 'Input',
                ValueType: this.MapFieldTypeToValueType(field.Type),
                IsArray: false,
                IsRequired: requiredOverride ?? field.IsRequired,
                Description: field.Description || `${field.DisplayName || field.Name} field`,
            },
        };
    }

    private FieldToOutputParam(field: IntegrationFieldInfo): ActionParamRecord {
        return {
            fields: {
                ActionID: '@parent:ID',
                Name: field.Name,
                Type: 'Output',
                ValueType: this.MapFieldTypeToValueType(field.Type),
                IsArray: false,
                IsRequired: false,
                Description: field.Description || `${field.DisplayName || field.Name} value from the retrieved record`,
            },
        };
    }

    private BuildStandardResultCodes(verb: IntegrationActionVerb): ActionResultCodeRecord[] {
        const codes: ActionResultCodeRecord[] = [
            { fields: { ActionID: '@parent:ID', ResultCode: 'SUCCESS', IsSuccess: true, Description: `${verb} operation completed successfully` } },
            { fields: { ActionID: '@parent:ID', ResultCode: 'EXECUTOR_ERROR', IsSuccess: false, Description: 'Internal executor error' } },
        ];

        if (verb === 'Get') {
            codes.push({ fields: { ActionID: '@parent:ID', ResultCode: 'NOT_FOUND', IsSuccess: false, Description: 'Record not found' } });
        }
        if (verb === 'Create' || verb === 'Update' || verb === 'Delete') {
            codes.push({ fields: { ActionID: '@parent:ID', ResultCode: `${verb.toUpperCase()}_FAILED`, IsSuccess: false, Description: `${verb} operation failed` } });
            codes.push({ fields: { ActionID: '@parent:ID', ResultCode: 'NOT_SUPPORTED', IsSuccess: false, Description: `${verb} not supported by this connector` } });
        }

        return codes;
    }

    // ─── .mj-sync.json ──────────────────────────────────────────────

    private BuildSyncConfig(): Record<string, unknown> {
        return {
            entity: 'MJ: Actions',
            filePattern: '**/.*.json',
            defaults: {},
            pull: {
                createNewFileIfNotFound: true,
                newFileName: '.integration-actions.json',
                appendRecordsToExistingFile: true,
                updateExistingRecords: true,
                preserveFields: [],
                excludeFields: [],
                mergeStrategy: 'merge',
                backupBeforeUpdate: true,
                backupDirectory: '.backups',
                filter: '',
                externalizeFields: [],
                ignoreNullFields: true,
                ignoreVirtualFields: true,
                lookupFields: {
                    CategoryID: {
                        entity: 'MJ: Action Categories',
                        field: 'Name',
                    },
                },
                relatedEntities: {
                    'MJ: Action Params': {
                        entity: 'MJ: Action Params',
                        foreignKey: 'ActionID',
                    },
                    'MJ: Action Result Codes': {
                        entity: 'MJ: Action Result Codes',
                        foreignKey: 'ActionID',
                    },
                },
            },
        };
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    /** Converts a field data type to an ActionParam ValueType */
    private MapFieldTypeToValueType(fieldType: string): string {
        switch (fieldType.toLowerCase()) {
            case 'boolean':
            case 'number':
            case 'integer':
            case 'string':
            case 'text':
            case 'html':
            case 'datetime':
            case 'date':
            case 'enum':
                return 'Scalar';
            case 'object':
            case 'json':
                return 'Simple Object';
            default:
                return 'Scalar';
        }
    }

    /** Converts a snake_case or lowercase name to a human-readable form */
    private Humanize(name: string): string {
        return name
            .replace(/_/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/\b\w/g, c => c.toUpperCase());
    }
}
