import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { MJGlobal } from "@memberjunction/global";
import { Metadata, RunView } from "@memberjunction/core";

/**
 * Action that returns field details and sample data for a specific entity.
 * Perfect for understanding entity structure before writing queries.
 *
 * Returns:
 * - Field names, types, descriptions
 * - Sample data (top 3 rows by default)
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

            const sampleRowCount = this.getNumericParam(params, "samplerowcount", 3);
            const includeRelatedEntityInfo = this.getBooleanParam(params, "includerelatedentityinfo", true);

            // Get entity metadata
            const md = new Metadata();
            const entity = md.Entities.find(e =>
                e.Name.toLowerCase() === entityName.toLowerCase()
            );

            if (!entity) {
                return {
                    Success: false,
                    ResultCode: "ENTITY_NOT_FOUND",
                    Message: `Entity '${entityName}' not found. Use 'Get Entity List' action to see available entities.`
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

                // Ensure we only return the requested number of rows
                const allResults = result.Results || [];
                sampleData = allResults.slice(0, sampleRowCount);
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
        lines.push(`\n**Schema:** ${entity.SchemaName}`);
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
                lines.push(`- **${rel.Name}** (via ${rel.FieldsReferencingThis.join(', ')})`);
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