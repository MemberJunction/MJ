/**
 * Registry of all TSQL -> PostgreSQL conversion rules.
 *
 * Rules are auto-registered with the central RuleRegistry when this module loads.
 * Use getTSQLToPostgresRules() for backward compatibility or
 * getRulesForDialects() / RuleRegistry.GetRules() for the extensible API.
 */
import type { IConversionRule } from './types.js';
import { RuleRegistry } from './RuleRegistry.js';
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
import { ExecBlockRule } from './ExecBlockRule.js';

/** Singleton set of T-SQL -> Postgres rules, created once at module load */
const tsqlToPostgresRules: IConversionRule[] = [
  new CreateTableRule(),         // Priority 10
  new CatalogViewRule(),         // Priority 15 — catalog views (sys.* -> pg_catalog)
  new ViewRule(),                // Priority 20
  new ProcedureToFunctionRule(), // Priority 30
  new FunctionRule(),            // Priority 35
  new TriggerRule(),             // Priority 40
  new InsertRule(),              // Priority 50
  new ExecBlockRule(),           // Priority 52 — DECLARE/SET/EXEC metadata sync
  new ConditionalDDLRule(),      // Priority 55
  new AlterTableRule(),          // Priority 60
  new CreateIndexRule(),         // Priority 70
  new GrantRule(),               // Priority 80
  new ExtendedPropertyRule(),    // Priority 90
];

// Auto-register with the central RuleRegistry on module load
RuleRegistry.RegisterAll(tsqlToPostgresRules);

/**
 * Get all TSQL -> PostgreSQL conversion rules in priority order.
 * Backward-compatible entry point.
 */
export function getTSQLToPostgresRules(): IConversionRule[] {
  return [...tsqlToPostgresRules];
}

/**
 * Get rules for a source->target dialect combination.
 *
 * Uses the RuleRegistry for lookups, which supports any registered dialect pair.
 * Falls back to the legacy getTSQLToPostgresRules() if the registry has no
 * rules for the requested combination (backward compatibility).
 */
export function getRulesForDialects(from: string, to: string): IConversionRule[] {
  // Try the registry first — supports extensible dialect combinations
  if (RuleRegistry.HasRules(from, to)) {
    return RuleRegistry.GetRules(from, to);
  }

  // Backward compatibility: if someone asks for tsql->postgres before
  // the module has loaded, fall back to the direct array
  if (from === 'tsql' && to === 'postgres') {
    return [...tsqlToPostgresRules];
  }

  return [];
}
