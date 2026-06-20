import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass, UUIDsEqual } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { MJGlobal } from "@memberjunction/global";
import { IMetadataProvider, LogError, Metadata, RunView, UserInfo } from "@memberjunction/core";
import type { IRunViewProvider } from "@memberjunction/core";

/**
 * Action that returns field details and sample data for a specific entity.
 * Perfect for understanding entity structure before writing queries.
 *
 * Returns:
 * - Field names, types, descriptions
 * - Sample data (top 3 rows by default, capped at 10; individual field values
 *   truncated to a few hundred characters to keep agent context bounded)
 * - Total row count
 * - Primary key information
 * - Related entity references
 *
 * This action uses RunView (cached metadata + query) - very fast and efficient.
 *
 * @example
 * ```typescript
 * // Get details for Customers entity
 * await runAction({
 *   ActionName: 'Get Entity Details',
 *   Params: [{
 *     Name: 'EntityName',
 *     Value: 'Customers'
 *   }]
 * });
 *
 * // Get more sample rows
 * await runAction({
 *   ActionName: 'Get Entity Details',
 *   Params: [{
 *     Name: 'EntityName',
 *     Value: 'Orders'
 *   }, {
 *     Name: 'SampleRowCount',
 *     Value: 10
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Get Entity Details")
export class GetEntityDetailsAction extends BaseAction {

    /**
     * Hard cap on sample rows regardless of what the caller requests. Sample data
     * exists to show an agent what real values look like — a handful of rows is
     * always enough, and large requests bloat agent conversation context.
     */
    private static readonly MAX_SAMPLE_ROWS = 10;

    /**
     * Maximum characters per field value in sample rows. Entities like AI Prompt
     * Runs carry multi-megabyte text/JSON columns; returning them untruncated has
     * blown LLM context limits (a single sample row can exceed 1MB).
     */
    private static readonly MAX_SAMPLE_FIELD_CHARS = 250;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const startTime = Date.now();

            // Extract parameters
            const entityName = this.getStringParam(params, "entityname");
            if (!entityName) {
                return {
                    Success: false,
                    ResultCode: "MISSING_ENTITY_NAME",
                    Message: "EntityName parameter is required"
                } as ActionResultSimple;
            }

            const requestedSampleRows = this.getNumericParam(params, "samplerowcount", 3);
            const sampleRowCount = Math.min(Math.max(0, requestedSampleRows), GetEntityDetailsAction.MAX_SAMPLE_ROWS);
            const includeRelatedEntityInfo = this.getBooleanParam(params, "includerelatedentityinfo", true);
            const useSemanticSearch = this.getBooleanParam(params, "usesemanticsearch", false);

            // Get entity metadata
            const md = params.Provider ?? new Metadata();
            const entity = md.EntityByName(entityName);

            if (!entity) {
                return {
                    Success: false,
                    ResultCode: "ENTITY_NOT_FOUND",
                    Message: await this.buildEntityNotFoundMessage(entityName, md, useSemanticSearch, params.ContextUser)
                } as ActionResultSimple;
            }

            // Build field information
            const fields = entity.Fields.map(f => ({
                Name: f.Name,
                DisplayName: f.DisplayName,
                Type: f.Type,
                SQLFullType: f.SQLFullType,
                Description: f.Description || '',
                IsPrimaryKey: f.IsPrimaryKey,
                IsNameField: f.IsNameField,
                AllowsNull: f.AllowsNull,
                DefaultValue: f.DefaultValue,
                RelatedEntity: f.RelatedEntity || null,
                RelatedEntityFieldName: f.RelatedEntityFieldName || null,
                ValueListType: f.ValueListType,
                HasValueList: f.EntityFieldValues && f.EntityFieldValues.length > 0,
                ValueListValues: f.EntityFieldValues && f.EntityFieldValues.length > 0
                    ? f.EntityFieldValues.map(v => v.Value).join(', ')
                    : null
            }));

            // Get sample data and total count using RunView
            let sampleData: any[] = [];
            let totalRowCount = undefined;
            if (sampleRowCount && sampleRowCount > 0) {
                const rv = new RunView();
                const result = await rv.RunView({
                    EntityName: entity.Name,
                    MaxRows: sampleRowCount,
                    ResultType: 'simple'
                }, params.ContextUser);

                if (!result.Success) {
                    return {
                        Success: false,
                        ResultCode: "SAMPLE_DATA_FAILED",
                        Message: `Failed to retrieve sample data: ${result.ErrorMessage}`
                    } as ActionResultSimple;
                }

                // Ensure we only return the requested number of rows, with large
                // field values truncated so sample data can't blow out context
                const allResults = result.Results || [];
                sampleData = allResults.slice(0, sampleRowCount).map(row => this.truncateRowValues(row));
                totalRowCount = result.TotalRowCount || 0;
            }

            // Build primary key info
            const primaryKeyFields = fields.filter(f => f.IsPrimaryKey).map(f => f.Name);

            // Build related entity info (if requested)
            let relatedEntities: any[] = [];
            if (includeRelatedEntityInfo) {
                const relatedEntityNames = new Set(
                    fields
                        .filter(f => f.RelatedEntity)
                        .map(f => f.RelatedEntity!)
                );
                relatedEntities = Array.from(relatedEntityNames).map(name => ({
                    // Look up the related entity's ID from metadata so callers
                    // get `{ ID, Name }` pairs ready to drop into
                    // `permissions.allowedEntities` for Runtime actions. Null
                    // only if the FK references an entity the metadata cache
                    // hasn't indexed — shouldn't happen in practice.
                    ID: md.EntityByName(name)?.ID ?? null,
                    Name: name,
                    FieldsReferencingThis: fields
                        .filter(f => f.RelatedEntity === name)
                        .map(f => f.Name)
                }));
            }

            const executionTimeMs = Date.now() - startTime;

            // Build detailed message
            const message = this.buildDetailedMessage(
                entity,
                fields,
                sampleData,
                totalRowCount,
                primaryKeyFields,
                relatedEntities
            );

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: message,
                // Named `ID` (not `EntityID`) to match the actual column on
                // the Entity record. Callers that need to build Runtime
                // action permission blocks (`{ id, name }` pairs for every
                // referenced entity) read this directly — no second lookup.
                ID: entity.ID,
                EntityName: entity.Name,
                SchemaName: entity.SchemaName,
                Description: entity.Description,
                BaseView: entity.BaseView,
                IsVirtual: entity.VirtualEntity,
                Fields: fields,
                PrimaryKeyFields: primaryKeyFields,
                RelatedEntities: relatedEntities,
                SampleData: sampleData,
                TotalRowCount: totalRowCount,
                SampleRowCount: sampleData.length,
                ExecutionTimeMs: executionTimeMs
            } as ActionResultSimple;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                Success: false,
                ResultCode: "DETAILS_FAILED",
                Message: `Entity details retrieval failed: ${errorMessage}`
            } as ActionResultSimple;
        }
    }

    /**
     * Truncate oversized string values in a sample row so entities with huge
     * text/JSON columns (LLM transcripts, payloads, etc.) return useful but
     * bounded sample data.
     */
    private truncateRowValues(row: Record<string, unknown>): Record<string, unknown> {
        const maxChars = GetEntityDetailsAction.MAX_SAMPLE_FIELD_CHARS;
        const truncated: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
            if (typeof value === 'string' && value.length > maxChars) {
                truncated[key] = `${value.substring(0, maxChars)}… [truncated, ${value.length.toLocaleString()} chars total]`;
            } else {
                truncated[key] = value;
            }
        }
        return truncated;
    }

    /**
     * Build an ENTITY_NOT_FOUND message that suggests close matches. Agents
     * commonly pass display-style names (e.g., 'AI Agents') when the real
     * entity name carries an 'MJ: ' prefix ('MJ: AI Agents') — pointing at the
     * exact candidates lets them recover in one step instead of guessing.
     *
     * When substring matching finds nothing and `useSemanticSearch` is enabled,
     * falls back to ranked entity search over 'MJ: Entities' to surface
     * conceptually related entities (e.g., 'Customers' → 'Accounts').
     */
    private async buildEntityNotFoundMessage(
        entityName: string,
        md: IMetadataProvider | Metadata,
        useSemanticSearch: boolean,
        contextUser?: UserInfo
    ): Promise<string> {
        const needle = entityName.trim().toLowerCase();
        const suggestions = md.Entities
            .filter(e => {
                const name = e.Name.toLowerCase();
                const displayName = (e.DisplayName || '').toLowerCase();
                return name.includes(needle) || needle.includes(name) || displayName === needle;
            })
            .slice(0, 5)
            .map(e => `'${e.Name}'`);

        const base = `Entity '${entityName}' not found.`;
        if (suggestions.length > 0) {
            return `${base} Did you mean: ${suggestions.join(', ')}? Entity names must match exactly, including any 'MJ: ' prefix.`;
        }

        if (useSemanticSearch) {
            const semanticSuggestions = await this.findSemanticEntitySuggestions(entityName, md, contextUser);
            if (semanticSuggestions.length > 0) {
                return `${base} No close name matches — semantically related entities: ${semanticSuggestions.join(', ')}. Entity names must match exactly, including any 'MJ: ' prefix.`;
            }
        }
        return `${base} Entity names must match exactly, including any 'MJ: ' prefix. Use the 'Get Entity List' action (if available) or your entity catalog to find the correct name.`;
    }

    /**
     * Ranked search over the 'MJ: Entities' records to find entities that are
     * conceptually related to the requested name. Best-effort: returns an empty
     * array if the search index isn't configured or the search fails — the
     * caller falls back to the generic guidance message.
     */
    private async findSemanticEntitySuggestions(
        entityName: string,
        md: IMetadataProvider | Metadata,
        contextUser?: UserInfo
    ): Promise<string[]> {
        try {
            // SearchEntity is declared on IRunViewProvider; every real provider
            // (and the Metadata facade) implements both provider interfaces, so
            // this cast follows the same pattern as SearchEntityAction.
            const searchProvider = md as unknown as IRunViewProvider;
            if (typeof searchProvider.SearchEntity !== 'function') {
                return [];
            }
            const results = await searchProvider.SearchEntity({
                entityName: 'MJ: Entities',
                searchText: entityName,
                options: {
                    mode: 'hybrid',
                    topK: 3,
                    contextUser
                }
            });
            return results
                .map(r => md.Entities.find(e => UUIDsEqual(e.ID, r.recordId)))
                .filter(e => e != null)
                .map(e => `'${e.Name}'`);
        } catch (error) {
            LogError(`Get Entity Details: semantic entity suggestion search failed: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /**
     * Build detailed message with entity information for agent consumption
     */
    private buildDetailedMessage(
        entity: any,
        fields: any[],
        sampleData: any[],
        totalRowCount: number,
        primaryKeyFields: string[],
        relatedEntities: any[]
    ): string {
        const lines: string[] = [];

        // Header
        lines.push(`# Entity Details: ${entity.Name}`);
        lines.push(`\n**ID:** \`${entity.ID}\``);
        lines.push(`**Schema:** ${entity.SchemaName}`);
        lines.push(`**Base View:** ${entity.BaseView}`);
        if (entity.Description) {
            lines.push(`**Description:** ${entity.Description}`);
        }
        lines.push(`**Virtual Entity:** ${entity.VirtualEntity ? 'Yes' : 'No'}`);
        lines.push(`**Total Rows:** ${totalRowCount.toLocaleString()}`);
        lines.push(`\n---\n`);

        // Primary Keys
        if (primaryKeyFields.length > 0) {
            lines.push(`## Primary Key${primaryKeyFields.length > 1 ? 's' : ''}`);
            lines.push(primaryKeyFields.map(f => `- ${f}`).join('\n'));
            lines.push('');
        }

        // Fields
        lines.push(`## Fields (${fields.length})\n`);
        for (const field of fields) {
            const parts: string[] = [`- **${field.Name}**`];

            if (field.DisplayName && field.DisplayName !== field.Name) {
                parts.push(`(${field.DisplayName})`);
            }

            parts.push(`\`${field.SQLFullType}\``);

            const attributes: string[] = [];
            if (field.IsPrimaryKey) attributes.push('PK');
            if (field.IsNameField) attributes.push('NAME FIELD');
            if (!field.AllowsNull) attributes.push('NOT NULL');
            if (field.DefaultValue) attributes.push(`Default: ${field.DefaultValue}`);

            if (attributes.length > 0) {
                parts.push(`[${attributes.join(', ')}]`);
            }

            lines.push(parts.join(' '));

            if (field.Description) {
                lines.push(`  *${field.Description}*`);
            }

            if (field.RelatedEntity) {
                lines.push(`  → References: **${field.RelatedEntity}**.${field.RelatedEntityFieldName || 'ID'}`);
            }

            if (field.HasValueList) {
                lines.push(`  Allowed Values: ${field.ValueListValues}`);
            }

            lines.push('');
        }

        // Related Entities
        if (relatedEntities.length > 0) {
            lines.push(`## Related Entities (${relatedEntities.length})\n`);
            for (const rel of relatedEntities) {
                const idSuffix = rel.ID ? ` — \`${rel.ID}\`` : '';
                lines.push(`- **${rel.Name}**${idSuffix} (via ${rel.FieldsReferencingThis.join(', ')})`);
            }
            lines.push('');
        }

        // Sample Data
        if (sampleData.length > 0) {
            lines.push(`## Sample Data (${sampleData.length} of ${totalRowCount} total rows)\n`);
            lines.push('```json');
            lines.push(JSON.stringify(sampleData, null, 2));
            lines.push('```');
        } else {
            lines.push(`## Sample Data\n*No data available (empty table)*`);
        }

        lines.push(`\n---`);
        lines.push(`\n**Use this information to write accurate SQL queries using the correct field names and types.**`);

        return lines.join('\n');
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