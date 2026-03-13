/**
 * Central registry for SQL conversion rules.
 * Supports multiple source->target dialect combinations.
 * Rules self-register via their SourceDialect/TargetDialect properties.
 */
import type { IConversionRule } from './types.js';

/**
 * Represents a registered dialect combination (source -> target).
 */
export interface DialectCombination {
  Source: string;
  Target: string;
}

/** Build a map key from source and target dialects */
function dialectKey(source: string, target: string): string {
  return `${source.toLowerCase()}->${target.toLowerCase()}`;
}

/**
 * Central registry for SQL conversion rules.
 *
 * Rules self-register via their SourceDialect/TargetDialect properties.
 * The registry supports multiple source->target dialect combinations
 * and returns rules sorted by priority (lower = first).
 */
export class RuleRegistry {
  private static rules: Map<string, IConversionRule[]> = new Map();

  /**
   * Register a single rule for its declared dialect combination.
   */
  static Register(rule: IConversionRule): void {
    const key = dialectKey(rule.SourceDialect, rule.TargetDialect);
    let bucket = RuleRegistry.rules.get(key);
    if (!bucket) {
      bucket = [];
      RuleRegistry.rules.set(key, bucket);
    }
    bucket.push(rule);
  }

  /**
   * Register multiple rules at once.
   */
  static RegisterAll(rules: IConversionRule[]): void {
    for (const rule of rules) {
      RuleRegistry.Register(rule);
    }
  }

  /**
   * Get all rules for a source->target combination, sorted by priority (ascending).
   */
  static GetRules(sourceDialect: string, targetDialect: string): IConversionRule[] {
    const key = dialectKey(sourceDialect, targetDialect);
    const bucket = RuleRegistry.rules.get(key);
    if (!bucket) return [];
    return [...bucket].sort((a, b) => a.Priority - b.Priority);
  }

  /**
   * Get all registered dialect combinations.
   */
  static GetRegisteredCombinations(): DialectCombination[] {
    const result: DialectCombination[] = [];
    for (const key of RuleRegistry.rules.keys()) {
      const [source, target] = key.split('->');
      result.push({ Source: source, Target: target });
    }
    return result;
  }

  /**
   * Check if rules exist for a dialect combination.
   */
  static HasRules(sourceDialect: string, targetDialect: string): boolean {
    const key = dialectKey(sourceDialect, targetDialect);
    const bucket = RuleRegistry.rules.get(key);
    return bucket != null && bucket.length > 0;
  }

  /**
   * Clear all registered rules (mainly for testing).
   */
  static Clear(): void {
    RuleRegistry.rules.clear();
  }
}
