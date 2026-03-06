import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { MJGlobal } from "@memberjunction/global";
import { Metadata } from "@memberjunction/core";

/**
 * Action that returns a lightweight list of all entities in the system.
 * Returns only entity name, schema name, and description - perfect for discovering
 * what entities exist before drilling into details with Explore Database Schema.
 *
 * This action is optimized for research agents that need to:
 * - Discover available entities without guessing names
 * - Get a quick overview of the data model
 * - Find entities by description/purpose
 * - Identify correct entity names before detailed exploration
 *
 * Features:
 * - Uses cached metadata (no database queries)
 * - Extremely fast and lightweight
 * - Optional schema filtering
 * - Optional scope filtering
 * - Sorted alphabetically for easy scanning
 *
 * @example
 * ```typescript
 * // Get all entities
 * await runAction({
 *   ActionName: 'Get Entity List'
 * });
 *
 * // Get only entities in specific schema
 * await runAction({
 *   ActionName: 'Get Entity List',
 *   Params: [{
 *     Name: 'SchemaFilter',
 *     Value: 'dbo'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Get Entity List")
export class GetEntityListAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract parameters
            const schemaFilter = this.getStringParam(params, "schemafilter");
            const scopeFilter = this.getStringParam(params, "scopefilter");
            const includeVirtualEntities = this.getBooleanParam(params, "includevirtualentities", true);

            const startTime = Date.now();

            // Get MJ metadata (cached, no DB queries)
            const md = new Metadata();
            let entities = md.Entities;

            // Apply filters
            if (schemaFilter) {
                const schemas = schemaFilter.split(',').map(s => s.trim().toLowerCase());
                entities = entities.filter(e => schemas.includes(e.SchemaName.toLowerCase()));
            }

            if (scopeFilter) {
                entities = entities.filter(e => {
                    if (!e.ScopeDefault) return true; // Include entities with no scope
                    const scopes = e.ScopeDefault.split(',').map(s => s.trim().toLowerCase());
                    return scopes.includes(scopeFilter.toLowerCase()) || scopes.includes('all');
                });
            }

            if (!includeVirtualEntities) {
                entities = entities.filter(e => !e.VirtualEntity);
            }

            // Build lightweight entity list (name, schema, description only)
            const entityList = entities.map(e => ({
                Name: e.Name,
                SchemaName: e.SchemaName,
                Description: e.Description || '',
                IsVirtual: e.VirtualEntity
            })).sort((a, b) => {
                // Sort by schema first, then by name
                if (a.SchemaName !== b.SchemaName) {
                    return a.SchemaName.localeCompare(b.SchemaName);
                }
                return a.Name.localeCompare(b.Name);
            });

            const executionTimeMs = Date.now() - startTime;

            // Build detailed message for agent consumption
            const message = this.buildDetailedMessage(entityList, schemaFilter, scopeFilter);

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: message,
                Entities: entityList,
                TotalCount: entityList.length,
                ExecutionTimeMs: executionTimeMs
            } as ActionResultSimple;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                Success: false,
                ResultCode: "LIST_FAILED",
                Message: `Entity list retrieval failed: ${errorMessage}`
            } as ActionResultSimple;
        }
    }

    /**
     * Build detailed message with entity list for agent consumption
     */
    private buildDetailedMessage(
        entities: Array<{ Name: string; SchemaName: string; Description: string; IsVirtual: boolean }>,
        schemaFilter?: string,
        scopeFilter?: string
    ): string {
        const lines: string[] = [];

        // Header
        lines.push(`# Entity List`);
        lines.push(`\nFound ${entities.length} entity(ies)`);

        if (schemaFilter) {
            lines.push(`Schema Filter: ${schemaFilter}`);
        }
        if (scopeFilter) {
            lines.push(`Scope Filter: ${scopeFilter}`);
        }

        lines.push(`\n---\n`);

        // Group by schema
        const schemas = [...new Set(entities.map(e => e.SchemaName))].sort();

        for (const schema of schemas) {
            const schemaEntities = entities.filter(e => e.SchemaName === schema);
            lines.push(`\n## Schema: ${schema} (${schemaEntities.length} entities)\n`);

            for (const entity of schemaEntities) {
                const virtualFlag = entity.IsVirtual ? ' [VIRTUAL]' : '';
                lines.push(`- **${entity.Name}**${virtualFlag}`);
                if (entity.Description) {
                    lines.push(`  ${entity.Description}`);
                }
            }
        }

        lines.push(`\n---`);
        lines.push(`\nUse "Explore Database Schema" action with EntityPattern parameter to get detailed field information for specific entities.`);

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