/**
 * Registry of all TSQL → PostgreSQL conversion rules.
 * Import this to get the complete set of rules for the conversion pipeline.
 */
import type { IConversionRule } from './types.js';
import { CreateTableRule } from './CreateTableRule.js';
import { CatalogViewRule } from './CatalogViewRule.js';
import { ViewRule } from './ViewRule.js';
import { ProcedureToFunctionRule } from './ProcedureToFunctionRule.js';
import { FunctionRule } from './FunctionRule.js';
import { TriggerRule } from './TriggerRule.js';
import { InsertRule } from './InsertRule.js';
import { AlterTableRule } from './AlterTableRule.js';
import { CreateIndexRule } from './CreateIndexRule.js';
import { GrantRule } from './GrantRule.js';
import { ExtendedPropertyRule } from './ExtendedPropertyRule.js';
import { ConditionalDDLRule } from './ConditionalDDLRule.js';

/**
 * Get all TSQL → PostgreSQL conversion rules in priority order.
 */
export function getTSQLToPostgresRules(): IConversionRule[] {
  return [
    new CreateTableRule(),         // Priority 10
    new CatalogViewRule(),         // Priority 15 — catalog views (sys.* → pg_catalog)
    new ViewRule(),                // Priority 20
    new ProcedureToFunctionRule(), // Priority 30
    new FunctionRule(),            // Priority 35
    new TriggerRule(),             // Priority 40
    new InsertRule(),              // Priority 50
    new ConditionalDDLRule(),      // Priority 55
    new AlterTableRule(),          // Priority 60
    new CreateIndexRule(),         // Priority 70
    new GrantRule(),               // Priority 80
    new ExtendedPropertyRule(),    // Priority 90
  ];
}
