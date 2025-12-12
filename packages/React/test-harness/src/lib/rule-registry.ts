import { LintRule } from './lint-rule';

/**
 * Singleton registry for managing lint rules.
 * Provides centralized access to all registered lint rules.
 *
 * Phase 4A: Currently only manages runtime rules.
 * Future phases will add schema validation and other rule types.
 */
export class RuleRegistry {
  private static instance: RuleRegistry;
  private runtimeRules: LintRule[] = [];

  /**
   * Private constructor to enforce singleton pattern.
   */
  private constructor() {
    // Private constructor - use getInstance() instead
  }

  /**
   * Gets the singleton instance of the RuleRegistry.
   *
   * @returns The RuleRegistry instance
   */
  public static getInstance(): RuleRegistry {
    if (!RuleRegistry.instance) {
      RuleRegistry.instance = new RuleRegistry();
    }
    return RuleRegistry.instance;
  }

  /**
   * Registers a runtime rule with the registry.
   *
   * @param rule - The lint rule to register
   */
  public registerRuntimeRule(rule: LintRule): void {
    this.runtimeRules.push(rule);
  }

  /**
   * Registers multiple runtime rules at once.
   *
   * @param rules - Array of lint rules to register
   */
  public registerRuntimeRules(rules: LintRule[]): void {
    this.runtimeRules.push(...rules);
  }

  /**
   * Gets all registered runtime rules.
   *
   * @returns Array of all runtime rules
   */
  public getRuntimeRules(): LintRule[] {
    return [...this.runtimeRules]; // Return a copy to prevent external modification
  }

  /**
   * Clears all registered runtime rules.
   * Primarily used for testing.
   */
  public clearRuntimeRules(): void {
    this.runtimeRules = [];
  }

  /**
   * Gets a specific rule by name.
   *
   * @param name - Name of the rule to retrieve
   * @returns The rule if found, undefined otherwise
   */
  public getRuleByName(name: string): LintRule | undefined {
    return this.runtimeRules.find((rule) => rule.name === name);
  }

  /**
   * Checks if a rule with the given name is registered.
   *
   * @param name - Name of the rule to check
   * @returns true if the rule is registered, false otherwise
   */
  public hasRule(name: string): boolean {
    return this.runtimeRules.some((rule) => rule.name === name);
  }

  /**
   * Gets the total count of registered runtime rules.
   *
   * @returns Number of registered rules
   */
  public getRuleCount(): number {
    return this.runtimeRules.length;
  }
}
