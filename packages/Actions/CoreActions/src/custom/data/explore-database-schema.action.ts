import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { MJGlobal } from "@memberjunction/global";
import { Metadata, EntityInfo, EntityFieldInfo, EntityRelationshipInfo } from "@memberjunction/core";

/**
 * Action that retrieves comprehensive database schema information using MemberJunction's
 * rich metadata layer instead of raw INFORMATION_SCHEMA queries.
 *
 * This action provides research agents with deep understanding of the data model including:
 * - Business context (descriptions, display names)
 * - Field metadata (types, defaults, value lists, related entities)
 * - Semantic relationships (not just foreign keys)
 * - Virtual entities (logical, not physical)
 * - API permissions and settings
 * - Audit configuration
 * - UI display preferences
 *
 * Features:
 * - Entity name pattern filtering with wildcards
 * - Schema filtering (focus on specific schemas)
 * - Optional field details with rich metadata
 * - Optional relationship information with semantic meaning
 * - Optional permission information
 * - Virtual entity support
 * - Scope-based filtering
 * - Configurable output size limits
 *
 * @example
 * ```typescript
 * // Get all customer-related entities with full metadata
 * await runAction({
 *   ActionName: 'Explore Database Schema',
 *   Params: [{
 *     Name: 'EntityPattern',
 *     Value: '%Customer%'
 *   }, {
 *     Name: 'IncludeFields',
 *     Value: true
 *   }, {
 *     Name: 'IncludeRelationships',
 *     Value: true
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Explore Database Schema")
export class ExploreDatabaseSchemaAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract parameters
            const entityPattern = this.getStringParam(params, "entitypattern");
            const schemaFilter = this.getStringParam(params, "schemafilter");
            const includeFields = this.getBooleanParam(params, "includefields", true);
            const includeRelationships = this.getBooleanParam(params, "includerelationships", true);
            const includePermissions = this.getBooleanParam(params, "includepermissions", false);
            const includeVirtualEntities = this.getBooleanParam(params, "includevirtualentities", true);
            const maxEntities = this.getNumericParam(params, "maxentities", 100);
            const scopeFilter = this.getStringParam(params, "scopefilter");

            const startTime = Date.now();

            // Get MJ metadata
            const md = new Metadata();
            let entities = md.Entities;

            // Apply filters
            entities = this.filterEntities(entities, {
                entityPattern,
                schemaFilter,
                includeVirtualEntities,
                scopeFilter,
                maxEntities
            });

            if (entities.length === 0) {
                return {
                    Success: false,
                    ResultCode: "NO_ENTITIES_FOUND",
                    Message: "No entities match the specified filter criteria"
                } as ActionResultSimple;
            }

            // Build result objects
            const formattedEntities = entities.map(entity =>
                this.formatEntityInfo(entity, {
                    includeFields,
                    includeRelationships,
                    includePermissions
                })
            );

            // Group by schema
            const schemas = this.groupBySchema(formattedEntities);

            // Calculate summary
            const summary = this.calculateSummary(formattedEntities);

            const executionTimeMs = Date.now() - startTime;

            // Build result message
            let message = `Found ${formattedEntities.length} entity(ies) across ${schemas.length} schema(s)`;
            if (includeFields) {
                message += `, ${summary.TotalFields} total fields`;
            }
            if (includeRelationships) {
                message += `, ${summary.TotalRelationships} relationships`;
            }

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: message,
                Entities: formattedEntities,
                Schemas: schemas,
                EntitySummary: summary,
                ExecutionTimeMs: executionTimeMs
            } as ActionResultSimple;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                Success: false,
                ResultCode: "EXPLORATION_FAILED",
                Message: `Schema exploration failed: ${errorMessage}`
            } as ActionResultSimple;
        }
    }

    /**
     * Filter entities based on parameters
     */
    private filterEntities(
        entities: EntityInfo[],
        filters: {
            entityPattern?: string;
            schemaFilter?: string;
            includeVirtualEntities: boolean;
            scopeFilter?: string;
            maxEntities: number;
        }
    ): EntityInfo[] {
        return entities.filter(entity => {
            // Entity name pattern filter (supports wildcards % and *)
            if (filters.entityPattern) {
                if (!this.matchesPattern(entity.Name, filters.entityPattern)) {
                    return false;
                }
            }

            // Schema filter (comma-separated list)
            if (filters.schemaFilter) {
                const schemas = filters.schemaFilter.split(',').map(s => s.trim().toLowerCase());
                if (!schemas.includes(entity.SchemaName.toLowerCase())) {
                    return false;
                }
            }

            // Virtual entity filter
            if (!filters.includeVirtualEntities && entity.VirtualEntity) {
                return false;
            }

            // Scope filter
            if (filters.scopeFilter && entity.ScopeDefault) {
                const scopes = entity.ScopeDefault.split(',').map(s => s.trim().toLowerCase());
                if (!scopes.includes(filters.scopeFilter.toLowerCase()) && !scopes.includes('all')) {
                    return false;
                }
            }

            return true;
        }).slice(0, filters.maxEntities);
    }

    /**
     * Check if entity name matches pattern (supports % and * wildcards)
     */
    private matchesPattern(name: string, pattern: string): boolean {
        // Convert SQL-style % wildcards to regex-style .*
        // Also support * as wildcard
        const regexPattern = pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
            .replace(/%/g, '.*')  // Convert % to .*
            .replace(/\*/g, '.*'); // Convert * to .*

        const regex = new RegExp(`^${regexPattern}$`, 'i');
        return regex.test(name);
    }

    /**
     * Format EntityInfo into research-friendly structure
     */
    private formatEntityInfo(
        entity: EntityInfo,
        options: {
            includeFields: boolean;
            includeRelationships: boolean;
            includePermissions: boolean;
        }
    ): Record<string, any> {
        const result: Record<string, any> = {
            ID: entity.ID,
            Name: entity.Name,
            DisplayName: entity.DisplayName || entity.Name,
            Description: entity.Description,
            SchemaName: entity.SchemaName,
            BaseTable: entity.BaseTable,
            BaseView: entity.BaseView,
            IsVirtual: entity.VirtualEntity,
            Icon: entity.Icon,

            // API Settings
            APISettings: {
                IncludeInAPI: entity.IncludeInAPI,
                AllowCreateAPI: entity.AllowCreateAPI,
                AllowUpdateAPI: entity.AllowUpdateAPI,
                AllowDeleteAPI: entity.AllowDeleteAPI,
                AllowUserSearchAPI: entity.AllowUserSearchAPI,
                AllowAllRowsAPI: entity.AllowAllRowsAPI,
                CustomResolverAPI: entity.CustomResolverAPI
            },

            // Audit Settings
            AuditSettings: {
                TrackRecordChanges: entity.TrackRecordChanges,
                AuditRecordAccess: entity.AuditRecordAccess,
                AuditViewRuns: entity.AuditViewRuns
            },

            // Search Settings
            SearchSettings: {
                FullTextSearchEnabled: entity.FullTextSearchEnabled,
                FullTextCatalog: entity.FullTextCatalog,
                FullTextIndex: entity.FullTextIndex
            },

            // Other Settings
            AllowRecordMerge: entity.AllowRecordMerge,
            CascadeDeletes: entity.CascadeDeletes,
            DeleteType: entity.DeleteType,
            UserViewMaxRows: entity.UserViewMaxRows,
            ScopeDefault: entity.ScopeDefault
        };

        // Include fields if requested
        if (options.includeFields && entity.Fields) {
            result.Fields = entity.Fields.map(field => this.formatFieldInfo(field));
            result.FieldCount = result.Fields.length;
        }

        // Include relationships if requested
        if (options.includeRelationships && entity.RelatedEntities) {
            result.Relationships = entity.RelatedEntities.map(rel => this.formatRelationshipInfo(rel));
            result.RelationshipCount = result.Relationships.length;
        }

        // Include permissions if requested
        if (options.includePermissions && entity.Permissions) {
            result.Permissions = entity.Permissions.map(perm => ({
                Role: perm.Role,
                RoleSQLName: perm.RoleSQLName,
                CanCreate: perm.CanCreate,
                CanRead: perm.CanRead,
                CanUpdate: perm.CanUpdate,
                CanDelete: perm.CanDelete
            }));
            result.PermissionCount = result.Permissions.length;
        }

        return result;
    }

    /**
     * Format EntityFieldInfo into research-friendly structure
     */
    private formatFieldInfo(field: EntityFieldInfo): Record<string, any> {
        const fieldInfo: Record<string, any> = {
            Name: field.Name,
            DisplayName: field.DisplayName || field.Name,
            Description: field.Description,
            Type: field.Type,
            Length: field.Length,
            Precision: field.Precision,
            Scale: field.Scale,
            AllowsNull: field.AllowsNull,
            DefaultValue: field.DefaultValue,
            IsPrimaryKey: field.IsPrimaryKey,
            IsUnique: field.IsUnique,
            IsNameField: field.IsNameField,
            IsVirtual: field.IsVirtual,
            AutoIncrement: field.AutoIncrement,
            Category: field.Category,

            // Related entity info (for foreign keys)
            RelatedEntity: field.RelatedEntity,
            RelatedEntityFieldName: field.RelatedEntityFieldName,
            RelatedEntityDisplayType: field.RelatedEntityDisplayType,

            // Value list (for dropdowns/validation)
            ValueListType: field.ValueListType,

            // API settings
            AllowUpdateAPI: field.AllowUpdateAPI,
            AllowUpdateInView: field.AllowUpdateInView,
            IncludeInUserSearchAPI: field.IncludeInUserSearchAPI,
            FullTextSearchEnabled: field.FullTextSearchEnabled,

            // UI settings
            DefaultInView: field.DefaultInView,
            IncludeInGeneratedForm: field.IncludeInGeneratedForm,
            GeneratedFormSection: field.GeneratedFormSection,
            DefaultColumnWidth: field.DefaultColumnWidth,

            // Scope
            ScopeDefault: field.ScopeDefault,
            Status: field.Status
        };

        // Include value list values if available
        if (field.EntityFieldValues && field.EntityFieldValues.length > 0) {
            fieldInfo.EntityFieldValues = field.EntityFieldValues.map(v => ({
                Value: v.Value,
                Code: v.Code,
                Description: v.Description,
                Sequence: v.Sequence
            }));
        }

        return fieldInfo;
    }

    /**
     * Format EntityRelationshipInfo into research-friendly structure
     */
    private formatRelationshipInfo(rel: EntityRelationshipInfo): Record<string, any> {
        return {
            ID: rel.ID,
            Type: rel.Type,
            RelatedEntity: rel.RelatedEntity,
            RelatedEntityClassName: rel.RelatedEntityClassName,
            EntityKeyField: rel.EntityKeyField,
            RelatedEntityJoinField: rel.RelatedEntityJoinField,
            DisplayName: rel.DisplayName,
            DisplayInForm: rel.DisplayInForm,
            DisplayLocation: rel.DisplayLocation,
            BundleInAPI: rel.BundleInAPI,
            IncludeInParentAllQuery: rel.IncludeInParentAllQuery,
            Sequence: rel.Sequence
        };
    }

    /**
     * Group entities by schema name
     */
    private groupBySchema(entities: Record<string, any>[]): Record<string, any>[] {
        const schemaMap: Record<string, any> = {};

        for (const entity of entities) {
            const schemaName = entity.SchemaName;

            if (!schemaMap[schemaName]) {
                schemaMap[schemaName] = {
                    SchemaName: schemaName,
                    Entities: [],
                    EntityCount: 0,
                    VirtualEntityCount: 0,
                    PhysicalEntityCount: 0
                };
            }

            schemaMap[schemaName].Entities.push(entity);
            schemaMap[schemaName].EntityCount++;

            if (entity.IsVirtual) {
                schemaMap[schemaName].VirtualEntityCount++;
            } else {
                schemaMap[schemaName].PhysicalEntityCount++;
            }
        }

        return Object.values(schemaMap).sort((a, b) =>
            a.SchemaName.localeCompare(b.SchemaName)
        );
    }

    /**
     * Calculate summary statistics
     */
    private calculateSummary(
        formattedEntities: Record<string, any>[]
    ): Record<string, any> {
        const summary: Record<string, any> = {
            TotalEntities: formattedEntities.length,
            PhysicalEntities: formattedEntities.filter(e => !e.IsVirtual).length,
            VirtualEntities: formattedEntities.filter(e => e.IsVirtual).length,
            TotalFields: 0,
            TotalRelationships: 0,
            SchemaList: [...new Set(formattedEntities.map(e => e.SchemaName))].sort(),
            EntitiesWithAPI: formattedEntities.filter(e => e.APISettings.IncludeInAPI).length,
            EntitiesWithFullTextSearch: formattedEntities.filter(e => e.SearchSettings.FullTextSearchEnabled).length,
            EntitiesWithAudit: formattedEntities.filter(e => e.AuditSettings.TrackRecordChanges).length
        };

        // Count fields and relationships if included
        for (const entity of formattedEntities) {
            if (entity.FieldCount != null) {
                summary.TotalFields += entity.FieldCount;
            }
            if (entity.RelationshipCount != null) {
                summary.TotalRelationships += entity.RelationshipCount;
            }
        }

        return summary;
    }

    /**
     * Helper to get string parameter value
     */
    private getStringParam(params: RunActionParams, paramName: string): string | undefined {
        const param = params.Params.find(p =>
            p.Name.toLowerCase() === paramName.toLowerCase() &&
            p.Type === 'Input'
        );
        return param?.Value ? String(param.Value) : undefined;
    }

    /**
     * Helper to get numeric parameter value
     */
    private getNumericParam(params: RunActionParams, paramName: string, defaultValue: number): number {
        const param = params.Params.find(p =>
            p.Name.toLowerCase() === paramName.toLowerCase() &&
            p.Type === 'Input'
        );
        if (param?.Value != null) {
            const num = Number(param.Value);
            return isNaN(num) ? defaultValue : num;
        }
        return defaultValue;
    }

    /**
     * Helper to get boolean parameter value
     */
    private getBooleanParam(params: RunActionParams, paramName: string, defaultValue: boolean): boolean {
        const param = params.Params.find(p =>
            p.Name.toLowerCase() === paramName.toLowerCase() &&
            p.Type === 'Input'
        );
        if (param?.Value != null) {
            const val = String(param.Value).toLowerCase();
            if (val === 'true' || val === '1' || val === 'yes') return true;
            if (val === 'false' || val === '0' || val === 'no') return false;
        }
        return defaultValue;
    }
}

/**
 * Load function to ensure the class is registered and not tree-shaken
 */
export function LoadExploreDatabaseSchemaAction() {
    MJGlobal.Instance.ClassFactory.GetRegistration(BaseAction, "Explore Database Schema");
}
